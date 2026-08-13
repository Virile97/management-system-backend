/**
 * Measure hot-path SQL plans against the configured DATABASE_URL.
 *
 * Usage:
 *   node scripts/measure-hot-queries.js
 *
 * Looks for Seq Scan / high cost on members, transactions, attendances, activity_logs.
 */
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function explain(label, sql) {
  console.log(`\n=== ${label} ===`)
  const rows = await prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) ${sql}`)
  for (const row of rows) {
    console.log(Object.values(row)[0])
  }
}

async function main() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const fiveWeeksAgo = new Date(now)
  fiveWeeksAgo.setUTCDate(fiveWeeksAgo.getUTCDate() - 35)

  await explain(
    'members by createdAt range',
    `SELECT id FROM members WHERE "createdAt" >= '${monthStart.toISOString()}' ORDER BY "createdAt" DESC LIMIT 20`,
  )

  await explain(
    'transactions by typeId + createdAt (income month)',
    `SELECT COALESCE(SUM(amount), 0) FROM transactions t
     INNER JOIN transaction_types tt ON tt.id = t."typeId"
     WHERE tt.name = 'Income' AND t."createdAt" >= '${monthStart.toISOString()}'`,
  )

  await explain(
    'transactions trend group by month (6m)',
    `SELECT EXTRACT(YEAR FROM t."createdAt")::int, EXTRACT(MONTH FROM t."createdAt")::int, tt.name, SUM(t.amount)
     FROM transactions t
     INNER JOIN transaction_types tt ON tt.id = t."typeId"
     WHERE t."createdAt" >= '${sixMonthsAgo.toISOString()}'
     GROUP BY 1, 2, 3`,
  )

  await explain(
    'attendances in date range (distinct members)',
    `SELECT date, COUNT(DISTINCT "memberId")
     FROM attendances
     WHERE date >= DATE '${fiveWeeksAgo.toISOString().slice(0, 10)}'
     GROUP BY date`,
  )

  await explain(
    'recent activity excluding login',
    `SELECT id FROM activity_logs
     WHERE action <> 'USER_LOGGED_IN'
     ORDER BY "createdAt" DESC
     LIMIT 5`,
  )

  console.log('\nDone. Prefer Index Scan / Bitmap Index Scan over Seq Scan on large tables.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
