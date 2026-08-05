const prisma = require('../../config/prisma')

function buildWhere({ type, category }) {
  const where = {}

  if (type) {
    where.type = { name: type }
  }

  if (category) {
    where.category = { name: category }
  }

  return where
}

function findMany({ skip, limit, type, category }) {
  return prisma.transaction.findMany({
    where: buildWhere({ type, category }),
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { type: true, category: true, member: true },
  })
}

function count({ type, category }) {
  return prisma.transaction.count({ where: buildWhere({ type, category }) })
}

function findById(id) {
  return prisma.transaction.findUnique({
    where: { id },
    include: { type: true, category: true, member: true },
  })
}

module.exports = { findMany, count, findById }
