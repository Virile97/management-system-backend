const prisma = require('../../config/prisma')

function countMembers() {
  return prisma.member.count()
}

function countMembersByStatusName(name) {
  return prisma.member.count({ where: { status: { name } } })
}

function sumTransactionsByTypeName(typeName, { from, to } = {}) {
  return prisma.transaction.aggregate({
    where: {
      type: { name: typeName },
      ...(from || to
        ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
        : {}),
    },
    _sum: { amount: true },
  })
}

function sumTransactionsGroupedByTypeInRange(from) {
  return prisma.transaction.findMany({
    where: { createdAt: { gte: from } },
    select: { amount: true, createdAt: true, type: { select: { name: true } } },
  })
}

function findRecentMembers(limit) {
  return prisma.member.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, firstName: true, lastName: true, createdAt: true },
  })
}

function findRecentTransactions(limit) {
  return prisma.transaction.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      amount: true,
      createdAt: true,
      type: { select: { name: true } },
      category: { select: { name: true } },
    },
  })
}

module.exports = {
  countMembers,
  countMembersByStatusName,
  sumTransactionsByTypeName,
  sumTransactionsGroupedByTypeInRange,
  findRecentMembers,
  findRecentTransactions,
}
