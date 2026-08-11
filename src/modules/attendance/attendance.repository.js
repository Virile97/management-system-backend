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

function findMembers({ skip, limit, search, level }) {
  return prisma.member.findMany({
    where: buildMemberWhere({ search, level }),
    skip,
    take: limit,
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: memberAttendanceSelect,
  })
}

function countMembers({ search, level }) {
  return prisma.member.count({ where: buildMemberWhere({ search, level }) })
}

function findAttendancesByMemberIds(memberIds, date) {
  return prisma.attendance.findMany({
    where: {
      memberId: { in: memberIds },
      date: toDateOnly(date),
    },
  })
}

function findAllAttendancesForDate(date) {
  return prisma.attendance.findMany({
    where: { date: toDateOnly(date) },
    select: {
      memberId: true,
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
  countMembers,
  findAttendancesByMemberIds,
  findAllAttendancesForDate,
  countMembersGroupedByLevel,
  findAllLevels,
  findByMemberAndDate,
  upsertByMemberAndDate,
  memberExists,
  toDateOnly,
}
