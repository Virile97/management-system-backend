const authRepository = require('./auth.repository')
const { AppError } = require('../../shared/errors')
const { hashPassword, comparePassword, signToken } = require('../../shared/utils')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')
const {
  issueRefreshToken,
  findValidToken,
  revokeToken,
  revokeAllForUser,
} = require('../../shared/utils/refresh-token')

function toSafeUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

async function issueTokens(user) {
  const accessToken = signToken({ sub: user.id, role: user.role })
  const refreshToken = await issueRefreshToken(user.id)
  return { accessToken, refreshToken }
}

async function register({ email, password, name }) {
  const existing = await authRepository.findByEmail(email)
  if (existing) {
    throw AppError.conflict('An account with this email already exists')
  }

  const hashedPassword = await hashPassword(password)
  const user = await authRepository.createUser({ email, password: hashedPassword, name })

  const { accessToken, refreshToken } = await issueTokens(user)
  return { user: toSafeUser(user), token: accessToken, refreshToken }
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

  const { accessToken, refreshToken } = await issueTokens(user)

  logActivity({
    action: 'USER_LOGGED_IN',
    message: 'User logged in',
    detail: user.email,
    actorId: user.id,
  }).catch((err) => logger.error({ err }, 'Failed to log USER_LOGGED_IN activity'))

  return { user: toSafeUser(user), token: accessToken, refreshToken }
}

async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw AppError.unauthorized('Missing refresh token')
  }

  const tokenRecord = await findValidToken(rawRefreshToken)
  if (!tokenRecord) {
    throw AppError.unauthorized('Invalid or expired refresh token')
  }

  const user = await authRepository.findById(tokenRecord.userId)
  if (!user) {
    throw AppError.unauthorized('User no longer exists')
  }

  const newRawRefreshToken = await issueRefreshToken(user.id)
  const newRefreshRecord = await findValidToken(newRawRefreshToken)
  await revokeToken(tokenRecord.id, newRefreshRecord?.id)

  const accessToken = signToken({ sub: user.id, role: user.role })

  return { user: toSafeUser(user), token: accessToken, refreshToken: newRawRefreshToken }
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return

  const tokenRecord = await findValidToken(rawRefreshToken)
  if (tokenRecord) {
    await revokeToken(tokenRecord.id)
  }
}

async function logoutAll(userId) {
  await revokeAllForUser(userId)
}

module.exports = { register, login, refresh, logout, logoutAll, toSafeUser }
