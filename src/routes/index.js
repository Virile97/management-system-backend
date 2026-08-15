const { Router } = require('express')
const { authRoutes } = require('../modules/auth')
const { userRoutes } = require('../modules/users')
const { dashboardRoutes } = require('../modules/dashboard')
const { memberRoutes } = require('../modules/members')
const { transactionRoutes } = require('../modules/transactions')
const { attendanceRoutes } = require('../modules/attendance')
const { soulWinningRoutes } = require('../modules/soul-winning')
const { newBelieversRoutes } = require('../modules/new-believers')

const router = Router()

router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'OK' })
})

router.use('/auth', authRoutes)
router.use('/users', userRoutes)
router.use('/dashboard', dashboardRoutes)
router.use('/members', memberRoutes)
router.use('/transactions', transactionRoutes)
router.use('/attendance', attendanceRoutes)
router.use('/soul-winning', soulWinningRoutes)
router.use('/new-believers', newBelieversRoutes)

module.exports = router
