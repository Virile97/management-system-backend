const memberRepository = require('./member.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')
const { resolvePeriodRange } = require('../../shared/utils/period-range')

// level/lighthouseGroup now live on each member_groups row (duplicated across
// a member's rows), so the member-level view reads them off the first row.
// groups is flattened to a plain array of { id, role }, and the raw FK ids
// are dropped since the nested status/level/lighthouseGroup objects replace
// them.
function toMemberResponse(member) {
  const { statusId: _statusId, groups, ...rest } = member
  const [firstGroup] = groups

  return {
    ...rest,
    level: firstGroup?.level ?? null,
    lighthouseGroup: firstGroup?.lighthouseGroup ?? null,
    groups: groups.map(({ group }) => group),
  }
}

async function listMembers(query) {
  const { page, limit, skip } = getPagination(query)
  const { search, status, from, to } = query

  const [members, total] = await Promise.all([
    memberRepository.findMany({ skip, limit, search, status, from, to }),
    memberRepository.count({ search, status, from, to }),
  ])

  return {
    items: members.map(toMemberResponse),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getBreakdown(query) {
  const { search, status, from, to } = query

  const [grouped, statuses] = await Promise.all([
    memberRepository.countGroupedByStatus({ search, status, from, to }),
    memberRepository.findAllStatuses(),
  ])

  const namesById = new Map(statuses.map((s) => [s.id, s.name]))
  const total = grouped.reduce((sum, row) => sum + row._count._all, 0)

  const breakdown = grouped
    .map((row) => {
      const count = row._count._all
      return {
        status: row.statusId ? (namesById.get(row.statusId) ?? 'Unknown') : 'Unassigned',
        count,
        percentage: total ? Math.round((count / total) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.count - a.count)

  return { total, breakdown }
}

async function getMemberById(id) {
  const member = await memberRepository.findById(id)
  if (!member) {
    throw AppError.notFound('Member not found')
  }
  return toMemberResponse(member)
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

  const [transactions, typeRows, total, totalRecords, sum] = await Promise.all([
    memberRepository.findOfferingsByMemberId(id, range, offeringTypeIds, { skip, take: limit }),
    memberRepository.findOfferingTypesByMemberId(id),
    memberRepository.countOfferingsByMemberId(id, range, offeringTypeIds),
    memberRepository.countOfferingRowsByMemberId(id, range, offeringTypeIds),
    memberRepository.sumOfferingsByMemberId(id, range, offeringTypeIds),
  ])

  return {
    memberId: id,
    period: { period: query.period ?? 'month', from: start, to: end },
    types: typeRows.map((row) => row.offeringType),
    totalOfferings: toAmountNumber(sum._sum.amount),
    totalRecords,
    items: transactions.flatMap(toOfferingRows),
    meta: buildMeta({ page, limit, total }),
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

  await memberRepository.deleteById(id)

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
    return { deletedCount: 0, deletedIds: [] }
  }

  const deletedIds = existing.map((m) => m.id)
  await memberRepository.deleteManyByIds(deletedIds)

  const names = existing.map((m) => `${m.firstName} ${m.lastName}`)
  logMemberActivity({
    action: 'MEMBER_DELETED',
    message: `Deleted ${existing.length} member${existing.length === 1 ? '' : 's'}`,
    detail: names.join(', '),
    metadata: { memberIds: deletedIds },
    actorId,
  })

  return { deletedCount: existing.length, deletedIds }
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
}
