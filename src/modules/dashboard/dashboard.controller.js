const dashboardService = require('./dashboard.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const getStats = asyncHandler(async (req, res) => {
  const stats = await dashboardService.getStats()
  return ApiResponse.success(res, stats, 'Dashboard stats retrieved')
})

const getFinanceSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getFinanceSummary(req.query.range)
  return ApiResponse.success(res, summary, 'Finance summary retrieved')
})

const getRecentActivity = asyncHandler(async (req, res) => {
  const activity = await dashboardService.getRecentActivity(req.query.limit)
  return ApiResponse.success(res, activity, 'Recent activity retrieved')
})

module.exports = { getStats, getFinanceSummary, getRecentActivity }
