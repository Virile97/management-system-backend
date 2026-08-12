const userService = require('./user.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.listUsers(req.query)
  return ApiResponse.success(res, items, 'Users retrieved successfully', 200, meta)
})

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id)
  return ApiResponse.success(res, user, 'User retrieved successfully')
})

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body)
  return ApiResponse.created(res, user, 'User created successfully')
})

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body)
  return ApiResponse.success(res, user, 'User updated successfully')
})

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id)
  return ApiResponse.noContent(res)
})

module.exports = { listUsers, getUser, createUser, updateUser, deleteUser }
