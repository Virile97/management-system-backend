const dashboardService = require('./dashboard.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const getOverview = asyncHandler(async (req, res) => {
  const overview = await dashboardService.getOverview(req.query)
  return ApiResponse.success(res, overview, 'Dashboard overview retrieved')
})

module.exports = { getOverview }
