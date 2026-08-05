const dashboardRepository = require('./dashboard.repository')
const { createMemoCache } = require('../../shared/utils/memo-cache')

const STATS_CACHE_TTL_MS = 60_000
const statsCache = createMemoCache(STATS_CACHE_TTL_MS)

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function startOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function toAmountNumber(decimalValue) {
  return decimalValue ? Number(decimalValue) : 0
}

async function computeStats() {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = startOfNextMonth(now)

  const [totalMembers, activeMembers, inactiveMembers, monthlyIncome] = await Promise.all([
    dashboardRepository.countMembers(),
    dashboardRepository.countMembersByStatusName('Active'),
    dashboardRepository.countMembersByStatusName('Inactive'),
    dashboardRepository.sumTransactionsByTypeName('Income', { from: monthStart, to: monthEnd }),
  ])

  return {
    totalMembers,
    activeMembers,
    inactiveMembers,
    monthlyIncome: toAmountNumber(monthlyIncome._sum.amount),
  }
}

async function getStats() {
  return statsCache(computeStats)
}

async function getMemberBreakdown() {
  const statuses = await dashboardRepository.countMembersGroupedByStatus()
  const total = statuses.reduce((sum, status) => sum + status._count.members, 0)

  return {
    total,
    breakdown: statuses.map((status) => ({
      status: status.name,
      count: status._count.members,
      percentage: total ? Math.round((status._count.members / total) * 1000) / 10 : 0,
    })),
  }
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

async function getFinanceSummary(range) {
  const months = parseRangeMonths(range)
  const now = new Date()
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

  const buckets = buildEmptyMonthBuckets(months)
  const transactions = await dashboardRepository.sumTransactionsGroupedByTypeInRange(rangeStart)

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

function memberActivityItem(member) {
  return {
    type: 'MEMBER_REGISTERED',
    message: 'New member registered',
    detail: [member.firstName, member.lastName].filter(Boolean).join(' '),
    timestamp: member.createdAt,
  }
}

function transactionActivityItem(transaction) {
  const isIncome = transaction.type.name === 'Income'

  return {
    type: isIncome ? 'INCOME_RECORDED' : 'EXPENSE_RECORDED',
    message: transaction.category?.name
      ? `${transaction.category.name} recorded`
      : 'Transaction recorded',
    detail: toAmountNumber(transaction.amount),
    timestamp: transaction.createdAt,
  }
}

async function getRecentActivity(limit) {
  const lmt = Number(limit) || 0

  const [members, transactions] = await Promise.all([
    dashboardRepository.findRecentMembers(lmt),
    dashboardRepository.findRecentTransactions(lmt),
  ])

  const activity = [
    ...members.map(memberActivityItem),
    ...transactions.map(transactionActivityItem),
  ]

  activity.sort((a, b) => b.timestamp - a.timestamp)

  return activity.slice(0, lmt)
}

module.exports = {
  getStats,
  getMemberBreakdown,
  getFinanceSummary,
  getRecentActivity,
  _clearStatsCache: statsCache.clear,
}
