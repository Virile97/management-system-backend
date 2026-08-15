const memberService = require('./member.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const listMembers = asyncHandler(async (req, res) => {
  const { items, meta } = await memberService.listMembers(req.query)
  return ApiResponse.success(res, items, 'Members retrieved', 200, meta)
})

const getBreakdown = asyncHandler(async (req, res) => {
  const breakdown = await memberService.getBreakdown(req.query)
  return ApiResponse.success(res, breakdown, 'Member breakdown retrieved')
})

const getMember = asyncHandler(async (req, res) => {
  const { member, meta } = await memberService.getMemberById(req.params.id, req.query)
  return ApiResponse.success(res, member, 'Member retrieved', 200, meta)
})

const getMemberOfferings = asyncHandler(async (req, res) => {
  const { meta, ...offerings } = await memberService.getMemberOfferings(req.params.id, req.query)
  return ApiResponse.success(res, offerings, 'Member offerings retrieved', 200, meta)
})

const getConfig = asyncHandler(async (req, res) => {
  const config = await memberService.getConfig()
  return ApiResponse.success(res, config, 'Member config retrieved')
})

const createMember = asyncHandler(async (req, res) => {
  const member = await memberService.createMember(req.body, req.user.id)
  return ApiResponse.created(res, member, 'Member created successfully')
})

const updateMember = asyncHandler(async (req, res) => {
  const member = await memberService.updateMember(req.params.id, req.body, req.user.id)
  return ApiResponse.success(res, member, 'Member updated successfully')
})

const deleteMember = asyncHandler(async (req, res) => {
  await memberService.deleteMember(req.params.id, req.user.id)
  return ApiResponse.noContent(res)
})

const bulkDeleteMembers = asyncHandler(async (req, res) => {
  const result = await memberService.deleteMembers(req.body.ids, req.user.id)
  const message = result.blocked?.length
    ? `Deleted ${result.deletedCount} member${result.deletedCount === 1 ? '' : 's'}; ${result.blocked.length} could not be deleted`
    : 'Members deleted successfully'
  return ApiResponse.success(res, result, message)
})

module.exports = {
  listMembers,
  getBreakdown,
  getMember,
  getMemberOfferings,
  getConfig,
  createMember,
  updateMember,
  deleteMember,
  bulkDeleteMembers,
}
