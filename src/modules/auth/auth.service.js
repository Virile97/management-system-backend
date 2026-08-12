const authRepository = require('./auth.repository')
const { AppError } = require('../../shared/errors')
const passwordUtils = require('../../shared/utils/password')
const jwtUtils = require('../../shared/utils/jwt')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')
const refreshTokenUtils = require('../../shared/utils/refresh-token')
const passwordSetupToken = require('../../shared/utils/password-setup-token')

function toSafeUser(user) {
  return { id: user.id, email: user.email, name: user.name, role: user.role }
}

async function issueTokens(user) {
  const accessToken = jwtUtils.signToken({ sub: user.id, role: user.role })
  const refreshToken = await refreshTokenUtils.issueRefreshToken(user.id)
  return { accessToken, refreshToken }
}

async function register({ email, password, name }) {
  const existing = await authRepository.findByEmail(email)
  if (existing) {
    throw AppError.conflict('An account with this email already exists')
  }

  const hashedPassword = await passwordUtils.hashPassword(password)
  const user = await authRepository.createUser({ email, password: hashedPassword, name })

  const { accessToken, refreshToken } = await issueTokens(user)
  return { user: toSafeUser(user), token: accessToken, refreshToken }
}

async function login({ email, password }) {
  const user = await authRepository.findByEmail(email)
  if (!user || !user.password) {
    throw AppError.unauthorized('Invalid email or password')
  }

  const passwordMatches = await passwordUtils.comparePassword(password, user.password)
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

async function verifyPasswordSetupToken(rawToken) {
  const record = await passwordSetupToken.findValidPasswordSetupToken(rawToken)
  if (!record) {
    throw AppError.badRequest('Invalid or expired password setup link')
  }

  return {
    email: record.user.email,
    name: record.user.name,
    role: record.user.role,
    expiresAt: record.expiresAt,
  }
}

async function setPassword({ token, password }) {
  const record = await passwordSetupToken.findValidPasswordSetupToken(token)
  if (!record) {
    throw AppError.badRequest('Invalid or expired password setup link')
  }

  if (record.user.password) {
    throw AppError.conflict('Password has already been set for this account')
  }

  const hashedPassword = await passwordUtils.hashPassword(password)
  const user = await authRepository.updatePassword(record.userId, hashedPassword)
  await passwordSetupToken.markPasswordSetupTokenUsed(record.id)

  const { accessToken, refreshToken } = await issueTokens(user)
  return { user: toSafeUser(user), token: accessToken, refreshToken }
}

async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw AppError.unauthorized('Missing refresh token')
  }

  const tokenRecord = await refreshTokenUtils.findValidToken(rawRefreshToken)
  if (!tokenRecord) {
    throw AppError.unauthorized('Invalid or expired refresh token')
  }

  const user = await authRepository.findById(tokenRecord.userId)
  if (!user) {
    throw AppError.unauthorized('User no longer exists')
  }

  const newRawRefreshToken = await refreshTokenUtils.issueRefreshToken(user.id)
  const newRefreshRecord = await refreshTokenUtils.findValidToken(newRawRefreshToken)
  await refreshTokenUtils.revokeToken(tokenRecord.id, newRefreshRecord?.id)

  const accessToken = jwtUtils.signToken({ sub: user.id, role: user.role })

  return { user: toSafeUser(user), token: accessToken, refreshToken: newRawRefreshToken }
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return

  const tokenRecord = await refreshTokenUtils.findValidToken(rawRefreshToken)
  if (tokenRecord) {
    await refreshTokenUtils.revokeToken(tokenRecord.id)
  }
}

async function logoutAll(userId) {
  await refreshTokenUtils.revokeAllForUser(userId)
}

module.exports = {
  register,
  login,
  verifyPasswordSetupToken,
  setPassword,
  refresh,
  logout,
  logoutAll,
  toSafeUser,
}
