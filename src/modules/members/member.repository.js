const prisma = require('../../config/prisma')

const memberIncludes = {
  status: { select: { id: true, name: true } },
  groups: {
    select: {
      group: { select: { id: true, role: true } },
      level: { select: { id: true, name: true } },
      lighthouseGroup: { select: { id: true, name: true } },
    },
  },
}

function buildWhere({ search, status }) {
  const where = {}

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { middleName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (status) {
    where.status = { name: status }
  }

  return where
}

function findMany({ skip, limit, search, status }) {
  return prisma.member.findMany({
    where: buildWhere({ search, status }),
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: memberIncludes,
  })
}

function count({ search, status }) {
  return prisma.member.count({ where: buildWhere({ search, status }) })
}

function findById(id) {
  return prisma.member.findUnique({
    where: { id },
    include: memberIncludes,
  })
}

// levelId/lighthouseGroupId now live on member_groups, so they're applied to
// every group row being written for this member (one row per group).
function buildGroupRows(groupIds, levelId, lighthouseGroupId) {
  return groupIds.map((groupId) => ({
    groupId,
    ...(levelId !== undefined ? { levelId } : {}),
    ...(lighthouseGroupId !== undefined ? { lighthouseGroupId } : {}),
  }))
}

function create(data, groupIds, levelId, lighthouseGroupId) {
  return prisma.member.create({
    data: {
      ...data,
      ...(groupIds
        ? { groups: { create: buildGroupRows(groupIds, levelId, lighthouseGroupId) } }
        : {}),
    },
    include: memberIncludes,
  })
}

async function updateById(id, data, groupIds, levelId, lighthouseGroupId) {
  if (groupIds) {
    // Changing the group selection replaces the rows, so carry forward the
    // existing level/lighthouseGroup unless the caller is explicitly
    // changing them — otherwise re-picking groups would silently drop them.
    let carriedLevelId = levelId
    let carriedLighthouseGroupId = lighthouseGroupId
    if (levelId === undefined || lighthouseGroupId === undefined) {
      const existingRow = await prisma.memberGroup.findFirst({ where: { memberId: id } })
      if (levelId === undefined) carriedLevelId = existingRow?.levelId ?? undefined
      if (lighthouseGroupId === undefined) {
        carriedLighthouseGroupId = existingRow?.lighthouseGroupId ?? undefined
      }
    }

    await prisma.memberGroup.deleteMany({ where: { memberId: id } })

    return prisma.member.update({
      where: { id },
      data: {
        ...data,
        groups: { create: buildGroupRows(groupIds, carriedLevelId, carriedLighthouseGroupId) },
      },
      include: memberIncludes,
    })
  }

  if (levelId !== undefined || lighthouseGroupId !== undefined) {
    // No new group selection, but level/lighthouseGroup changed — apply to
    // the member's existing group rows.
    await prisma.memberGroup.updateMany({
      where: { memberId: id },
      data: {
        ...(levelId !== undefined ? { levelId } : {}),
        ...(lighthouseGroupId !== undefined ? { lighthouseGroupId } : {}),
      },
    })
  }

  return prisma.member.update({
    where: { id },
    data,
    include: memberIncludes,
  })
}

function deleteById(id) {
  return prisma.member.delete({ where: { id } })
}

function findManyByIds(ids) {
  return prisma.member.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  })
}

function deleteManyByIds(ids) {
  return prisma.member.deleteMany({ where: { id: { in: ids } } })
}

async function findConfig() {
  const [statuses, levels, lighthouseGroups, groups] = await Promise.all([
    prisma.status.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.level.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.lighthouseGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.group.findMany({ select: { id: true, role: true }, orderBy: { role: 'asc' } }),
  ])

  return { statuses, levels, lighthouseGroups, groups }
}

module.exports = {
  findMany,
  count,
  findById,
  create,
  updateById,
  deleteById,
  findManyByIds,
  deleteManyByIds,
  findConfig,
}
