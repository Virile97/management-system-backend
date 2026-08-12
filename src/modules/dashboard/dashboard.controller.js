const dashboardService = require('./dashboard.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const getStats = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getStats()
  return ApiResponse.success(res, stats, 'Dashboard stats retrieved')
})

const getMemberBreakdown = asyncHandler(async (req, res) => {
  const breakdown = await dashboardService.getMemberBreakdown()
  return ApiResponse.success(res, breakdown, 'Member breakdown retrieved')
})

const getFinanceSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getFinanceSummary(req.query.range)
  return ApiResponse.success(res, summary, 'Finance summary retrieved')
})

const getRecentActivity = asyncHandler(async (req, res) => {
  const activity = await dashboardService.getRecentActivity(req.query.limit)
  return ApiResponse.success(res, activity, 'Recent activity retrieved')
})

const getAttendanceSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getAttendanceSummary(req.query.range)
  return ApiResponse.success(res, summary, 'Attendance summary retrieved')
})

module.exports = {
  getStats,
  getMemberBreakdown,
  getFinanceSummary,
  getRecentActivity,
  getAttendanceSummary,
}
