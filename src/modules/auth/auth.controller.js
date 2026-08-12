const authService = require('./auth.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')
const { publicKey } = require('../../shared/utils/rsa-keys')
const {
  COOKIE_NAME,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} = require('../../shared/utils/refresh-token-cookie')

const getPublicKey = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, { publicKey }, 'Public key retrieved')
})

const register = asyncHandler(async (req, res) => {
  const { refreshToken, ...result } = await authService.register(req.body)
  setRefreshTokenCookie(res, refreshToken)
  return ApiResponse.created(res, result, 'Account created successfully')
})

const login = asyncHandler(async (req, res) => {
  const { refreshToken, ...result } = await authService.login(req.body)
  setRefreshTokenCookie(res, refreshToken)
  return ApiResponse.success(res, result, 'Logged in successfully')
})

const verifyPasswordSetup = asyncHandler(async (req, res) => {
  const data = await authService.verifyPasswordSetupToken(req.query.token)
  return ApiResponse.success(res, data, 'Password setup link is valid')
})

const setPassword = asyncHandler(async (req, res) => {
  const { refreshToken, ...result } = await authService.setPassword(req.body)
  setRefreshTokenCookie(res, refreshToken)
  return ApiResponse.success(res, result, 'Password set successfully')
})

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken, ...result } = await authService.refresh(req.cookies[COOKIE_NAME])
  setRefreshTokenCookie(res, refreshToken)
  return ApiResponse.success(res, result, 'Token refreshed successfully')
})

const me = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, req.user, 'Current user retrieved')
})

const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[COOKIE_NAME])
  clearRefreshTokenCookie(res)
  return ApiResponse.success(res, { loggedOut: true }, 'Logged out successfully')
})

const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user.id)
  clearRefreshTokenCookie(res)
  return ApiResponse.success(res, { loggedOut: true }, 'Logged out of all sessions')
})

module.exports = {
  getPublicKey,
  register,
  login,
  verifyPasswordSetup,
  setPassword,
  refresh,
  me,
  logout,
  logoutAll,
}
