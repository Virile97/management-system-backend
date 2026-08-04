function toISODate(date) {
  return new Date(date).toISOString()
}

function isPastDate(date) {
  return new Date(date).getTime() < Date.now()
}

function addDays(date, days) {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

module.exports = { toISODate, isPastDate, addDays }
