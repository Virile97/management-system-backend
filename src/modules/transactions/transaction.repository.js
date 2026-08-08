const prisma = require('../../config/prisma')

function endOfDay(date) {
  const end = new Date(date)
  end.setHours(23, 59, 59, 999)
  return end
}

function buildWhere({ type, category, search, from, to }) {
  const where = {}

  if (type) {
    where.type = { name: type }
  }

  if (category) {
    where.category = { name: category }
  }

  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { category: { name: { contains: search, mode: 'insensitive' } } },
      { recordedByUser: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: endOfDay(to) } : {}),
    }
  }

  return where
}

function findMany({ skip, limit, type, category, search, from, to }) {
  return prisma.transaction.findMany({
    where: buildWhere({ type, category, search, from, to }),
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: {
      type: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      recordedByUser: { select: { id: true, name: true, email: true } },
    },
  })
}

function count({ type, category, search, from, to }) {
  return prisma.transaction.count({ where: buildWhere({ type, category, search, from, to }) })
}

function findById(id) {
  return prisma.transaction.findUnique({
    where: { id },
    include: {
      type: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      recordedByUser: { select: { id: true, name: true, email: true } },
    },
  })
}

function sumAmountByTypeName(typeName) {
  return prisma.transaction.aggregate({
    where: { type: { name: typeName } },
    _sum: { amount: true },
  })
}

function sumGroupedByCategory() {
  return prisma.transaction.findMany({
    select: { amount: true, category: { select: { id: true, name: true } } },
  })
}

function findAllForTrend(from) {
  return prisma.transaction.findMany({
    where: { createdAt: { gte: from } },
    select: { amount: true, createdAt: true, type: { select: { name: true } } },
  })
}

module.exports = {
  findMany,
  count,
  findById,
  sumAmountByTypeName,
  sumGroupedByCategory,
  findAllForTrend,
}
