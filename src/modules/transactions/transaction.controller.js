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

module.exports = { listTransactions, getTransaction }
