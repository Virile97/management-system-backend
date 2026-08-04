const authRepository = require('./auth.repository')
const { AppError } = require('../../shared/errors')
const { hashPassword, comparePassword, signToken } = require('../../shared/utils')

function toSafeUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

async function register({ email, password, name }) {
  const existing = await authRepository.findByEmail(email)
  if (existing) {
    throw AppError.conflict('An account with this email already exists')
  }

  const hashedPassword = await hashPassword(password)
  const user = await authRepository.createUser({ email, password: hashedPassword, name })

  const token = signToken({ sub: user.id, role: user.role })
  return { user: toSafeUser(user), token }
}

async function login({ email, password }) {
  const user = await authRepository.findByEmail(email)
  if (!user) {
    throw AppError.unauthorized('Invalid email or password')
  }

  const passwordMatches = await comparePassword(password, user.password)
  if (!passwordMatches) {
    throw AppError.unauthorized('Invalid email or password')
  }

  const token = signToken({ sub: user.id, role: user.role })
  return { user: toSafeUser(user), token }
}

module.exports = { register, login, toSafeUser }
