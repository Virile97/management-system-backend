const { Prisma } = require('@prisma/client')
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

function endOfDay(date) {
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end
}

function buildWhere({ search, status, from, to }) {
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
    const pattern = `%${search}%`
    conditions.push(Prisma.sql`(
      COALESCE(m.email, '') ILIKE ${pattern}
      OR m."firstName" ILIKE ${pattern}
      OR COALESCE(m."middleName", '') ILIKE ${pattern}
      OR m."lastName" ILIKE ${pattern}
    )`)
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

function buildCreatedAtRange({ start, end }) {
  if (!start && !end) return undefined
  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: end } : {}),
  }
}

// Offerings are the member's Income transactions; each one carries its
// per-offering-type breakdown in `items`. The offering type filter is applied
// both to the transaction (so non-matching ones drop out entirely) and to the
// included items (so only matching lines come back).
function buildOfferingFilter(memberId, range, offeringTypeIds) {
  const typeFilter = offeringTypeIds?.length ? { offeringTypeId: { in: offeringTypeIds } } : null

  return {
    typeFilter,
    where: {
      memberId,
      type: { name: 'Income' },
      createdAt: buildCreatedAtRange(range),
      ...(typeFilter ? { items: { some: typeFilter } } : {}),
    },
  }
}

// Paging happens at the transaction level, so a page holds `take` transactions
// and yields at least that many rows once multi-type breakdowns are flattened.
function findOfferingsByMemberId(memberId, range = {}, offeringTypeIds, { skip, take } = {}) {
  const { where, typeFilter } = buildOfferingFilter(memberId, range, offeringTypeIds)

  return prisma.transaction.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    ...(skip === undefined ? {} : { skip }),
    ...(take === undefined ? {} : { take }),
    select: {
      id: true,
      description: true,
      amount: true,
      createdAt: true,
      items: {
        ...(typeFilter ? { where: typeFilter } : {}),
        select: {
          id: true,
          amount: true,
          offeringType: { select: { id: true, name: true } },
        },
      },
    },
  })
}

function countOfferingsByMemberId(memberId, range = {}, offeringTypeIds) {
  const { where } = buildOfferingFilter(memberId, range, offeringTypeIds)
  return prisma.transaction.count({ where })
}

// The displayed row count, which is the line item count plus the offerings
// recorded as a flat amount with no breakdown. A type filter excludes those
// flat-amount offerings by definition, since they carry no offering type.
async function countOfferingRowsByMemberId(memberId, range = {}, offeringTypeIds) {
  const { where, typeFilter } = buildOfferingFilter(memberId, range, offeringTypeIds)

  const [itemRows, flatRows] = await Promise.all([
    prisma.transactionItem.count({ where: { ...(typeFilter ?? {}), transaction: where } }),
    typeFilter ? 0 : prisma.transaction.count({ where: { ...where, items: { none: {} } } }),
  ])

  return itemRows + flatRows
}

// Summed across the whole filtered set rather than the current page. With a
// type filter the total has to come from the line items, since only some of a
// transaction's items are in scope.
function sumOfferingsByMemberId(memberId, range = {}, offeringTypeIds) {
  const { where, typeFilter } = buildOfferingFilter(memberId, range, offeringTypeIds)

  if (typeFilter) {
    return prisma.transactionItem.aggregate({
      where: { ...typeFilter, transaction: where },
      _sum: { amount: true },
    })
  }

  return prisma.transaction.aggregate({ where, _sum: { amount: true } })
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
  summarizeBreakdownByStatus,
  findById,
  existsById,
  findByName,
  findByEmail,
  findAttendancesByMemberId,
  countAttendancesByMemberId,
  findOfferingsByMemberId,
  countOfferingsByMemberId,
  countOfferingRowsByMemberId,
  sumOfferingsByMemberId,
  findOfferingTypesByMemberId,
  create,
  updateById,
  deleteById,
  findManyByIds,
  deleteManyByIds,
  findConfig,
}
