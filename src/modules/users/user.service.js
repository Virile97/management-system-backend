const userRepository = require('./user.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')

function toSafeUser(user) {
  const { password: _password, ...safeUser } = user
  return safeUser
}

async function listUsers(query) {
  const { page, limit, skip } = getPagination(query)
  const [users, total] = await Promise.all([
    userRepository.findMany({ skip, limit }),
    userRepository.count(),
  ])

  return {
    items: users.map(toSafeUser),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getUserById(id) {
  const user = await userRepository.findById(id)
  if (!user) {
    throw AppError.notFound('User not found')
  }
  return toSafeUser(user)
}

async function updateUser(id, data) {
  const existing = await userRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('User not found')
  }

  const updated = await userRepository.updateById(id, data)
  return toSafeUser(updated)
}

async function deleteUser(id) {
  const existing = await userRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('User not found')
  }

  await userRepository.deleteById(id)
}

module.exports = { listUsers, getUserById, updateUser, deleteUser, toSafeUser }
