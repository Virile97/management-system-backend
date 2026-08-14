const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 0,
})

function formatPHP(amount) {
  return phpFormatter.format(amount)
}

module.exports = { formatPHP }
