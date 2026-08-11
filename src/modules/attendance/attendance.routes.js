const { Router } = require('express')
const attendanceController = require('./attendance.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { listAttendanceSchema, upsertAttendanceSchema } = require('./attendance.validation')

const router = Router()

router.use(authenticate)

router.get('/', validate(listAttendanceSchema), attendanceController.listAttendance)
router.put(
  '/:memberId',
  validate(upsertAttendanceSchema),
  attendanceController.upsertAttendance,
)

module.exports = router
