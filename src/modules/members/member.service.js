const memberRepository = require('./member.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')

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
  const { search, status } = query

  const [members, total] = await Promise.all([
    memberRepository.findMany({ skip, limit, search, status }),
    memberRepository.count({ search, status }),
  ])

  return {
    items: members.map(toMemberResponse),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getMemberById(id) {
  const member = await memberRepository.findById(id)
  if (!member) {
    throw AppError.notFound('Member not found')
  }
  return toMemberResponse(member)
}

async function getConfig() {
  return memberRepository.findConfig()
}

function logMemberActivity(entry) {
  logActivity(entry).catch((err) => logger.error({ err }, `Failed to log ${entry.action} activity`))
}

async function createMember(data, actorId) {
  const { groupIds, levelId, lighthouseGroupId, ...fields } = data

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
  getMemberById,
  getConfig,
  createMember,
  updateMember,
  deleteMember,
  deleteMembers,
}
