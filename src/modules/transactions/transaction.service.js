const transactionRepository = require('./transaction.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')

async function listTransactions(query) {
  const { page, limit, skip } = getPagination(query)
  const { type, category } = query

  const [transactions, total] = await Promise.all([
    transactionRepository.findMany({ skip, limit, type, category }),
    transactionRepository.count({ type, category }),
  ])

  return {
    items: transactions,
    meta: buildMeta({ page, limit, total }),
  }
}

async function getTransactionById(id) {
  const transaction = await transactionRepository.findById(id)
  if (!transaction) {
    throw AppError.notFound('Transaction not found')
  }
  return transaction
}

module.exports = { listTransactions, getTransactionById }
