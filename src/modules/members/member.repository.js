const prisma = require('../../config/prisma')

function buildWhere({ search, status }) {
  const where = {}

  if (search) {
    where.OR = [
      { email: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { middleName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ]
  }

  if (status) {
    where.status = { name: status }
  }

  return where
}

function findMany({ skip, limit, search, status }) {
  return prisma.member.findMany({
    where: buildWhere({ search, status }),
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { status: true, group: true },
  })
}

function count({ search, status }) {
  return prisma.member.count({ where: buildWhere({ search, status }) })
}

function findById(id) {
  return prisma.member.findUnique({
    where: { id },
    include: { status: true, group: true },
  })
}

module.exports = { findMany, count, findById }
