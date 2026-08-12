const prisma = require('../../config/prisma')

function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } })
}

function findById(id) {
  return prisma.user.findUnique({ where: { id } })
}

function createUser({ email, password, name }) {
  return prisma.user.create({
    data: { email, password, name },
  })
}

function updatePassword(id, password) {
  return prisma.user.update({
    where: { id },
    data: { password },
  })
}

module.exports = { findByEmail, findById, createUser, updatePassword }
