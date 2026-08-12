const { ActivityAction } = require('@prisma/client')
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
    where: { action: { not: ActivityAction.USER_LOGGED_IN } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      action: true,
      message: true,
      detail: true,
      createdAt: true,
      actor: { select: { id: true, name: true, email: true } },
    },
  })
}

function findAttendancesInRange(from, to) {
  return prisma.attendance.findMany({
    where: {
      date: {
        gte: from,
        lte: to,
      },
    },
    select: {
      memberId: true,
      date: true,
      morningIn: true,
      morningOut: true,
      afternoonIn: true,
      afternoonOut: true,
    },
  })
}

module.exports = {
  countMembers,
  countMembersByStatusName,
  countMembersGroupedByStatus,
  sumTransactionsByTypeName,
  sumTransactionsGroupedByTypeInRange,
  findRecentActivityLogs,
  findAttendancesInRange,
}
