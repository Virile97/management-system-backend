function startOfDay(date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfDay(date) {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

// Weeks run Sunday–Saturday.
function startOfWeek(date) {
  const result = startOfDay(date)
  result.setDate(result.getDate() - result.getDay())
  return result
}

function endOfWeek(date) {
  const result = startOfWeek(date)
  result.setDate(result.getDate() + 6)
  return endOfDay(result)
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0)
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}

function startOfYear(date) {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0)
}

// Resolves a period tab (today/week/month/year/all/custom) into a concrete
// { start, end } Date range. `start`/`end` are null for `all`, meaning
// unbounded. `custom` uses the provided from/to as-is (end widened to the
// end of that day so a same-day range isn't empty). `year` ends at "now"
// rather than Dec 31 so trend buckets don't pad out with empty future months.
function resolvePeriodRange({ period = 'month', from, to } = {}) {
  const now = new Date()

  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) }
    case 'week':
      return { start: startOfWeek(now), end: endOfWeek(now) }
    case 'year':
      return { start: startOfYear(now), end: now }
    case 'all':
      return { start: null, end: null }
    case 'custom':
      return {
        start: from ? startOfDay(from) : null,
        end: to ? endOfDay(to) : null,
      }
    case 'month':
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) }
  }
}

module.exports = {
  resolvePeriodRange,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
}
