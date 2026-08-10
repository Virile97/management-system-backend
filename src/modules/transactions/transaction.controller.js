const transactionService = require('./transaction.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const listTransactions = asyncHandler(async (req, res) => {
  const { items, meta } = await transactionService.listTransactions(req.query)
  return ApiResponse.success(res, items, 'Transactions retrieved', 200, meta)
})

const getTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.getTransactionById(req.params.id)
  return ApiResponse.success(res, transaction, 'Transaction retrieved')
})

const getStats = asyncHandler(async (req, res) => {
  const stats = await transactionService.getStats(req.query)
  return ApiResponse.success(res, stats, 'Finance stats retrieved')
})

const getByOfferingType = asyncHandler(async (req, res) => {
  const breakdown = await transactionService.getByOfferingType(req.query)
  return ApiResponse.success(res, breakdown, 'Offering type breakdown retrieved')
})

const getMonthlyTrend = asyncHandler(async (req, res) => {
  const trend = await transactionService.getMonthlyTrend(req.query)
  return ApiResponse.success(res, trend, 'Monthly trend retrieved')
})

const getConfig = asyncHandler(async (req, res) => {
  const config = await transactionService.getConfig()
  return ApiResponse.success(res, config, 'Transaction config retrieved')
})

const createTransaction = asyncHandler(async (req, res) => {
  const transaction = await transactionService.createTransaction(req.body, req.user.id)
  return ApiResponse.created(res, transaction, 'Transaction recorded successfully')
})

module.exports = {
  listTransactions,
  getTransaction,
  getStats,
  getByOfferingType,
  getMonthlyTrend,
  getConfig,
  createTransaction,
}
