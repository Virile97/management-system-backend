const { Router } = require('express')
const attendanceController = require('./attendance.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { attendanceUpsertRateLimit } = require('../../middlewares/rate-limit.middleware')
const { listAttendanceSchema, upsertAttendanceSchema } = require('./attendance.validation')

const router = Router()

router.use(authenticate)

router.get('/', validate(listAttendanceSchema), attendanceController.listAttendance)
router.put(
  '/:memberId',
  attendanceUpsertRateLimit,
  validate(upsertAttendanceSchema),
  attendanceController.upsertAttendance,
)

module.exports = router
