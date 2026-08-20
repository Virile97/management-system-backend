const crypto = require('crypto')
const soulWinningService = require('./soul-winning.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const getOverview = asyncHandler(async (req, res) => {
  const overview = await soulWinningService.getOverview(req.query)
  return ApiResponse.success(res, overview, 'Soul winning overview retrieved')
})

const listRecords = asyncHandler(async (req, res) => {
  const { items, meta } = await soulWinningService.listRecords(req.query)
  return ApiResponse.success(res, items, 'Soul winning records retrieved', 200, meta)
})

const getRecord = asyncHandler(async (req, res) => {
  const record = await soulWinningService.getRecordById(req.params.id)
  return ApiResponse.success(res, record, 'Soul winning record retrieved')
})

const createRecord = asyncHandler(async (req, res) => {
  const result = await soulWinningService.createRecord(req.body, req.user.id, req.query)
  return ApiResponse.created(res, result, 'Soul won recorded successfully')
})

const updateRecord = asyncHandler(async (req, res) => {
  const record = await soulWinningService.updateRecord(req.params.id, req.body)
  return ApiResponse.success(res, record, 'Soul winning record updated')
})

const bulkDeleteRecords = asyncHandler(async (req, res) => {
  const result = await soulWinningService.deleteRecords(req.body.ids, req.user.id)
  const message = `Deleted ${result.deletedCount} record${result.deletedCount === 1 ? '' : 's'}`
  return ApiResponse.success(res, result, message)
})

const baptizeRecord = asyncHandler(async (req, res) => {
  const result = await soulWinningService.baptizeRecord(
    req.params.id,
    req.body,
    req.user.id,
    req.query,
  )
  return ApiResponse.success(res, result, 'Convert baptized and added as member')
})

const listWinners = asyncHandler(async (req, res) => {
  const { meta, ...winners } = await soulWinningService.listWinners(req.query)
  return ApiResponse.success(res, winners, 'Soul winners retrieved', 200, meta)
})

const getTrends = asyncHandler(async (req, res) => {
  const trends = await soulWinningService.getTrends(req.query)
  const etag = `"${crypto.createHash('sha1').update(JSON.stringify(trends)).digest('hex')}"`

  res.set('Cache-Control', 'private, max-age=60')
  res.set('ETag', etag)

  if (req.headers['if-none-match'] === etag) {
    return res.status(304).end()
  }

  return ApiResponse.success(res, trends, 'Soul winning trends retrieved')
})

const getGoal = asyncHandler(async (req, res) => {
  const goal = await soulWinningService.getGoal(req.query)
  return ApiResponse.success(res, goal, 'Soul winning goal retrieved')
})

const upsertGoal = asyncHandler(async (req, res) => {
  const goal = await soulWinningService.upsertGoal(req.body, req.user.id)
  return ApiResponse.success(res, goal, 'Soul winning goal saved')
})

module.exports = {
  getOverview,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  bulkDeleteRecords,
  baptizeRecord,
  listWinners,
  getTrends,
  getGoal,
  upsertGoal,
}
