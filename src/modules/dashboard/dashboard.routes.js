const { Router } = require('express')
const dashboardController = require('./dashboard.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const { requireApiKey } = require('../../middlewares/api-key.middleware')
const { rangeSchema, recentActivitySchema } = require('./dashboard.validation')
const { ROLES } = require('../../config/constants')

const router = Router()

router.use(requireApiKey, authenticate, authorize(ROLES.FINANCE_ADMIN))

router.get('/stats', dashboardController.getStats)
router.get('/member-breakdown', dashboardController.getMemberBreakdown)
router.get('/finance-summary', validate(rangeSchema), dashboardController.getFinanceSummary)
router.get(
  '/recent-activity',
  validate(recentActivitySchema),
  dashboardController.getRecentActivity,
)

module.exports = router
