const memberService = require('./member.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const listMembers = asyncHandler(async (req, res) => {
  const { items, meta } = await memberService.listMembers(req.query)
  return ApiResponse.success(res, items, 'Members retrieved', 200, meta)
})

const getMember = asyncHandler(async (req, res) => {
  const member = await memberService.getMemberById(req.params.id)
  return ApiResponse.success(res, member, 'Member retrieved')
})

module.exports = { listMembers, getMember }
