const transactionRepository = require('./transaction.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')

function toAmountNumber(decimalValue) {
  return decimalValue ? Number(decimalValue) : 0
}

// Drops the raw FK ids that are redundant once the nested type/category/
// recordedByUser objects are present.
function toTransactionResponse(transaction) {
  const { typeId: _typeId, categoryId: _categoryId, recordedBy: _recordedBy, ...rest } = transaction
  return rest
}

async function listTransactions(query) {
  const { page, limit, skip } = getPagination(query)
  const { type, category, search, from, to } = query

  const [transactions, total] = await Promise.all([
    transactionRepository.findMany({ skip, limit, type, category, search, from, to }),
    transactionRepository.count({ type, category, search, from, to }),
  ])

  return {
    items: transactions.map(toTransactionResponse),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getTransactionById(id) {
  const transaction = await transactionRepository.findById(id)
  if (!transaction) {
    throw AppError.notFound('Transaction not found')
  }
  return toTransactionResponse(transaction)
}

async function getStats() {
  const [income, expense] = await Promise.all([
    transactionRepository.sumAmountByTypeName('Income'),
    transactionRepository.sumAmountByTypeName('Expense'),
  ])

  const totalIncome = toAmountNumber(income._sum.amount)
  const totalExpenses = toAmountNumber(expense._sum.amount)

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
  }
}

async function getByCategory() {
  const transactions = await transactionRepository.sumGroupedByCategory()

  const totals = new Map()
  for (const tx of transactions) {
    const key = tx.category?.id ?? 'uncategorized'
    const name = tx.category?.name ?? 'Uncategorized'
    const existing = totals.get(key) ?? { category: name, total: 0 }
    existing.total += toAmountNumber(tx.amount)
    totals.set(key, existing)
  }

  return Array.from(totals.values()).sort((a, b) => b.total - a.total)
}

function parseRangeMonths(range) {
  return parseInt(range, 10)
}

function buildEmptyMonthBuckets(months) {
  const now = new Date()
  const buckets = new Map()

  for (let i = months - 1; i >= 0; i -= 1) {
    const bucketDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${bucketDate.getFullYear()}-${bucketDate.getMonth()}`
    buckets.set(key, {
      key,
      label: bucketDate.toLocaleString('en-US', { month: 'short' }),
      income: 0,
      expense: 0,
    })
  }

  return buckets
}

async function getMonthlyTrend(range) {
  const months = parseRangeMonths(range)
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  const buckets = buildEmptyMonthBuckets(months)
  const transactions = await transactionRepository.findAllForTrend(rangeStart)

  for (const tx of transactions) {
    const key = `${tx.createdAt.getFullYear()}-${tx.createdAt.getMonth()}`
    const bucket = buckets.get(key)

    if (!bucket) continue

    const amount = toAmountNumber(tx.amount)
    if (tx.type.name === 'Income') {
      bucket.income += amount
    } else if (tx.type.name === 'Expense') {
      bucket.expense += amount
    }
  }

  return Array.from(buckets.values()).map(({ key: _key, ...bucket }) => bucket)
}

module.exports = {
  listTransactions,
  getTransactionById,
  getStats,
  getByCategory,
  getMonthlyTrend,
}
