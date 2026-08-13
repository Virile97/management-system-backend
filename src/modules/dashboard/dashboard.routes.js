const { Router } = require('express')
const dashboardController = require('./dashboard.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const { requireApiKey } = require('../../middlewares/api-key.middleware')
const { overviewSchema } = require('./dashboard.validation')
const { ROLES } = require('../../config/constants')

const router = Router()

router.use(requireApiKey, authenticate, authorize(ROLES.FINANCE_ADMIN))

router.get('/', validate(overviewSchema), dashboardController.getOverview)

module.exports = router
