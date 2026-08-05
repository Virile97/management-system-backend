const { Router } = require('express')
const { authRoutes } = require('../modules/auth')
const { userRoutes } = require('../modules/users')
const { dashboardRoutes } = require('../modules/dashboard')
const { memberRoutes } = require('../modules/members')

const router = Router()

router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK' })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/members', memberRoutes)

module.exports = router
