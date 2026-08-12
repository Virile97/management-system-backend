const prisma = require('../../config/prisma')

const memberAttendanceSelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  groups: {
    select: {
      level: { select: { id: true, name: true } },
    },
    take: 1,
  },
}

// Normalize to a UTC midnight calendar day so @db.Date keys stay stable
// across timezones (avoids "saved but missing on reload" for YYYY-MM-DD inputs).
function toDateOnly(date) {
  const value = date instanceof Date ? date : new Date(date)
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function buildDateRange(from, to) {
  return {
    gte: toDateOnly(from),
    lte: toDateOnly(to),
  }
}

function buildMemberWhere({ search, level }) {
  const where = {}

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { middleName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (level) {
    where.groups = { some: { level: { name: level } } }
  }

  return where
}

function findMembers({ skip, limit, search, level } = {}) {
  return prisma.member.findMany({
    where: buildMemberWhere({ search, level }),
    skip,
    take: limit,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: memberAttendanceSelect,
  })
}

function countMembers({ search, level } = {}) {
  return prisma.member.count({ where: buildMemberWhere({ search, level }) })
}

// All matching members, but those with attendance in [from, to] sort above absents.
// Name order is preserved within each group. Pagination is applied after sorting.
async function findMembersPrioritizedByAttendance({ skip, limit, search, level, from, to }) {
  const where = buildMemberWhere({ search, level })

  const [candidates, attendedRows] = await Promise.all([
    prisma.member.findMany({
      where,
      select: { id: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    prisma.attendance.findMany({
      where: {
        date: buildDateRange(from, to),
        member: where,
      },
      distinct: ['memberId'],
      select: { memberId: true },
    }),
  ])

  const attendedIds = new Set(attendedRows.map((row) => row.memberId))
  const sortedIds = [
    ...candidates.filter((member) => attendedIds.has(member.id)).map((member) => member.id),
    ...candidates.filter((member) => !attendedIds.has(member.id)).map((member) => member.id),
  ]
  const pageIds = sortedIds.slice(skip, skip + limit)

  if (pageIds.length === 0) return []

  const members = await prisma.member.findMany({
    where: { id: { in: pageIds } },
    select: memberAttendanceSelect,
  })
  const byId = new Map(members.map((member) => [member.id, member]))

  return pageIds.map((id) => byId.get(id)).filter(Boolean)
}

function findAttendancesByMemberIds(memberIds, from, to) {
  return prisma.attendance.findMany({
    where: {
      memberId: { in: memberIds },
      date: buildDateRange(from, to),
    },
    orderBy: { date: 'asc' },
  })
}

function findAllAttendancesInRange(from, to) {
  return prisma.attendance.findMany({
    where: { date: buildDateRange(from, to) },
    select: {
      memberId: true,
      date: true,
      morningIn: true,
      morningOut: true,
      afternoonIn: true,
      afternoonOut: true,
    },
  })
}

function countMembersGroupedByLevel() {
  return prisma.member.findMany({
    select: {
      id: true,
      groups: {
        select: { levelId: true },
        take: 1,
      },
    },
  })
}

function findAllLevels() {
  return prisma.level.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

function findByMemberAndDate(memberId, date) {
  return prisma.attendance.findUnique({
    where: {
      memberId_date: { memberId, date: toDateOnly(date) },
    },
  })
}

function upsertByMemberAndDate({
  memberId,
  date,
  morningIn,
  morningOut,
  afternoonIn,
  afternoonOut,
  recordedBy,
}) {
  const day = toDateOnly(date)

  return prisma.attendance.upsert({
    where: { memberId_date: { memberId, date: day } },
    create: {
      memberId,
      date: day,
      morningIn,
      morningOut,
      afternoonIn,
      afternoonOut,
      recordedBy,
    },
    update: {
      ...(morningIn !== undefined ? { morningIn } : {}),
      ...(morningOut !== undefined ? { morningOut } : {}),
      ...(afternoonIn !== undefined ? { afternoonIn } : {}),
      ...(afternoonOut !== undefined ? { afternoonOut } : {}),
      ...(recordedBy !== undefined ? { recordedBy } : {}),
    },
  })
}

function memberExists(id) {
  return prisma.member.findUnique({ where: { id }, select: { id: true } })
}

module.exports = {
  findMembers,
  findMembersPrioritizedByAttendance,
  countMembers,
  findAttendancesByMemberIds,
  findAllAttendancesInRange,
  countMembersGroupedByLevel,
  findAllLevels,
  findByMemberAndDate,
  upsertByMemberAndDate,
  memberExists,
  toDateOnly,
}
