const transactionRepository = require('./transaction.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')
const { resolvePeriodRange, startOfMonth } = require('../../shared/utils/period-range')

function toAmountNumber(decimalValue) {
  return decimalValue ? Number(decimalValue) : 0
}

// Drops the raw FK ids that are redundant once the nested type/category/
// recordedByUser objects are present, and flattens breakdown line items to
// { offeringType, amount } pairs.
function toTransactionResponse(transaction) {
  const {
    typeId: _typeId,
    categoryId: _categoryId,
    recordedBy: _recordedBy,
    items,
    ...rest
  } = transaction

  return {
    ...rest,
    amount: toAmountNumber(rest.amount),
    breakdown: (items ?? []).map((item) => ({
      offeringType: item.offeringType,
      amount: toAmountNumber(item.amount),
    })),
  }
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

async function getStats(query) {
  const range = resolvePeriodRange(query)

  const [income, expense] = await Promise.all([
    transactionRepository.sumAmountByTypeName('Income', range),
    transactionRepository.sumAmountByTypeName('Expense', range),
  ])

  const totalIncome = toAmountNumber(income._sum.amount)
  const totalExpenses = toAmountNumber(expense._sum.amount)

  return {
    totalIncome,
    totalExpenses,
    netBalance: totalIncome - totalExpenses,
  }
}

async function getByOfferingType(query = {}) {
  const range = resolvePeriodRange(query)
  const grouped = await transactionRepository.sumGroupedByOfferingType(range, query.offeringTypeId)
  const offeringTypes = await transactionRepository.findOfferingTypesByIds(
    grouped.map((row) => row.offeringTypeId),
  )
  const namesById = new Map(offeringTypes.map((type) => [type.id, type.name]))

  return grouped
    .map((row) => ({
      offeringType: namesById.get(row.offeringTypeId) ?? 'Unknown',
      total: toAmountNumber(row._sum.amount),
    }))
    .sort((a, b) => b.total - a.total)
}

function buildEmptyDayBuckets(start, end) {
  const buckets = new Map()
  const cursor = new Date(start)
  cursor.setHours(0, 0, 0, 0)
  const last = new Date(end)
  last.setHours(0, 0, 0, 0)

  while (cursor <= last) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
    buckets.set(key, {
      key,
      label: cursor.toLocaleString('en-US', { month: 'short', day: 'numeric' }),
      income: 0,
      expense: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return buckets
}

function buildEmptyMonthBuckets(start, end) {
  const buckets = new Map()
  const cursor = startOfMonth(start)
  const last = startOfMonth(end)

  while (cursor <= last) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`
    buckets.set(key, {
      key,
      label: cursor.toLocaleString('en-US', { month: 'short' }),
      income: 0,
      expense: 0,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return buckets
}

function dayBucketKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function monthBucketKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`
}

async function getMonthlyTrend(query) {
  const { period } = query
  const range = resolvePeriodRange(query)
  const useDayBuckets = period === 'today' || period === 'month'

  let { start, end } = range
  if (!start || !end) {
    // 'all' has no bounds — derive the range from the actual data instead.
    const earliest = await transactionRepository.findEarliestTransactionDate()
    start = start ?? earliest ?? new Date()
    end = end ?? new Date()
  }

  const buckets = useDayBuckets ? buildEmptyDayBuckets(start, end) : buildEmptyMonthBuckets(start, end)
  const bucketKey = useDayBuckets ? dayBucketKey : monthBucketKey

  const transactions = await transactionRepository.findAllForTrend({ start, end })

  for (const tx of transactions) {
    const bucket = buckets.get(bucketKey(tx.createdAt))
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

async function getConfig() {
  return transactionRepository.findConfig()
}

async function createTransaction(data, actorId) {
  const { breakdown, amount, ...fields } = data

  const totalAmount = breakdown ? breakdown.reduce((sum, item) => sum + item.amount, 0) : amount

  const transaction = await transactionRepository.create({
    ...fields,
    amount: totalAmount,
    recordedBy: actorId,
    breakdown,
  })

  const action = transaction.type.name === 'Expense' ? 'EXPENSE_RECORDED' : 'INCOME_RECORDED'
  logActivity({
    action,
    message: transaction.type.name === 'Expense' ? 'Expense logged' : 'Income recorded',
    detail: transaction.category?.name ?? transaction.description ?? undefined,
    actorId,
  }).catch((err) => logger.error({ err }, `Failed to log ${action} activity`))

  return toTransactionResponse(transaction)
}

module.exports = {
  listTransactions,
  getTransactionById,
  getStats,
  getByOfferingType,
  getMonthlyTrend,
  getConfig,
  createTransaction,
}
