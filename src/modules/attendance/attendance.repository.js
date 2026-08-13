const { Prisma } = require('@prisma/client')
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

function buildMemberFilterSql({ search, level }) {
  const conditions = [Prisma.sql`TRUE`]

  if (search) {
    const pattern = `%${search}%`
    conditions.push(Prisma.sql`(
      m."firstName" ILIKE ${pattern}
      OR COALESCE(m."middleName", '') ILIKE ${pattern}
      OR m."lastName" ILIKE ${pattern}
    )`)
  }

  if (level) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM member_groups mg
      INNER JOIN levels l ON l.id = mg."levelId"
      WHERE mg."memberId" = m.id
        AND l.name = ${level}
    )`)
  }

  return Prisma.join(conditions, ' AND ')
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

// DB-side present-first ordering + LIMIT/OFFSET — avoids loading all member ids.
async function findMembersPrioritizedByAttendance({ skip, limit, search, level, from, to }) {
  const fromDay = toDateOnly(from)
  const toDay = toDateOnly(to)
  const whereSql = buildMemberFilterSql({ search, level })

  const rows = await prisma.$queryRaw`
    SELECT m.id
    FROM members m
    LEFT JOIN (
      SELECT DISTINCT a."memberId"
      FROM attendances a
      WHERE a.date >= ${fromDay}
        AND a.date <= ${toDay}
        AND (
          a."morningIn" IS NOT NULL
          OR a."morningOut" IS NOT NULL
          OR a."afternoonIn" IS NOT NULL
          OR a."afternoonOut" IS NOT NULL
        )
    ) present ON present."memberId" = m.id
    WHERE ${whereSql}
    ORDER BY (present."memberId" IS NOT NULL) DESC,
             m."lastName" ASC,
             m."firstName" ASC
    LIMIT ${limit}
    OFFSET ${skip}
  `

  const pageIds = rows.map((row) => row.id)

  if (pageIds.length === 0) return []

  const members = await prisma.member.findMany({
    where: { id: { in: pageIds } },
    select: memberAttendanceSelect,
  })
  const byId = new Map(members.map((member) => [member.id, member]))

  return pageIds.map((id) => byId.get(id)).filter(Boolean)
}

async function findAttendancesByMemberIds(memberIds, from, to) {
  if (!memberIds.length) return []

  const fromDay = toDateOnly(from)
  const toDay = toDateOnly(to)

  // Status is derived in SQL so the service only groups + shapes DTOs.
  return prisma.$queryRaw`
    SELECT
      a.id,
      a."memberId",
      a.date,
      a."morningIn",
      a."morningOut",
      a."afternoonIn",
      a."afternoonOut",
      CASE
        WHEN (a."morningIn" IS NOT NULL OR a."morningOut" IS NOT NULL)
         AND (a."afternoonIn" IS NOT NULL OR a."afternoonOut" IS NOT NULL) THEN 'full_day'
        WHEN (a."morningIn" IS NOT NULL OR a."morningOut" IS NOT NULL) THEN 'morning_only'
        WHEN (a."afternoonIn" IS NOT NULL OR a."afternoonOut" IS NOT NULL) THEN 'afternoon_only'
        ELSE 'absent'
      END AS status
    FROM attendances a
    WHERE a."memberId" IN (${Prisma.join(memberIds)})
      AND a.date >= ${fromDay}
      AND a.date <= ${toDay}
    ORDER BY a.date ASC
  `
}

/**
 * Aggregate attendance summary in SQL for the full member population.
 * Returns counts only — no row materialization.
 */
async function summarizeAttendanceInRange(from, to) {
  const fromDay = toDateOnly(from)
  const toDay = toDateOnly(to)
  const singleDay = fromDay.getTime() === toDay.getTime()

  if (singleDay) {
    const [row] = await prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (
          WHERE ("morningIn" IS NOT NULL OR "morningOut" IS NOT NULL)
            AND ("afternoonIn" IS NOT NULL OR "afternoonOut" IS NOT NULL)
        )::int AS "fullDay",
        COUNT(*) FILTER (
          WHERE ("morningIn" IS NOT NULL OR "morningOut" IS NOT NULL)
            AND ("afternoonIn" IS NULL AND "afternoonOut" IS NULL)
        )::int AS "morningOnly",
        COUNT(*) FILTER (
          WHERE ("afternoonIn" IS NOT NULL OR "afternoonOut" IS NOT NULL)
            AND ("morningIn" IS NULL AND "morningOut" IS NULL)
        )::int AS "afternoonOnly"
      FROM attendances
      WHERE date = ${fromDay}
    `

    return {
      fullDay: Number(row?.fullDay ?? 0),
      morningOnly: Number(row?.morningOnly ?? 0),
      afternoonOnly: Number(row?.afternoonOnly ?? 0),
      partialMixed: 0,
    }
  }

  const [row] = await prisma.$queryRaw`
    WITH day_status AS (
      SELECT
        a."memberId",
        CASE
          WHEN (a."morningIn" IS NOT NULL OR a."morningOut" IS NOT NULL)
           AND (a."afternoonIn" IS NOT NULL OR a."afternoonOut" IS NOT NULL) THEN 'full_day'
          WHEN (a."morningIn" IS NOT NULL OR a."morningOut" IS NOT NULL) THEN 'morning_only'
          WHEN (a."afternoonIn" IS NOT NULL OR a."afternoonOut" IS NOT NULL) THEN 'afternoon_only'
          ELSE 'absent'
        END AS status
      FROM attendances a
      WHERE a.date >= ${fromDay}
        AND a.date <= ${toDay}
    ),
    member_status AS (
      SELECT
        "memberId",
        BOOL_OR(status = 'full_day') AS has_full,
        BOOL_OR(status = 'morning_only') AS has_morning,
        BOOL_OR(status = 'afternoon_only') AS has_afternoon
      FROM day_status
      WHERE status <> 'absent'
      GROUP BY "memberId"
    )
    SELECT
      COUNT(*) FILTER (WHERE has_full)::int AS "fullDay",
      COUNT(*) FILTER (
        WHERE NOT has_full AND has_morning AND NOT has_afternoon
      )::int AS "morningOnly",
      COUNT(*) FILTER (
        WHERE NOT has_full AND has_afternoon AND NOT has_morning
      )::int AS "afternoonOnly",
      COUNT(*) FILTER (
        WHERE NOT has_full AND has_morning AND has_afternoon
      )::int AS "partialMixed"
    FROM member_status
  `

  return {
    fullDay: Number(row?.fullDay ?? 0),
    morningOnly: Number(row?.morningOnly ?? 0),
    afternoonOnly: Number(row?.afternoonOnly ?? 0),
    partialMixed: Number(row?.partialMixed ?? 0),
  }
}

async function countMembersByLevel() {
  const rows = await prisma.$queryRaw`
    SELECT
      l.id,
      l.name,
      COUNT(DISTINCT mg."memberId")::int AS count
    FROM levels l
    LEFT JOIN member_groups mg ON mg."levelId" = l.id
    GROUP BY l.id, l.name
    ORDER BY l.name ASC
  `

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    count: Number(row.count ?? 0),
  }))
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
  summarizeAttendanceInRange,
  countMembersByLevel,
  upsertByMemberAndDate,
  memberExists,
  toDateOnly,
}
