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

function buildListFilterSql({ type, category, search, from, to }) {
  const conditions = [Prisma.sql`TRUE`]

  if (type) {
    conditions.push(Prisma.sql`tt.name = ${type}`)
  }

  if (category) {
    conditions.push(Prisma.sql`c.name = ${category}`)
  }

  if (from) {
    conditions.push(Prisma.sql`t."createdAt" >= ${from}`)
  }

  if (to) {
    conditions.push(Prisma.sql`t."createdAt" <= ${endOfDay(to)}`)
  }

  if (search) {
    const pattern = `%${search}%`
    conditions.push(Prisma.sql`(
      t.description ILIKE ${pattern}
      OR c.name ILIKE ${pattern}
      OR u.name ILIKE ${pattern}
      OR EXISTS (
        SELECT 1
        FROM transaction_items ti
        INNER JOIN offering_types ot ON ot.id = ti."offeringTypeId"
        WHERE ti."transactionId" = t.id AND ot.name ILIKE ${pattern}
      )
    )`)
  }

  return Prisma.join(conditions, ' AND ')
}

function mapListRow(row) {
  const breakdown = Array.isArray(row.breakdown) ? row.breakdown : []

  return {
    id: row.id,
    memberId: row.memberId,
    description: row.description,
    amount: row.amount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    type: row.type,
    category: row.category,
    recordedByUser: row.recordedByUser,
    // Keep Prisma-shaped `items` so the service mapper stays unchanged.
    items: breakdown.map((item) => ({
      offeringType: item.offeringType,
      amount: item.amount,
    })),
  }
}

/**
 * One SQL round-trip: joins type/category/user and aggregates line items as JSON.
 * Avoids Prisma's per-relation follow-up queries on the finance list.
 */
async function findMany({ skip, limit, type, category, search, from, to }) {
  const whereSql = buildListFilterSql({ type, category, search, from, to })

  const rows = await prisma.$queryRaw`
    SELECT
      t.id,
      t."memberId",
      t.description,
      t.amount,
      t."createdAt",
      t."updatedAt",
      json_build_object('id', tt.id, 'name', tt.name) AS type,
      CASE
        WHEN c.id IS NULL THEN NULL
        ELSE json_build_object('id', c.id, 'name', c.name)
      END AS category,
      CASE
        WHEN u.id IS NULL THEN NULL
        ELSE json_build_object('id', u.id, 'name', u.name, 'email', u.email)
      END AS "recordedByUser",
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'offeringType', json_build_object('id', ot.id, 'name', ot.name),
              'amount', ti.amount
            )
            ORDER BY ti."createdAt" ASC, ti.id ASC
          )
          FROM transaction_items ti
          INNER JOIN offering_types ot ON ot.id = ti."offeringTypeId"
          WHERE ti."transactionId" = t.id
        ),
        '[]'::json
      ) AS breakdown
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    LEFT JOIN categories c ON c.id = t."categoryId"
    LEFT JOIN users u ON u.id = t."recordedBy"
    WHERE ${whereSql}
    ORDER BY t."createdAt" DESC
    LIMIT ${limit} OFFSET ${skip}
  `

  return rows.map(mapListRow)
}

async function count({ type, category, search, from, to }) {
  const whereSql = buildListFilterSql({ type, category, search, from, to })

  const rows = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS total
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    LEFT JOIN categories c ON c.id = t."categoryId"
    LEFT JOIN users u ON u.id = t."recordedBy"
    WHERE ${whereSql}
  `

  return Number(rows[0]?.total ?? 0)
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

function buildCreatedAtFilterSql({ start, end } = {}) {
  const conditions = [Prisma.sql`TRUE`]
  if (start) conditions.push(Prisma.sql`t."createdAt" >= ${start}`)
  if (end) conditions.push(Prisma.sql`t."createdAt" <= ${end}`)
  return Prisma.join(conditions, ' AND ')
}

/**
 * Income + expense totals in one scan (replaces two separate aggregates).
 * @returns {Promise<{ income: number, expense: number }>}
 */
async function sumIncomeAndExpense(range = {}) {
  const whereSql = buildCreatedAtFilterSql(range)

  const rows = await prisma.$queryRaw`
    SELECT
      COALESCE(SUM(CASE WHEN tt.name = 'Income' THEN t.amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN tt.name = 'Expense' THEN t.amount ELSE 0 END), 0) AS expense
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    WHERE ${whereSql}
  `

  return {
    income: Number(rows[0]?.income ?? 0),
    expense: Number(rows[0]?.expense ?? 0),
  }
}

function sumAmountByTypeName(typeName, range = {}) {
  return prisma.transaction.aggregate({
    where: { type: { name: typeName }, createdAt: buildCreatedAtRange(range) },
    _sum: { amount: true },
  })
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

// TransactionItem.transactionId is onDelete: Cascade at the schema level, so
// a plain delete already removes the breakdown rows atomically — no need for
// an interactive $transaction (see the create()/updateById() comments above).
function deleteById(id) {
  return prisma.transaction.delete({ where: { id } })
}

function deleteManyByIds(ids) {
  return prisma.transaction.deleteMany({ where: { id: { in: ids } } })
}

module.exports = {
  findMany,
  count,
  findById,
  sumIncomeAndExpense,
  sumAmountByTypeName,
  sumByOfferingType,
  sumTrendGrouped,
  findEarliestTransactionDate,
  findConfig,
  create,
  updateById,
  deleteById,
  deleteManyByIds,
}
