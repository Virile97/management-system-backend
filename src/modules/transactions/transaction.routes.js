const { Router } = require('express')
const transactionController = require('./transaction.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const { listTransactionsSchema } = require('./transaction.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')
const { ROLES } = require('../../config/constants')

const router = Router()

router.use(authenticate, authorize(ROLES.FINANCE_ADMIN))

router.get('/', validate(listTransactionsSchema), transactionController.listTransactions)
router.get('/:id', validate(idParamSchema), transactionController.getTransaction)

module.exports = router
