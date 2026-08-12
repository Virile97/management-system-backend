const { Router } = require('express')
const userController = require('./user.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const { createUserSchema, updateUserSchema, listUsersSchema } = require('./user.validation')
const { idParamSchema } = require('../../shared/validators/common.validation')
const { ROLES } = require('../../config/constants')

const router = Router()

router.use(authenticate)

router.get('/', validate(listUsersSchema), userController.listUsers)
router.post('/', authorize(ROLES.ADMIN), validate(createUserSchema), userController.createUser)
router.get('/:id', validate(idParamSchema), userController.getUser)
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(updateUserSchema),
  userController.updateUser,
)
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamSchema), userController.deleteUser)

module.exports = router
