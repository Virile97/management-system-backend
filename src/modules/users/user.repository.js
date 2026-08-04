const prisma = require('../../config/prisma')

function findMany({ skip, limit }) {
  return prisma.user.findMany({
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })
}

function count() {
  return prisma.user.count()
}

function findById(id) {
  return prisma.user.findUnique({ where: { id } })
}

function updateById(id, data) {
  return prisma.user.update({ where: { id }, data })
}

function deleteById(id) {
  return prisma.user.delete({ where: { id } })
}

module.exports = { findMany, count, findById, updateById, deleteById }
