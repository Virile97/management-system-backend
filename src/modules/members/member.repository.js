const { Prisma } = require('@prisma/client')
const prisma = require('../../config/prisma')
const {
  memberSearchTokens,
  buildMemberNameSearchWhere,
} = require('../../shared/utils/member-search')

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

function endOfDay(date) {
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end
}

function buildWhere({ search, status, from, to }) {
  const where = {}

  const nameSearch = buildMemberNameSearchWhere(search)
  if (nameSearch) Object.assign(where, nameSearch)

  if (status) {
    where.status = { name: status }
  }

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: endOfDay(to) } : {}),
    }
  }

  return where
}

function buildMemberFilterSql({ search, status, from, to }) {
  const conditions = [Prisma.sql`TRUE`]

  if (search) {
    for (const token of memberSearchTokens(search)) {
      const pattern = `%${token}%`
      conditions.push(Prisma.sql`(
      COALESCE(m.email, '') ILIKE ${pattern}
      OR m."firstName" ILIKE ${pattern}
      OR COALESCE(m."middleName", '') ILIKE ${pattern}
      OR m."lastName" ILIKE ${pattern}
    )`)
    }
  }

  if (status) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM statuses s
      WHERE s.id = m."statusId" AND s.name = ${status}
    )`)
  }

  if (from) {
    conditions.push(Prisma.sql`m."createdAt" >= ${from}`)
  }

  if (to) {
    conditions.push(Prisma.sql`m."createdAt" <= ${endOfDay(to)}`)
  }

  return Prisma.join(conditions, ' AND ')
}

function findMany({ skip, limit, search, status, from, to }) {
  return prisma.member.findMany({
    where: buildWhere({ search, status, from, to }),
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: memberIncludes,
  })
}

function count({ search, status, from, to }) {
  return prisma.member.count({ where: buildWhere({ search, status, from, to }) })
}

/**
 * Status breakdown aggregated in SQL — same shape the service previously built in JS.
 * @returns {Promise<{ total: number, breakdown: Array<{ status: string, count: number, percentage: number }> }>}
 */
async function summarizeBreakdownByStatus({ search, status, from, to } = {}) {
  const whereSql = buildMemberFilterSql({ search, status, from, to })

  const rows = await prisma.$queryRaw`
    WITH filtered AS (
      SELECT
        CASE
          WHEN m."statusId" IS NULL THEN 'Unassigned'
          WHEN s.name IS NULL THEN 'Unknown'
          ELSE s.name
        END AS status
      FROM members m
      LEFT JOIN statuses s ON s.id = m."statusId"
      WHERE ${whereSql}
    ),
    counts AS (
      SELECT status, COUNT(*)::int AS count
      FROM filtered
      GROUP BY status
    ),
    totals AS (
      SELECT COALESCE(SUM(count), 0)::int AS total FROM counts
    )
    SELECT
      c.status,
      c.count,
      CASE
        WHEN t.total = 0 THEN 0
        ELSE ROUND((c.count::numeric / t.total) * 1000) / 10
      END AS percentage,
      t.total
    FROM counts c
    CROSS JOIN totals t
    ORDER BY c.count DESC, c.status ASC
  `

  if (rows.length === 0) {
    return { total: 0, breakdown: [] }
  }

  return {
    total: Number(rows[0].total),
    breakdown: rows.map((row) => ({
      status: row.status,
      count: Number(row.count),
      percentage: Number(row.percentage),
    })),
  }
}

function findById(id) {
  return prisma.member.findUnique({
    where: { id },
    include: memberIncludes,
  })
}

async function findAttendancesByMemberId(memberId, { skip = 0, limit = 20 } = {}) {
  // Embedded on member detail; paginated. Status derived in SQL.
  return prisma.$queryRaw`
    SELECT
      a.id,
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
    WHERE a."memberId" = ${memberId}
    ORDER BY a.date DESC
    LIMIT ${limit}
    OFFSET ${skip}
  `
}

function countAttendancesByMemberId(memberId) {
  return prisma.attendance.count({ where: { memberId } })
}

async function existsById(id) {
  const member = await prisma.member.findUnique({ where: { id }, select: { id: true } })
  return Boolean(member)
}

function findByName(firstName, lastName) {
  return prisma.member.findFirst({
    where: {
      firstName: { equals: firstName, mode: 'insensitive' },
      lastName: { equals: lastName, mode: 'insensitive' },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
}

function findByEmail(email) {
  return prisma.member.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, firstName: true, lastName: true, email: true },
  })
}

function buildOfferingTxFilterSql(memberId, range = {}, offeringTypeIds) {
  const conditions = [
    Prisma.sql`t."memberId" = ${memberId}`,
    Prisma.sql`tt.name = 'Income'`,
  ]

  if (range.start) conditions.push(Prisma.sql`t."createdAt" >= ${range.start}`)
  if (range.end) conditions.push(Prisma.sql`t."createdAt" <= ${range.end}`)

  if (offeringTypeIds?.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1
      FROM transaction_items ti_filter
      WHERE ti_filter."transactionId" = t.id
        AND ti_filter."offeringTypeId" IN (${Prisma.join(offeringTypeIds)})
    )`)
  }

  return Prisma.join(conditions, ' AND ')
}

function buildOfferingItemFilterSql(offeringTypeIds) {
  if (!offeringTypeIds?.length) return Prisma.sql`TRUE`
  return Prisma.sql`ti."offeringTypeId" IN (${Prisma.join(offeringTypeIds)})`
}

/**
 * One SQL round-trip for a page of income txs + nested items (JSON).
 * Paging stays at the transaction level; the service still flattens for display.
 */
async function findOfferingsByMemberId(memberId, range = {}, offeringTypeIds, { skip, take } = {}) {
  const whereSql = buildOfferingTxFilterSql(memberId, range, offeringTypeIds)
  const itemWhereSql = buildOfferingItemFilterSql(offeringTypeIds)
  const offset = skip ?? 0
  const limit = take ?? 20

  const rows = await prisma.$queryRaw`
    WITH page AS (
      SELECT t.id, t.description, t.amount, t."createdAt"
      FROM transactions t
      INNER JOIN transaction_types tt ON tt.id = t."typeId"
      WHERE ${whereSql}
      ORDER BY t."createdAt" DESC
      LIMIT ${limit} OFFSET ${offset}
    )
    SELECT
      p.id,
      p.description,
      p.amount,
      p."createdAt",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', ti.id,
              'amount', ti.amount,
              'offeringType', json_build_object('id', ot.id, 'name', ot.name)
            )
            ORDER BY ti."createdAt" ASC, ti.id ASC
          )
          FROM transaction_items ti
          INNER JOIN offering_types ot ON ot.id = ti."offeringTypeId"
          WHERE ti."transactionId" = p.id
            AND ${itemWhereSql}
        ),
        '[]'::json
      ) AS items
    FROM page p
    ORDER BY p."createdAt" DESC
  `

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    amount: row.amount,
    createdAt: row.createdAt,
    items: Array.isArray(row.items) ? row.items : [],
  }))
}

/**
 * Transaction count, display-row count, and total amount in one scan.
 * @returns {Promise<{ transactionCount: number, rowCount: number, totalAmount: number }>}
 */
async function summarizeOfferingsByMemberId(memberId, range = {}, offeringTypeIds) {
  const whereSql = buildOfferingTxFilterSql(memberId, range, offeringTypeIds)

  if (offeringTypeIds?.length) {
    const rows = await prisma.$queryRaw`
      SELECT
        COUNT(DISTINCT t.id)::int AS "transactionCount",
        COUNT(ti.id)::int AS "rowCount",
        COALESCE(SUM(ti.amount), 0) AS "totalAmount"
      FROM transactions t
      INNER JOIN transaction_types tt ON tt.id = t."typeId"
      INNER JOIN transaction_items ti ON ti."transactionId" = t.id
      WHERE ${whereSql}
        AND ti."offeringTypeId" IN (${Prisma.join(offeringTypeIds)})
    `

    return {
      transactionCount: Number(rows[0]?.transactionCount ?? 0),
      rowCount: Number(rows[0]?.rowCount ?? 0),
      totalAmount: Number(rows[0]?.totalAmount ?? 0),
    }
  }

  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*)::int AS "transactionCount",
      COALESCE(
        SUM(
          CASE
            WHEN EXISTS (
              SELECT 1 FROM transaction_items ti WHERE ti."transactionId" = t.id
            )
            THEN (
              SELECT COUNT(*)::int FROM transaction_items ti WHERE ti."transactionId" = t.id
            )
            ELSE 1
          END
        ),
        0
      )::int AS "rowCount",
      COALESCE(SUM(t.amount), 0) AS "totalAmount"
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    WHERE ${whereSql}
  `

  return {
    transactionCount: Number(rows[0]?.transactionCount ?? 0),
    rowCount: Number(rows[0]?.rowCount ?? 0),
    totalAmount: Number(rows[0]?.totalAmount ?? 0),
  }
}

// Every offering type this member has ever given to, ignoring the period and
// type filters so the filter options stay stable as the user switches tabs.
async function findOfferingTypesByMemberId(memberId) {
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT ot.id, ot.name
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti."transactionId"
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    INNER JOIN offering_types ot ON ot.id = ti."offeringTypeId"
    WHERE t."memberId" = ${memberId}
      AND tt.name = 'Income'
    ORDER BY ot.name ASC
  `

  return rows.map((row) => ({ id: row.id, name: row.name }))
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

/** soul_win_winners.memberId and nbc_enrollments.teacherId are both
 * `onDelete: Restrict` at the DB level — deleting a member who's credited on
 * a soul-win record or teaching NBC students fails with a raw Postgres FK
 * violation unless those dependent rows are removed first. Deleting a
 * member cascades to these: their soul-win credit rows and (as teacher)
 * their students' NBC enrollments are deleted too — the underlying SoulWin
 * convert record and the student Member row are untouched (nbc_enrollments
 * cascades the *student* side already via schema-level onDelete: Cascade;
 * only the teacher side needs handling here). */
async function cascadeDeleteDependents(memberId, client = prisma) {
  await client.soulWinWinner.deleteMany({ where: { memberId } })
  await client.nbcEnrollment.deleteMany({ where: { teacherId: memberId } })
}

async function cascadeDeleteDependentsByIds(memberIds, client = prisma) {
  await client.soulWinWinner.deleteMany({ where: { memberId: { in: memberIds } } })
  await client.nbcEnrollment.deleteMany({ where: { teacherId: { in: memberIds } } })
}

function deleteById(id, client = prisma) {
  return client.member.delete({ where: { id } })
}

function findManyByIds(ids) {
  return prisma.member.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true },
  })
}

function deleteManyByIds(ids, client = prisma) {
  return client.member.deleteMany({ where: { id: { in: ids } } })
}

/** Runs `fn` (an async callback receiving a transactional Prisma client)
 * inside a single transaction. Used to make "cascade-delete dependents, then
 * delete the member" atomic — see cascadeDeleteDependents. */
function runInTransaction(fn) {
  return prisma.$transaction(fn)
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
  summarizeBreakdownByStatus,
  findById,
  existsById,
  findByName,
  findByEmail,
  findAttendancesByMemberId,
  countAttendancesByMemberId,
  findOfferingsByMemberId,
  summarizeOfferingsByMemberId,
  findOfferingTypesByMemberId,
  create,
  updateById,
  cascadeDeleteDependents,
  cascadeDeleteDependentsByIds,
  runInTransaction,
  deleteById,
  findManyByIds,
  deleteManyByIds,
  findConfig,
}
