const { Router } = require('express')
const controller = require('./new-believers.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const { ROLES } = require('../../config/constants')
const {
  overviewSchema,
  assignableStudentsSchema,
  createLessonSchema,
  updateLessonSchema,
  createEnrollmentSchema,
  moveEnrollmentSchema,
  updateEnrollmentSchema,
} = require('./new-believers.validation')

const router = Router()

router.use(authenticate)

router.get('/overview', validate(overviewSchema), controller.getOverview)
router.get(
  '/assignable-students',
  authorize(ROLES.ADMIN),
  validate(assignableStudentsSchema),
  controller.searchAssignableStudents,
)
router.get('/lessons', controller.listLessons)
router.post(
  '/lessons',
  authorize(ROLES.ADMIN),
  validate(createLessonSchema),
  controller.createLesson,
)
router.patch(
  '/lessons/:id',
  authorize(ROLES.ADMIN),
  validate(updateLessonSchema),
  controller.updateLesson,
)

router.post(
  '/enrollments',
  authorize(ROLES.ADMIN),
  validate(createEnrollmentSchema),
  controller.createEnrollment,
)
router.post(
  '/enrollments/:id/move',
  validate(moveEnrollmentSchema),
  controller.moveEnrollment,
)
router.patch(
  '/enrollments/:id',
  authorize(ROLES.ADMIN),
  validate(updateEnrollmentSchema),
  controller.updateEnrollment,
)

module.exports = router
