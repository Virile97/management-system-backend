const dashboardRepository = require('./dashboard.repository')
const { createMemoCache, createKeyedMemoCache } = require('../../shared/utils/memo-cache')
const { formatPHP } = require('../../shared/utils/currency')

const STATS_CACHE_TTL_MS = 60_000
const OVERVIEW_CACHE_TTL_MS = 60_000
const statsCache = createMemoCache(STATS_CACHE_TTL_MS)
const overviewCache = createKeyedMemoCache(OVERVIEW_CACHE_TTL_MS)

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
  // Aggregated in SQL; shape stays { total, breakdown: [{ status, count, percentage }] }.
  return dashboardRepository.summarizeMembersByStatus()
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
  const rows = await dashboardRepository.sumTransactionsByMonthAndType(rangeStart)

  for (const row of rows) {
    // SQL EXTRACT(MONTH) is 1–12; JS Date#getMonth() is 0–11.
    const key = `${row.year}-${row.month - 1}`
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

async function searchRecentActivity({ search, limit = 20 } = {}) {
  const q = typeof search === 'string' ? search.trim() : ''
  if (!q) return []

  const lmt = Number(limit) || 20
  const logs = await dashboardRepository.findActivityLogs({
    search: q,
    limit: lmt,
  })

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
      _dailyRates: [],
    })
  }

  return buckets
}

async function getAttendanceSummary(range) {
  const weeks = parseRangeWeeks(range)
  const buckets = buildEmptyWeekBuckets(weeks)
  const rangeStart = buckets.values().next().value.date
  const rangeEnd = addUtcDays(startOfWeekMondayUtc(new Date()), 6)

  const [totalMembers, dailyPresent] = await Promise.all([
    dashboardRepository.countMembers(),
    dashboardRepository.countPresentMembersByDate(rangeStart, rangeEnd),
  ])

  for (const row of dailyPresent) {
    const bucket = buckets.get(weekKey(row.date))
    if (!bucket || !totalMembers) continue

    bucket._dailyRates.push((row.present / totalMembers) * 100)
  }

  return Array.from(buckets.values()).map(({ key: _key, _dailyRates, ...bucket }) => {
    if (!_dailyRates.length) {
      return { ...bucket, percentage: 0 }
    }

    const rateSum = _dailyRates.reduce((sum, rate) => sum + rate, 0)
    return {
      ...bucket,
      percentage: Math.round((rateSum / _dailyRates.length) * 10) / 10,
    }
  })
}

async function computeOverview({ financeRange, attendanceRange, activityLimit }) {
  const [stats, memberBreakdown, financeSummary, attendanceSummary, recentActivity] =
    await Promise.all([
      getStats(),
      getMemberBreakdown(),
      getFinanceSummary(financeRange),
      getAttendanceSummary(attendanceRange),
      getRecentActivity(activityLimit),
    ])

  return {
    stats,
    memberBreakdown,
    financeSummary,
    attendanceSummary,
    recentActivity,
  }
}

async function getOverview({
  financeRange = '6m',
  attendanceRange = '5w',
  activityLimit = 5,
} = {}) {
  const cacheKey = `${financeRange}|${attendanceRange}|${activityLimit}`
  return overviewCache(cacheKey, () =>
    computeOverview({ financeRange, attendanceRange, activityLimit }),
  )
}

function clearDashboardCaches() {
  statsCache.clear()
  overviewCache.clear()
}

module.exports = {
  getOverview,
  // Kept for unit tests / internal reuse by getOverview
  getStats,
  getMemberBreakdown,
  getFinanceSummary,
  getRecentActivity,
  searchRecentActivity,
  getAttendanceSummary,
  _clearStatsCache: clearDashboardCaches,
  _clearDashboardCaches: clearDashboardCaches,
}
