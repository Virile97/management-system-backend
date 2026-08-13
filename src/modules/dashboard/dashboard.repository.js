const { ActivityAction } = require('@prisma/client')
const prisma = require('../../config/prisma')

function countMembers() {
  return prisma.member.count()
}

function countMembersByStatusName(name) {
  return prisma.member.count({ where: { status: { name } } })
}

/**
 * All statuses with member counts + percentages in one SQL pass.
 * Matches prior behavior: only members with a status contribute to `total`.
 */
async function summarizeMembersByStatus() {
  const rows = await prisma.$queryRaw`
    WITH counts AS (
      SELECT
        s.name AS status,
        COUNT(m.id)::int AS count
      FROM statuses s
      LEFT JOIN members m ON m."statusId" = s.id
      GROUP BY s.name
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
    ORDER BY c.status ASC
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

function sumTransactionsByTypeName(typeName, { from, to } = {}) {
  return prisma.transaction.aggregate({
    where: {
      type: { name: typeName },
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    },
    _sum: { amount: true },
  })
}

/**
 * Monthly income/expense totals from `from` onward — no per-transaction materialization.
 * @returns {Promise<Array<{ year: number, month: number, type: string, amount: number }>>}
 * month is 1–12 (SQL EXTRACT).
 */
async function sumTransactionsByMonthAndType(from) {
  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR FROM t."createdAt")::int AS year,
      EXTRACT(MONTH FROM t."createdAt")::int AS month,
      tt.name AS type,
      COALESCE(SUM(t.amount), 0) AS amount
    FROM transactions t
    INNER JOIN transaction_types tt ON tt.id = t."typeId"
    WHERE t."createdAt" >= ${from}
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

function findRecentActivityLogs(limit) {
  return prisma.activityLog.findMany({
    where: { action: { not: ActivityAction.USER_LOGGED_IN } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      message: true,
      detail: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  })
}

/**
 * Distinct present members per calendar day in range.
 * @returns {Promise<Array<{ date: Date, present: number }>>}
 */
async function countPresentMembersByDate(from, to) {
  const rows = await prisma.$queryRaw`
    SELECT
      a.date,
      COUNT(DISTINCT a."memberId")::int AS present
    FROM attendances a
    WHERE a.date >= ${from}
      AND a.date <= ${to}
      AND (
        a."morningIn" IS NOT NULL
        OR a."morningOut" IS NOT NULL
        OR a."afternoonIn" IS NOT NULL
        OR a."afternoonOut" IS NOT NULL
      )
    GROUP BY a.date
    ORDER BY a.date ASC
  `

  return rows.map((row) => ({
    date: row.date,
    present: Number(row.present),
  }))
}

module.exports = {
  countMembers,
  countMembersByStatusName,
  summarizeMembersByStatus,
  sumTransactionsByTypeName,
  sumTransactionsByMonthAndType,
  findRecentActivityLogs,
  countPresentMembersByDate,
}
