const { Prisma } = require('@prisma/client')
const prisma = require('../../config/prisma')

// Fallback level for baptize-to-member when the caller doesn't pick one —
// the frontend's baptize button doesn't collect a level yet, and a member
// row can't exist without one (Member.levelId is required).
const DEFAULT_LEVEL_NAME = 'Young People'

function findDefaultLevel() {
  return prisma.level.findUnique({ where: { name: DEFAULT_LEVEL_NAME } })
}

function buildWonAtFilterSql({ start, end } = {}) {
  const conditions = [Prisma.sql`TRUE`]
  if (start) conditions.push(Prisma.sql`sw."wonAt" >= ${start}`)
  if (end) conditions.push(Prisma.sql`sw."wonAt" <= ${end}`)
  return Prisma.join(conditions, ' AND ')
}

function buildListFilterSql({ search, status, winnerMemberId, event, start, end } = {}) {
  const conditions = [buildWonAtFilterSql({ start, end })]

  if (winnerMemberId) {
    // Filter records where this member is one of the soul winners.
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM soul_winners sww
      WHERE sww."soulWinId" = sw.id
        AND sww."memberId" = ${winnerMemberId}
    )`)
  }

  if (event) {
    const pattern = `%${event}%`
    conditions.push(Prisma.sql`sw.event ILIKE ${pattern}`)
  }

  if (search) {
    const pattern = `%${search}%`
    conditions.push(Prisma.sql`(
      sw."firstName" ILIKE ${pattern}
      OR sw."lastName" ILIKE ${pattern}
      OR sw."middleName" ILIKE ${pattern}
      OR sw.contact ILIKE ${pattern}
      OR sw.location ILIKE ${pattern}
      OR sw.event ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM soul_winners sww
        INNER JOIN members w ON w.id = sww."memberId"
        WHERE sww."soulWinId" = sw.id
          AND (
            w."firstName" ILIKE ${pattern}
            OR w."lastName" ILIKE ${pattern}
            OR w."middleName" ILIKE ${pattern}
          )
      )
    )`)
  }

  if (status === 'New Convert') {
    conditions.push(Prisma.sql`sw."memberId" IS NULL`)
  } else if (status === 'Active Member' || status === 'Active') {
    conditions.push(Prisma.sql`sw."memberId" IS NOT NULL AND s.name = 'Active'`)
  } else if (status === 'Inactive') {
    conditions.push(Prisma.sql`sw."memberId" IS NOT NULL AND s.name = 'Inactive'`)
  } else if (status) {
    conditions.push(Prisma.sql`sw."memberId" IS NOT NULL AND s.name = ${status}`)
  }

  return Prisma.join(conditions, ' AND ')
}

function buildRecordsOrderSql(sort = 'date', order = 'desc') {
  const dir = order === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC')

  if (sort === 'convert') {
    return Prisma.sql`sw."lastName" ${dir}, sw."firstName" ${dir}, sw."wonAt" DESC`
  }
  if (sort === 'status') {
    return Prisma.sql`${derivedStatusSql} ${dir}, sw."wonAt" DESC`
  }
  return Prisma.sql`sw."wonAt" ${dir}, sw."createdAt" ${dir}`
}

const derivedStatusSql = Prisma.sql`
  CASE
    WHEN sw."memberId" IS NULL THEN 'New Convert'
    WHEN s.name = 'Inactive' THEN 'Inactive'
    WHEN s.name = 'Active' THEN 'Active Member'
    ELSE COALESCE(s.name, 'Active Member')
  END
`

const winnersJsonSql = Prisma.sql`
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', w.id,
        'firstName', w."firstName",
        'lastName', w."lastName"
      )
      ORDER BY sww."sortOrder" ASC, w."lastName" ASC, w."firstName" ASC
    )
    FROM soul_winners sww
    INNER JOIN members w ON w.id = sww."memberId"
    WHERE sww."soulWinId" = sw.id
  ), '[]'::json)
`

function mapRecordRow(row) {
  const winners = Array.isArray(row.winners) ? row.winners : []
  return {
    id: row.id,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    contact: row.contact,
    location: row.location,
    age: row.age == null ? null : Number(row.age),
    event: row.event ?? null,
    notes: row.notes,
    wonAt: row.wonAt,
    baptizedAt: row.baptizedAt,
    status: row.status,
    memberId: row.memberId,
    winners,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const recordSelectSql = Prisma.sql`
  sw.id,
  sw."firstName",
  sw."middleName",
  sw."lastName",
  sw.contact,
  sw.location,
  sw.age,
  sw.event,
  sw.notes,
  sw."wonAt",
  sw."baptizedAt",
  sw."memberId",
  sw."createdAt",
  sw."updatedAt",
  ${derivedStatusSql} AS status,
  ${winnersJsonSql} AS winners
`

async function findMany({
  skip,
  take,
  search,
  status,
  winnerMemberId,
  event,
  start,
  end,
  sort,
  order,
}) {
  const whereSql = buildListFilterSql({ search, status, winnerMemberId, event, start, end })
  const orderSql = buildRecordsOrderSql(sort, order)

  const rows = await prisma.$queryRaw`
    SELECT ${recordSelectSql}
    FROM soul_wins sw
    LEFT JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT ${take} OFFSET ${skip}
  `

  return rows.map(mapRecordRow)
}

async function count({ search, status, winnerMemberId, event, start, end }) {
  const whereSql = buildListFilterSql({ search, status, winnerMemberId, event, start, end })

  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM soul_wins sw
    LEFT JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE ${whereSql}
  `

  return Number(rows[0]?.total ?? 0)
}

async function findById(id) {
  const rows = await prisma.$queryRaw`
    SELECT ${recordSelectSql}
    FROM soul_wins sw
    LEFT JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE sw.id = ${id}
    LIMIT 1
  `

  return rows[0] ? mapRecordRow(rows[0]) : null
}

function findRawById(id) {
  return prisma.soulWin.findUnique({
    where: { id },
    include: {
      winners: { select: { memberId: true, sortOrder: true } },
    },
  })
}

function findByName(firstName, lastName) {
  return prisma.soulWin.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
    select: { id: true, firstName: true, lastName: true },
  })
}

function memberExists(id) {
  return prisma.member.findUnique({ where: { id }, select: { id: true } }).then(Boolean)
}

async function membersExist(ids = []) {
  if (!ids.length) return false
  const unique = [...new Set(ids)]
  const count = await prisma.member.count({
    where: { id: { in: unique } },
  })
  return count === unique.length
}

function findActiveStatusId() {
  return prisma.status
    .findUnique({ where: { name: 'Active' }, select: { id: true } })
    .then((row) => row?.id ?? null)
}

/**
 * Period overview KPIs in one scan.
 * @returns {Promise<{ total: number, newConverts: number, activeMembers: number, inactiveMembers: number }>}
 */
async function summarizeOverview({ start, end } = {}) {
  const whereSql = buildWonAtFilterSql({ start, end })

  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sw."memberId" IS NULL)::int AS "newConverts",
      COUNT(*) FILTER (WHERE sw."memberId" IS NOT NULL AND s.name = 'Active')::int AS "activeMembers",
      COUNT(*) FILTER (WHERE sw."memberId" IS NOT NULL AND s.name = 'Inactive')::int AS "inactiveMembers"
    FROM soul_wins sw
    LEFT JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE ${whereSql}
  `

  return {
    total: Number(rows[0]?.total ?? 0),
    newConverts: Number(rows[0]?.newConverts ?? 0),
    activeMembers: Number(rows[0]?.activeMembers ?? 0),
    inactiveMembers: Number(rows[0]?.inactiveMembers ?? 0),
  }
}

/**
 * Winner cards: SQL aggregates with optional search + pagination.
 * Each co-winner gets full credit for the soul win.
 */
async function summarizeWinners({ start, end, search, skip = 0, take = 20 } = {}) {
  const conditions = [buildWonAtFilterSql({ start, end })]
  if (search) {
    const pattern = `%${search}%`
    conditions.push(Prisma.sql`(
      w."firstName" ILIKE ${pattern}
      OR w."lastName" ILIKE ${pattern}
      OR w."middleName" ILIKE ${pattern}
    )`)
  }
  const whereSql = Prisma.join(conditions, ' AND ')

  const [rows, countRows, totalRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        w.id,
        w."firstName",
        w."lastName",
        w."createdAt" AS "servingSince",
        (
          SELECT COALESCE(
            json_agg(
              json_build_object('id', g.id, 'role', g.role)
              ORDER BY mg."createdAt" ASC, g.role ASC
            ),
            '[]'::json
          )
          FROM member_groups mg
          INNER JOIN groups g ON g.id = mg."groupId"
          WHERE mg."memberId" = w.id
        ) AS ministries,
        COUNT(*)::int AS "soulsShared",
        COUNT(*) FILTER (WHERE sw."memberId" IS NOT NULL)::int AS "nowActive",
        COUNT(*) FILTER (WHERE sw."memberId" IS NULL)::int AS "newConverts",
        COUNT(*) FILTER (
          WHERE sw."memberId" IS NULL
             OR (sw."memberId" IS NOT NULL AND s.name = 'Inactive')
        )::int AS "needFollowUp"
      FROM soul_winners sww
      INNER JOIN soul_wins sw ON sw.id = sww."soulWinId"
      INNER JOIN members w ON w.id = sww."memberId"
      LEFT JOIN members m ON m.id = sw."memberId"
      LEFT JOIN statuses s ON s.id = m."statusId"
      WHERE ${whereSql}
      GROUP BY w.id, w."firstName", w."lastName", w."createdAt"
      ORDER BY "soulsShared" DESC, w."lastName" ASC, w."firstName" ASC
      LIMIT ${take} OFFSET ${skip}
    `,
    prisma.$queryRaw`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT w.id
        FROM soul_winners sww
        INNER JOIN soul_wins sw ON sw.id = sww."soulWinId"
        INNER JOIN members w ON w.id = sww."memberId"
        WHERE ${whereSql}
        GROUP BY w.id
      ) winners
    `,
    prisma.$queryRaw`
      SELECT COALESCE(SUM(c.cnt), 0)::int AS "totalSouls"
      FROM (
        SELECT COUNT(*)::int AS cnt
        FROM soul_winners sww
        INNER JOIN soul_wins sw ON sw.id = sww."soulWinId"
        INNER JOIN members w ON w.id = sww."memberId"
        WHERE ${whereSql}
        GROUP BY w.id
      ) c
    `,
  ])

  return {
    items: rows.map((row) => {
      const ministries = Array.isArray(row.ministries) ? row.ministries : []
      return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        servingSince: row.servingSince,
        ministries,
        // First group kept for older clients.
        ministry: ministries[0]?.role ?? null,
        soulsShared: Number(row.soulsShared),
        nowActive: Number(row.nowActive),
        newConverts: Number(row.newConverts),
        needFollowUp: Number(row.needFollowUp),
      }
    }),
    total: Number(countRows[0]?.total ?? 0),
    totalSoulsShared: Number(totalRows[0]?.totalSouls ?? 0),
  }
}

async function sumTrendByDay({ start, end }) {
  const winWhere = buildWonAtFilterSql({ start, end })

  const [wins, baptisms] = await Promise.all([
    prisma.$queryRaw`
      SELECT sw."wonAt"::date AS day, COUNT(*)::int AS count
      FROM soul_wins sw
      WHERE ${winWhere}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.$queryRaw`
      SELECT (sw."baptizedAt" AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS count
      FROM soul_wins sw
      WHERE sw."baptizedAt" IS NOT NULL
        AND sw."baptizedAt" >= ${start}
        AND sw."baptizedAt" <= ${end}
      GROUP BY 1
      ORDER BY 1
    `,
  ])

  return {
    soulsWon: wins.map((row) => ({ day: row.day, count: Number(row.count) })),
    becameActive: baptisms.map((row) => ({ day: row.day, count: Number(row.count) })),
  }
}

function buildBaptizedAtFilterSql({ start, end } = {}) {
  const conditions = [Prisma.sql`sw."baptizedAt" IS NOT NULL`]
  if (start) conditions.push(Prisma.sql`sw."baptizedAt" >= ${start}`)
  if (end) conditions.push(Prisma.sql`sw."baptizedAt" <= ${end}`)
  return Prisma.join(conditions, ' AND ')
}

async function sumTrendByMonth({ start, end }) {
  const winWhere = buildWonAtFilterSql({ start, end })
  const baptizedWhere = buildBaptizedAtFilterSql({ start, end })

  const [wins, baptisms] = await Promise.all([
    prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM sw."wonAt")::int AS year,
        EXTRACT(MONTH FROM sw."wonAt")::int AS month,
        COUNT(*)::int AS count
      FROM soul_wins sw
      WHERE ${winWhere}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
    prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM sw."baptizedAt")::int AS year,
        EXTRACT(MONTH FROM sw."baptizedAt")::int AS month,
        COUNT(*)::int AS count
      FROM soul_wins sw
      WHERE ${baptizedWhere}
      GROUP BY 1, 2
      ORDER BY 1, 2
    `,
  ])

  return {
    soulsWon: wins.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      count: Number(row.count),
    })),
    becameActive: baptisms.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      count: Number(row.count),
    })),
  }
}

/**
 * Baptisms in range grouped by day, with current Active/Inactive status of those members.
 */
async function sumBaptismRetentionByDay({ start, end }) {
  const rows = await prisma.$queryRaw`
    SELECT
      (sw."baptizedAt" AT TIME ZONE 'UTC')::date AS day,
      COUNT(*)::int AS baptized,
      COUNT(*) FILTER (WHERE s.name = 'Active')::int AS active,
      COUNT(*) FILTER (WHERE s.name = 'Inactive')::int AS inactive
    FROM soul_wins sw
    INNER JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE sw."baptizedAt" IS NOT NULL
      AND sw."baptizedAt" >= ${start}
      AND sw."baptizedAt" <= ${end}
    GROUP BY 1
    ORDER BY 1
  `

  return rows.map((row) => ({
    day: row.day,
    baptized: Number(row.baptized),
    active: Number(row.active),
    inactive: Number(row.inactive),
  }))
}

async function sumBaptismRetentionByMonth({ start, end }) {
  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM sw."baptizedAt")::int AS year,
      EXTRACT(MONTH FROM sw."baptizedAt")::int AS month,
      COUNT(*)::int AS baptized,
      COUNT(*) FILTER (WHERE s.name = 'Active')::int AS active,
      COUNT(*) FILTER (WHERE s.name = 'Inactive')::int AS inactive
    FROM soul_wins sw
    INNER JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE sw."baptizedAt" IS NOT NULL
      AND sw."baptizedAt" >= ${start}
      AND sw."baptizedAt" <= ${end}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `

  return rows.map((row) => ({
    year: Number(row.year),
    month: Number(row.month),
    baptized: Number(row.baptized),
    active: Number(row.active),
    inactive: Number(row.inactive),
  }))
}

async function summarizeBaptismRetention({ start, end } = {}) {
  const conditions = [Prisma.sql`sw."baptizedAt" IS NOT NULL`]
  if (start) conditions.push(Prisma.sql`sw."baptizedAt" >= ${start}`)
  if (end) conditions.push(Prisma.sql`sw."baptizedAt" <= ${end}`)
  const whereSql = Prisma.join(conditions, ' AND ')

  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS baptized,
      COUNT(*) FILTER (WHERE s.name = 'Active')::int AS active,
      COUNT(*) FILTER (WHERE s.name = 'Inactive')::int AS inactive
    FROM soul_wins sw
    INNER JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE ${whereSql}
  `

  return {
    baptized: Number(rows[0]?.baptized ?? 0),
    active: Number(rows[0]?.active ?? 0),
    inactive: Number(rows[0]?.inactive ?? 0),
  }
}

async function sumLeaderboard({ start, end, limit = 10 }) {
  const whereSql = buildWonAtFilterSql({ start, end })

  const rows = await prisma.$queryRaw`
    SELECT
      w.id,
      w."firstName",
      w."lastName",
      COUNT(*)::int AS count
    FROM soul_winners sww
    INNER JOIN soul_wins sw ON sw.id = sww."soulWinId"
    INNER JOIN members w ON w.id = sww."memberId"
    WHERE ${whereSql}
    GROUP BY w.id, w."firstName", w."lastName"
    ORDER BY count DESC, w."lastName" ASC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    count: Number(row.count),
  }))
}

/**
 * Event performance for the period — which occasions produced POF / baptisms.
 */
async function sumByEvent({ start, end, limit = 8 } = {}) {
  const whereSql = buildWonAtFilterSql({ start, end })

  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(NULLIF(TRIM(sw.event), ''), 'Unspecified') AS event,
      COUNT(*)::int AS "professionsOfFaith",
      COUNT(*) FILTER (WHERE sw."memberId" IS NOT NULL)::int AS baptism,
      COUNT(*) FILTER (
        WHERE sw."memberId" IS NOT NULL AND s.name = 'Active'
      )::int AS "activeRetention",
      COUNT(*) FILTER (
        WHERE sw."memberId" IS NOT NULL AND s.name = 'Inactive'
      )::int AS "wentInactive"
    FROM soul_wins sw
    LEFT JOIN members m ON m.id = sw."memberId"
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE ${whereSql}
    GROUP BY 1
    ORDER BY "professionsOfFaith" DESC, event ASC
    LIMIT ${limit}
  `

  return rows.map((row) => ({
    event: row.event,
    professionsOfFaith: Number(row.professionsOfFaith),
    baptism: Number(row.baptism),
    activeRetention: Number(row.activeRetention),
    wentInactive: Number(row.wentInactive),
  }))
}

function create({ winnerMemberIds, ...data }) {
  return prisma.soulWin.create({
    data: {
      ...data,
      winners: {
        create: winnerMemberIds.map((memberId, index) => ({
          memberId,
          sortOrder: index,
        })),
      },
    },
  })
}

async function updateById(id, { winnerMemberIds, ...data }) {
  if (!winnerMemberIds) {
    return prisma.soulWin.update({ where: { id }, data })
  }

  return prisma.$transaction(async (tx) => {
    await tx.soulWinWinner.deleteMany({ where: { soulWinId: id } })
    await tx.soulWin.update({
      where: { id },
      data: {
        ...data,
        winners: {
          create: winnerMemberIds.map((memberId, index) => ({
            memberId,
            sortOrder: index,
          })),
        },
      },
    })
    return tx.soulWin.findUnique({ where: { id } })
  })
}

/**
 * Baptize = create Active member + link soul_wins.memberId in one transaction.
 */
async function baptize(id, { memberData, baptizedAt }) {
  return prisma.$transaction(async (tx) => {
    const soulWin = await tx.soulWin.findUnique({ where: { id } })
    if (!soulWin) return { error: 'NOT_FOUND' }
    if (soulWin.memberId) return { error: 'ALREADY_BAPTIZED' }

    const activeStatus = await tx.status.findUnique({
      where: { name: 'Active' },
      select: { id: true },
    })
    if (!activeStatus) return { error: 'ACTIVE_STATUS_MISSING' }

    const member = await tx.member.create({
      data: {
        ...memberData,
        isBaptized: true,
        baptizedAt,
        statusId: activeStatus.id,
      },
      include: {
        status: { select: { id: true, name: true } },
      },
    })

    const updated = await tx.soulWin.update({
      where: { id },
      data: {
        memberId: member.id,
        baptizedAt,
      },
    })

    return { soulWin: updated, member }
  })
}

function findGoal({ period, startAt, endAt }) {
  return prisma.soulWinningGoal.findUnique({
    where: {
      period_startAt_endAt: { period, startAt, endAt },
    },
  })
}

function upsertGoal({ period, startAt, endAt, targetCount, createdBy }) {
  return prisma.soulWinningGoal.upsert({
    where: {
      period_startAt_endAt: { period, startAt, endAt },
    },
    create: { period, startAt, endAt, targetCount, createdBy },
    update: { targetCount, createdBy },
  })
}

function annualBounds(year) {
  // Local calendar year bounds (matches period-range / overview).
  return {
    startAt: new Date(year, 0, 1, 0, 0, 0, 0),
    endAt: new Date(year, 11, 31, 23, 59, 59, 999),
  }
}

async function findAnnualGoal(year) {
  // year column is source of truth (avoid UTC startAt year skew).
  return prisma.soulWinningGoal.findUnique({ where: { year } })
}

async function upsertAnnualGoal(year, targetCount, createdBy) {
  const { startAt, endAt } = annualBounds(year)
  const existing = await findAnnualGoal(year)

  if (existing) {
    return prisma.soulWinningGoal.update({
      where: { id: existing.id },
      data: {
        year,
        period: 'year',
        startAt,
        endAt,
        targetCount,
        createdBy,
      },
    })
  }

  return prisma.soulWinningGoal.create({
    data: {
      year,
      period: 'year',
      startAt,
      endAt,
      targetCount,
      createdBy,
    },
  })
}

module.exports = {
  findMany,
  count,
  findById,
  findRawById,
  findByName,
  memberExists,
  membersExist,
  findActiveStatusId,
  summarizeOverview,
  summarizeWinners,
  sumTrendByDay,
  sumTrendByMonth,
  sumBaptismRetentionByDay,
  sumBaptismRetentionByMonth,
  summarizeBaptismRetention,
  sumLeaderboard,
  sumByEvent,
  create,
  updateById,
  baptize,
  findDefaultLevel,
  findGoal,
  findAnnualGoal,
  upsertGoal,
  upsertAnnualGoal,
}
