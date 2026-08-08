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
  const stats = await transactionService.getStats()
  return ApiResponse.success(res, stats, 'Finance stats retrieved')
})

const getByCategory = asyncHandler(async (req, res) => {
  const breakdown = await transactionService.getByCategory()
  return ApiResponse.success(res, breakdown, 'Category breakdown retrieved')
})

const getMonthlyTrend = asyncHandler(async (req, res) => {
  const trend = await transactionService.getMonthlyTrend(req.query.range)
  return ApiResponse.success(res, trend, 'Monthly trend retrieved')
})

module.exports = {
  listTransactions,
  getTransaction,
  getStats,
  getByCategory,
  getMonthlyTrend,
}
