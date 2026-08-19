const memberRepository = require('./member.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')
const { resolvePeriodRange } = require('../../shared/utils/period-range')
const { toAttendanceDay } = require('../attendance/attendance.mapper')

// groups is flattened to a plain array of { id, role }, and the raw FK ids
// are dropped since the nested status/level/lighthouseGroup objects replace
// them.
function toMemberResponse(member) {
  const { statusId: _statusId, levelId: _levelId, lighthouseGroupId: _lighthouseGroupId, groups, attendances, ...rest } = member

  return {
    ...rest,
    groups: groups.map(({ group }) => group),
    ...(attendances !== undefined
      ? { attendances: attendances.map(toAttendanceDay) }
      : {}),
  }
}

async function listMembers(query) {
  const { page, limit, skip } = getPagination(query)
  const { search, status, levelId, from, to } = query

  const [members, total] = await Promise.all([
    memberRepository.findMany({ skip, limit, search, status, levelId, from, to }),
    memberRepository.count({ search, status, levelId, from, to }),
  ])

  return {
    items: members.map(toMemberResponse),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getBreakdown(query) {
  const { search, status, from, to } = query
  // Aggregated in SQL; response shape stays { total, breakdown: [{ status, count, percentage }] }.
  return memberRepository.summarizeBreakdownByStatus({ search, status, from, to })
}

async function getMemberById(id, query = {}) {
  const { page, limit, skip } = getPagination(query)

  const [member, attendances, attendanceTotal] = await Promise.all([
    memberRepository.findById(id),
    memberRepository.findAttendancesByMemberId(id, { skip, limit }),
    memberRepository.countAttendancesByMemberId(id),
  ])

  if (!member) {
    throw AppError.notFound('Member not found')
  }

  // Attendances stay on the member object; pagination is via query + response meta.
  return {
    member: toMemberResponse({ ...member, attendances }),
    meta: buildMeta({ page, limit, total: attendanceTotal }),
  }
}

function toAmountNumber(decimalValue) {
  return decimalValue ? Number(decimalValue) : 0
}

// One row per offering-type line item so the list matches how offerings are
// displayed. Transactions recorded without a breakdown still yield a single
// row with a null offeringType.
function toOfferingRows(transaction) {
  const note = transaction.description ?? null

  if (transaction.items.length === 0) {
    return [
      {
        id: transaction.id,
        transactionId: transaction.id,
        date: transaction.createdAt,
        offeringType: null,
        amount: toAmountNumber(transaction.amount),
        note,
      },
    ]
  }

  return transaction.items.map((item) => ({
    id: item.id,
    transactionId: transaction.id,
    date: transaction.createdAt,
    offeringType: item.offeringType,
    amount: toAmountNumber(item.amount),
    note,
  }))
}

async function getMemberOfferings(id, query) {
  const exists = await memberRepository.existsById(id)
  if (!exists) {
    throw AppError.notFound('Member not found')
  }

  const { page, limit, skip } = getPagination(query)
  const { start, end } = resolvePeriodRange(query)
  const range = { start, end }
  const offeringTypeIds = query.offeringTypeId

  const [transactions, typeRows, summary] = await Promise.all([
    memberRepository.findOfferingsByMemberId(id, range, offeringTypeIds, { skip, take: limit }),
    memberRepository.findOfferingTypesByMemberId(id),
    memberRepository.summarizeOfferingsByMemberId(id, range, offeringTypeIds),
  ])

  return {
    memberId: id,
    period: { period: query.period ?? 'month', from: start, to: end },
    types: typeRows,
    totalOfferings: summary.totalAmount,
    totalRecords: summary.rowCount,
    items: transactions.flatMap(toOfferingRows),
    meta: buildMeta({ page, limit, total: summary.transactionCount }),
  }
}

async function getConfig() {
  return memberRepository.findConfig()
}

function logMemberActivity(entry) {
  logActivity(entry).catch((err) => logger.error({ err }, `Failed to log ${entry.action} activity`))
}

async function createMember(data, actorId) {
  const { groupIds, levelId, lighthouseGroupId, ...fields } = data

  const existingByName = await memberRepository.findByName(fields.firstName, fields.lastName)
  if (existingByName) {
    throw AppError.conflict('A member with this name already exists')
  }

  if (fields.email) {
    const existingByEmail = await memberRepository.findByEmail(fields.email)
    if (existingByEmail) {
      throw AppError.conflict('A member with this email already exists')
    }
  }

  const member = await memberRepository.create(
    { ...fields, addedBy: actorId },
    groupIds,
    levelId,
    lighthouseGroupId,
  )

  logMemberActivity({
    action: 'MEMBER_REGISTERED',
    message: 'New member registered',
    detail: `${member.firstName} ${member.lastName}`,
    actorId,
  })

  return toMemberResponse(member)
}

async function updateMember(id, data, actorId) {
  const existing = await memberRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('Member not found')
  }

  const { groupIds, levelId, lighthouseGroupId, ...fields } = data

  const updated = await memberRepository.updateById(
    id,
    fields,
    groupIds,
    levelId,
    lighthouseGroupId,
  )

  if (fields.statusId && fields.statusId !== existing.statusId) {
    logMemberActivity({
      action: 'MEMBER_STATUS_CHANGED',
      message: `Status updated to ${updated.status?.name ?? 'Unknown'}`,
      detail: `${updated.firstName} ${updated.lastName}`,
      metadata: { from: existing.status?.name ?? null, to: updated.status?.name ?? null },
      actorId,
    })
  } else {
    logMemberActivity({
      action: 'MEMBER_UPDATED',
      message: 'Member details updated',
      detail: `${updated.firstName} ${updated.lastName}`,
      actorId,
    })
  }

  return toMemberResponse(updated)
}

async function deleteMember(id, actorId) {
  const existing = await memberRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('Member not found')
  }

  // Cascading (soul-win credits, NBC teacher assignments) + the member
  // delete run inside one transaction so a dependent row inserted between
  // the cascade and the delete can't cause a raw Postgres FK-violation
  // error — either everything commits together or nothing does.
  await memberRepository.runInTransaction(async (tx) => {
    await memberRepository.cascadeDeleteDependents(id, tx)
    await memberRepository.deleteById(id, tx)
  })

  logMemberActivity({
    action: 'MEMBER_DELETED',
    message: 'Member deleted',
    detail: `${existing.firstName} ${existing.lastName}`,
    actorId,
  })
}

async function deleteMembers(ids, actorId) {
  const uniqueIds = [...new Set(ids)]
  const existing = await memberRepository.findManyByIds(uniqueIds)

  if (existing.length === 0) {
    return { deletedCount: 0, deletedIds: [], blocked: [] }
  }

  const existingIds = existing.map((m) => m.id)

  // Cascading + the batch delete run inside one transaction — see
  // deleteMember for why (closes the same race window).
  await memberRepository.runInTransaction(async (tx) => {
    await memberRepository.cascadeDeleteDependentsByIds(existingIds, tx)
    await memberRepository.deleteManyByIds(existingIds, tx)
  })

  const names = existing.map((m) => `${m.firstName} ${m.lastName}`)
  logMemberActivity({
    action: 'MEMBER_DELETED',
    message: `Deleted ${existing.length} member${existing.length === 1 ? '' : 's'}`,
    detail: names.join(', '),
    metadata: { memberIds: existingIds },
    actorId,
  })

  return { deletedCount: existing.length, deletedIds: existingIds, blocked: [] }
}

async function getAddressSuggestions(search) {
  return memberRepository.findDistinctAddresses(search)
}

module.exports = {
  listMembers,
  getBreakdown,
  getMemberById,
  getMemberOfferings,
  getConfig,
  createMember,
  updateMember,
  deleteMember,
  deleteMembers,
  getAddressSuggestions,
}
