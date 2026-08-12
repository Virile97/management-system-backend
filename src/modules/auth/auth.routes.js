const { Router } = require('express')
const authController = require('./auth.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate } = require('../../middlewares/auth.middleware')
const { requireApiKey } = require('../../middlewares/api-key.middleware')
const decryptPassword = require('../../middlewares/decrypt-password.middleware')
const {
  registerSchema,
  loginSchema,
  verifyPasswordSetupSchema,
  setPasswordSchema,
} = require('./auth.validation')

const router = Router()

router.get('/public-key', authController.getPublicKey)
router.post('/register', validate(registerSchema), authController.register)
router.post('/login', requireApiKey, decryptPassword, validate(loginSchema), authController.login)
router.get(
  '/set-password',
  requireApiKey,
  validate(verifyPasswordSetupSchema),
  authController.verifyPasswordSetup,
)
router.post(
  '/set-password',
  requireApiKey,
  decryptPassword,
  validate(setPasswordSchema),
  authController.setPassword,
)
router.post('/refresh', requireApiKey, authController.refresh)
router.get('/me', authenticate, authController.me)
router.post('/logout', requireApiKey, authenticate, authController.logout)
router.post('/logout-all', requireApiKey, authenticate, authController.logoutAll)

module.exports = router
