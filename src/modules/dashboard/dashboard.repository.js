const prisma = require('../../config/prisma')

function countMembers() {
  return prisma.member.count()
}

function countMembersByStatusName(name) {
  return prisma.member.count({ where: { status: { name } } })
}

function countMembersGroupedByStatus() {
  return prisma.status.findMany({
    select: { name: true, _count: { select: { members: true } } },
  })
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

function findRecentActivityLogs(limit) {
  return prisma.activityLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, action: true, message: true, detail: true, createdAt: true },
  })
}

module.exports = {
  countMembers,
  countMembersByStatusName,
  countMembersGroupedByStatus,
  sumTransactionsByTypeName,
  sumTransactionsGroupedByTypeInRange,
  findRecentActivityLogs,
}
