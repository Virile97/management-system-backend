const { PAGINATION } = require('../../config/constants')

function getPagination(query) {
  const page = Math.max(parseInt(query.page, 10) || PAGINATION.DEFAULT_PAGE, 1)
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT, 1),
    PAGINATION.MAX_LIMIT,
  )
  const skip = (page - 1) * limit

  return { page, limit, skip }
}

function buildMeta({ page, limit, total }) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0,
  }
}

module.exports = { getPagination, buildMeta }
