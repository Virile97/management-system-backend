const ROLES = Object.freeze({
  USER: 'USER',
  ADMIN: 'ADMIN',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
})

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
})

module.exports = { ROLES, PAGINATION }
