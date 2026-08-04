const prisma = require('../../config/prisma')

function findMany({ skip, limit, where }) {
  return prisma.post.findMany({
    where,
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, name: true, email: true } } },
  })
}

function count(where) {
  return prisma.post.count({ where })
}

function findById(id) {
  return prisma.post.findUnique({
    where: { id },
    include: { author: { select: { id: true, name: true, email: true } } },
  })
}

function create(data) {
  return prisma.post.create({ data })
}

function updateById(id, data) {
  return prisma.post.update({ where: { id }, data })
}

function deleteById(id) {
  return prisma.post.delete({ where: { id } })
}

module.exports = { findMany, count, findById, create, updateById, deleteById }
