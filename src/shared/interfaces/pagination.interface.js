/**
 * Shape reference for a paginated result (JS has no interfaces, kept as a factory + JSDoc typedef).
 * @typedef {{ page: number, limit: number, total: number, totalPages: number }} PaginationMeta
 */

function createPaginatedResult(items, meta) {
  return { items, meta }
}

module.exports = { createPaginatedResult }
