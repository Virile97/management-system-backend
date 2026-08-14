const { Router } = require('express')
const soulWinningController = require('./soul-winning.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { idParamSchema } = require('../../shared/validators/common.validation')
const {
  overviewSchema,
  listRecordsSchema,
  listWinnersSchema,
  trendsSchema,
  getGoalSchema,
  createRecordSchema,
  updateRecordSchema,
  baptizeRecordSchema,
  upsertGoalSchema,
} = require('./soul-winning.validation')

const router = Router()

router.use(authenticate)

router.get('/overview', validate(overviewSchema), soulWinningController.getOverview)
router.get('/records', validate(listRecordsSchema), soulWinningController.listRecords)
router.get('/winners', validate(listWinnersSchema), soulWinningController.listWinners)
router.get('/trends', validate(trendsSchema), soulWinningController.getTrends)
router.get('/goals', validate(getGoalSchema), soulWinningController.getGoal)
router.put('/goals', validate(upsertGoalSchema), soulWinningController.upsertGoal)

router.post('/records', validate(createRecordSchema), soulWinningController.createRecord)
router.get('/records/:id', validate(idParamSchema), soulWinningController.getRecord)
router.patch('/records/:id', validate(updateRecordSchema), soulWinningController.updateRecord)
router.post(
  '/records/:id/baptize',
  validate(baptizeRecordSchema),
  soulWinningController.baptizeRecord,
)

module.exports = router
