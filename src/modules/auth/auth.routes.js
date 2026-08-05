const { Router } = require('express')
const authController = require('./auth.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { requireApiKey } = require('../../middlewares/api-key.middleware')
const decryptPassword = require('../../middlewares/decrypt-password.middleware')
const { registerSchema, loginSchema } = require('./auth.validation')

const router = Router()

router.get('/public-key', authController.getPublicKey)
router.post('/register', validate(registerSchema), authController.register)
router.post(
  '/login',
  requireApiKey,
  decryptPassword,
  validate(loginSchema),
  authController.login,
)
router.get('/me', authenticate, authController.me)

module.exports = router
