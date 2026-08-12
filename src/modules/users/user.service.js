const userRepository = require('./user.repository')
const inviteEmail = require('./user-invite.email')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const passwordSetupToken = require('../../shared/utils/password-setup-token')
const logger = require('../../config/logger')

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

async function createUser({ name, email, contact, role }) {
  const normalizedEmail = email.trim().toLowerCase()
  const existing = await userRepository.findByEmail(normalizedEmail)
  if (existing) {
    throw AppError.conflict('An account with this email already exists')
  }

  const user = await userRepository.create({
    email: normalizedEmail,
    password: null,
    name: name.trim(),
    contact: contact.trim(),
    role,
  })

  const { rawToken, expiresAt } = await passwordSetupToken.issuePasswordSetupToken(user.id)

  try {
    await inviteEmail.sendAccountCreatedEmail({
      name: user.name,
      email: user.email,
      role: user.role,
      setupToken: rawToken,
      expiresAt,
    })
  } catch (err) {
    logger.error({ err, email: user.email }, 'Failed to send account-created email')
  }

  return toSafeUser(user)
}

async function updateUser(id, data) {
  const existing = await userRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('User not found')
  }

  if (data.email && data.email.trim().toLowerCase() !== existing.email) {
    const emailTaken = await userRepository.findByEmail(data.email.trim().toLowerCase())
    if (emailTaken) {
      throw AppError.conflict('An account with this email already exists')
    }
  }

  const payload = { ...data }
  if (payload.email) {
    payload.email = payload.email.trim().toLowerCase()
  }
  if (typeof payload.name === 'string') {
    payload.name = payload.name.trim()
  }
  if (typeof payload.contact === 'string') {
    payload.contact = payload.contact.trim()
  }

  const updated = await userRepository.updateById(id, payload)
  return toSafeUser(updated)
}

async function deleteUser(id) {
  const existing = await userRepository.findById(id)
  if (!existing) {
    throw AppError.notFound('User not found')
  }

  await userRepository.deleteById(id)
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toSafeUser,
}
