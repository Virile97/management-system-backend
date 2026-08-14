const dashboardService = require('./dashboard.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const getOverview = asyncHandler(async (req, res) => {
  const overview = await dashboardService.getOverview(req.query)
  return ApiResponse.success(res, overview, 'Dashboard overview retrieved')
})

const searchActivity = asyncHandler(async (req, res) => {
  const activity = await dashboardService.searchRecentActivity(req.query)
  return ApiResponse.success(res, activity, 'Activity search retrieved')
})

module.exports = { getOverview, searchActivity }
