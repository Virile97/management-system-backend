const prisma = require('../../config/prisma')

function findByEmail(email) {
  return prisma.user.findUnique({ where: { email } })
}

function createUser({ email, password, name }) {
  return prisma.user.create({
    data: { email, password, name },
  })
}

module.exports = { findByEmail, createUser }
