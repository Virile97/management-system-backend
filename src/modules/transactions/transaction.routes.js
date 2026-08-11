const { Router } = require('express')
const transactionController = require('./transaction.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const {
  listTransactionsSchema,
  periodQuerySchema,
  byOfferingTypeSchema,
  createTransactionSchema,
  updateTransactionSchema,
} = require('./transaction.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')
const { ROLES } = require('../../config/constants')

const router = Router()

router.use(authenticate, authorize(ROLES.FINANCE_ADMIN))

router.get('/stats', validate(periodQuerySchema), transactionController.getStats)
router.get(
  '/by-offering-type',
  validate(byOfferingTypeSchema),
  transactionController.getByOfferingType,
)
router.get('/trend', validate(periodQuerySchema), transactionController.getMonthlyTrend)
router.get('/config', transactionController.getConfig)
router.get('/', validate(listTransactionsSchema), transactionController.listTransactions)
router.get('/:id', validate(idParamSchema), transactionController.getTransaction)
router.post('/', validate(createTransactionSchema), transactionController.createTransaction)
router.patch('/:id', validate(updateTransactionSchema), transactionController.updateTransaction)

module.exports = router
