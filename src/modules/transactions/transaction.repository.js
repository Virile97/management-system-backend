const { Prisma } = require('@prisma/client')
const prisma = require('../../config/prisma')

const transactionIncludes = {
  type: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  recordedByUser: { select: { id: true, name: true, email: true } },
  items: { include: { offeringType: { select: { id: true, name: true } } } },
}

function endOfDay(date) {
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end
}

function buildWhere({ type, category, search, from, to }) {
  const where = {}

  if (type) {
    where.type = { name: type }
  }

  if (category) {
    where.category = { name: category }
  }

  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { category: { name: { contains: search, mode: 'insensitive' } } },
      { recordedByUser: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: endOfDay(to) } : {}),
    }
  }

  return where
}

function findMany({ skip, limit, type, category, search, from, to }) {
  return prisma.transaction.findMany({
    where: buildWhere({ type, category, search, from, to }),
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: transactionIncludes,
  })
}

function count({ type, category, search, from, to }) {
  return prisma.transaction.count({ where: buildWhere({ type, category, search, from, to }) })
}

function findById(id) {
  return prisma.transaction.findUnique({
    where: { id },
    include: transactionIncludes,
  })
}

function buildCreatedAtRange({ start, end }) {
  if (!start && !end) return undefined
  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: end } : {}),
  }
}

function sumAmountByTypeName(typeName, range = {}) {
  return prisma.transaction.aggregate({
    where: { type: { name: typeName }, createdAt: buildCreatedAtRange(range) },
    _sum: { amount: true },
  })
}

function buildCreatedAtFilterSql({ start, end } = {}) {
  const conditions = [Prisma.sql`TRUE`]
  if (start) conditions.push(Prisma.sql`t."createdAt" >= ${start}`)
  if (end) conditions.push(Prisma.sql`t."createdAt" <= ${end}`)
  return Prisma.join(conditions, ' AND ')
}

/**
 * Offering-type totals in one SQL pass (name + sum), sorted by total desc.
 * @returns {Promise<Array<{ offeringType: string, total: number }>>}
 */
async function sumByOfferingType(range = {}, offeringTypeIds) {
  const conditions = [buildCreatedAtFilterSql(range)]

  if (offeringTypeIds?.length) {
    conditions.push(Prisma.sql`ti."offeringTypeId" IN (${Prisma.join(offeringTypeIds)})`)
  }

  const whereSql = Prisma.join(conditions, ' AND ')

  const rows = await prisma.$queryRaw`
    SELECT
      ot.name AS "offeringType",
      COALESCE(SUM(ti.amount), 0) AS total
    FROM transaction_items ti
    INNER JOIN transactions t ON t.id = ti."transactionId"
    INNER JOIN offering_types ot ON ot.id = ti."offeringTypeId"
    WHERE ${whereSql}
    GROUP BY ot.name
    ORDER BY total DESC, ot.name ASC
  `

  return rows.map((row) => ({
    offeringType: row.offeringType,
    total: Number(row.total),
  }))
}

/**
 * Trend aggregates by day or month — no per-transaction materialization.
 * month/day use SQL EXTRACT (1–12 / 1–31).
 * @returns {Promise<Array<{ year: number, month: number, day?: number, type: string, amount: number }>>}
 */
async function sumTrendGrouped({ start, end, grain }) {
  const whereSql = buildCreatedAtFilterSql({ start, end })

  if (grain === 'day') {
    const rows = await prisma.$queryRaw`
      SELECT
        EXTRACT(YEAR FROM t."createdAt")::int AS year,
        EXTRACT(MONTH FROM t."createdAt")::int AS month,
        EXTRACT(DAY FROM t."createdAt")::int AS day,
        tt.name AS type,
        COALESCE(SUM(t.amount), 0) AS amount
      FROM transactions t
      INNER JOIN transaction_types tt ON tt.id = t."typeId"
      WHERE ${whereSql}
      GROUP BY 1, 2, 3, 4
      ORDER BY 1, 2, 3, 4
    `

    return rows.map((row) => ({
      year: Number(row.year),
      month: Number(row.month),
      day: Number(row.day),
      type: row.type,
      amount: Number(row.amount),
    }))
  }

  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM t."createdAt")::int AS year,
      EXTRACT(MONTH FROM t."createdAt")::int AS month,
      tt.name AS type,
      COALESCE(SUM(t.amount), 0) AS amount
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    WHERE ${whereSql}
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `

  return rows.map((row) => ({
    year: Number(row.year),
    month: Number(row.month),
    type: row.type,
    amount: Number(row.amount),
  }))
}

async function findEarliestTransactionDate() {
  const earliest = await prisma.transaction.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  return earliest?.createdAt ?? null
}

async function findConfig() {
  const [types, categories, offeringTypes] = await Promise.all([
    prisma.transactionType.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.offeringType.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return { types, categories, offeringTypes }
}

// A single create() with a nested items.create is already one atomic
// query, so this doesn't need to be wrapped in an interactive
// prisma.$transaction() — doing so risks hitting the interactive
// transaction's 5s timeout under the Supabase pooler's network latency.
function create({ typeId, categoryId, memberId, description, date, amount, recordedBy, breakdown }) {
  return prisma.transaction.create({
    data: {
      type: { connect: { id: typeId } },
      ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
      ...(memberId ? { member: { connect: { id: memberId } } } : {}),
      description,
      amount,
      ...(date ? { createdAt: date } : {}),
      ...(recordedBy ? { recordedByUser: { connect: { id: recordedBy } } } : {}),
      ...(breakdown
        ? {
            items: {
              create: breakdown.map((item) => ({
                amount: item.amount,
                offeringType: { connect: { id: item.offeringTypeId } },
              })),
            },
          }
        : {}),
    },
    include: transactionIncludes,
  })
}

// Nested deleteMany + create on items is still one Prisma update call, so it
// stays a single round-trip and doesn't need an interactive $transaction.
function updateById(id, { typeId, categoryId, memberId, description, date, amount, breakdown }) {
  return prisma.transaction.update({
    where: { id },
    data: {
      ...(typeId !== undefined ? { type: { connect: { id: typeId } } } : {}),
      ...(categoryId === null
        ? { category: { disconnect: true } }
        : categoryId !== undefined
          ? { category: { connect: { id: categoryId } } }
          : {}),
      ...(memberId === null
        ? { member: { disconnect: true } }
        : memberId !== undefined
          ? { member: { connect: { id: memberId } } }
          : {}),
      ...(description !== undefined ? { description } : {}),
      ...(date !== undefined ? { createdAt: date } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(breakdown !== undefined
        ? {
            items: {
              deleteMany: {},
              create: breakdown.map((item) => ({
                amount: item.amount,
                offeringType: { connect: { id: item.offeringTypeId } },
              })),
            },
          }
        : // Flat amount edit — drop any previous breakdown so totals stay consistent.
          amount !== undefined
          ? { items: { deleteMany: {} } }
          : {}),
    },
    include: transactionIncludes,
  })
}

module.exports = {
  findMany,
  count,
  findById,
  sumAmountByTypeName,
  sumByOfferingType,
  sumTrendGrouped,
  findEarliestTransactionDate,
  findConfig,
  create,
  updateById,
}
