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

const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
})

function formatPHP(amount) {
  return phpFormatter.format(amount)
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

  const monthlyIncomeAmount = toAmountNumber(monthlyIncome._sum.amount)

  return {
    totalMembers,
    activeMembers,
    inactiveMembers,
    monthlyIncome: monthlyIncomeAmount,
    monthlyIncomeFormatted: formatPHP(monthlyIncomeAmount),
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

function toActivityItem(log) {
  const actorName = log.actor?.name || log.actor?.email || null

  return {
    type: log.action,
    message: actorName ? `${log.message} by ${actorName}` : log.message,
    detail: log.detail,
    timestamp: log.createdAt,
  }
}

async function getRecentActivity(limit) {
  const lmt = Number(limit) || 0
  const logs = await dashboardRepository.findRecentActivityLogs(lmt)

  return logs.map(toActivityItem)
}

function parseRangeWeeks(range) {
  return parseInt(range, 10)
}

function toUtcDateOnly(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

// Week buckets start Monday to match the dashboard chart labels (Jul 6, Jul 13, …).
function startOfWeekMondayUtc(date) {
  const day = toUtcDateOnly(date)
  const weekday = day.getUTCDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  day.setUTCDate(day.getUTCDate() + diff)
  return day
}

function addUtcDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function dateKey(date) {
  const value = toUtcDateOnly(date)
  return `${value.getUTCFullYear()}-${value.getUTCMonth()}-${value.getUTCDate()}`
}

function weekKey(date) {
  return dateKey(startOfWeekMondayUtc(date))
}

function isPresent(attendance) {
  return Boolean(
    attendance.morningIn ||
      attendance.morningOut ||
      attendance.afternoonIn ||
      attendance.afternoonOut,
  )
}

function buildEmptyWeekBuckets(weeks) {
  const buckets = new Map()
  const currentWeekStart = startOfWeekMondayUtc(new Date())

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = addUtcDays(currentWeekStart, -7 * i)
    const key = dateKey(weekStart)
    buckets.set(key, {
      key,
      date: weekStart,
      label: weekStart.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      percentage: 0,
      _dailyPresent: new Map(),
    })
  }

  return buckets
}

async function getAttendanceSummary(range) {
  const weeks = parseRangeWeeks(range)
  const buckets = buildEmptyWeekBuckets(weeks)
  const rangeStart = buckets.values().next().value.date
  const rangeEnd = addUtcDays(startOfWeekMondayUtc(new Date()), 6)

  const [totalMembers, attendances] = await Promise.all([
    dashboardRepository.countMembers(),
    dashboardRepository.findAttendancesInRange(rangeStart, rangeEnd),
  ])

  for (const row of attendances) {
    if (!isPresent(row)) continue

    const bucket = buckets.get(weekKey(row.date))
    if (!bucket) continue

    const day = dateKey(row.date)
    const presentSet = bucket._dailyPresent.get(day) ?? new Set()
    presentSet.add(row.memberId)
    bucket._dailyPresent.set(day, presentSet)
  }

  return Array.from(buckets.values()).map(({ key: _key, _dailyPresent, ...bucket }) => {
    if (!totalMembers || _dailyPresent.size === 0) {
      return { ...bucket, percentage: 0 }
    }

    let rateSum = 0
    for (const presentSet of _dailyPresent.values()) {
      rateSum += (presentSet.size / totalMembers) * 100
    }

    return {
      ...bucket,
      percentage: Math.round((rateSum / _dailyPresent.size) * 10) / 10,
    }
  })
}

module.exports = {
  getStats,
  getMemberBreakdown,
  getFinanceSummary,
  getRecentActivity,
  getAttendanceSummary,
  _clearStatsCache: statsCache.clear,
}
