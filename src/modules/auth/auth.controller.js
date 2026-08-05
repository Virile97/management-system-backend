const authService = require('./auth.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')
const { publicKey } = require('../../shared/utils/rsa-keys')

const getPublicKey = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, { publicKey }, 'Public key retrieved')
})

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body)
  return ApiResponse.created(res, result, 'Account created successfully')
})

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body)
  return ApiResponse.success(res, result, 'Logged in successfully')
})

const me = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, req.user, 'Current user retrieved')
})

const logout = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, { loggedOut: true }, 'Logged out successfully')
})

module.exports = { getPublicKey, register, login, me, logout }
