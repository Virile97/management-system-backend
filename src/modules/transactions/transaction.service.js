const transactionRepository = require('./transaction.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')
const { resolvePeriodRange, startOfMonth } = require('../../shared/utils/period-range')
const { formatPHP } = require('../../shared/utils/currency')

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
  const { income: totalIncome, expense: totalExpenses } =
    await transactionRepository.sumIncomeAndExpense(range)
  const netBalance = totalIncome - totalExpenses

  return {
    totalIncome,
    totalExpenses,
    netBalance,
    totalIncomeFormatted: formatPHP(totalIncome),
    totalExpensesFormatted: formatPHP(totalExpenses),
    netBalanceFormatted: formatPHP(netBalance),
  }
}

async function getByOfferingType(query = {}) {
  const range = resolvePeriodRange(query)
  // Aggregated in SQL; shape stays [{ offeringType, total }].
  return transactionRepository.sumByOfferingType(range, query.offeringTypeId)
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

async function getMonthlyTrend(query) {
  const { period } = query
  const range = resolvePeriodRange(query)
  const useDayBuckets = period === 'today' || period === 'month'
  const grain = useDayBuckets ? 'day' : 'month'

  let { start, end } = range
  if (!start || !end) {
    // 'all' has no bounds — derive the range from the actual data instead.
    const earliest = await transactionRepository.findEarliestTransactionDate()
    start = start ?? earliest ?? new Date()
    end = end ?? new Date()
  }

  const buckets = useDayBuckets ? buildEmptyDayBuckets(start, end) : buildEmptyMonthBuckets(start, end)
  const rows = await transactionRepository.sumTrendGrouped({ start, end, grain })

  for (const row of rows) {
    // SQL EXTRACT month/day are 1-based; JS Date getters are 0-based for month.
    const key = useDayBuckets
      ? `${row.year}-${row.month - 1}-${row.day}`
      : `${row.year}-${row.month - 1}`
    const bucket = buckets.get(key)
    if (!bucket) continue

    if (row.type === 'Income') {
      bucket.income += row.amount
    } else if (row.type === 'Expense') {
      bucket.expense += row.amount
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

async function updateTransaction(id, data) {
  const existing = await transactionRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('Transaction not found')
  }

  const { breakdown, amount, ...fields } = data
  const totalAmount =
    breakdown !== undefined
      ? breakdown.reduce((sum, item) => sum + item.amount, 0)
      : amount

  const transaction = await transactionRepository.updateById(id, {
    ...fields,
    ...(totalAmount !== undefined ? { amount: totalAmount } : {}),
    ...(breakdown !== undefined ? { breakdown } : {}),
  })

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
  updateTransaction,
}
