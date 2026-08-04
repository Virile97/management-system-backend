const { AppError } = require('../shared/errors')
const { verifyToken } = require('../shared/utils/jwt')
const prisma = require('../config/prisma')
const asyncHandler = require('../shared/utils/async-handler')
const { ROLES } = require('../config/constants')

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing or malformed Authorization header')
  }

  const token = header.split(' ')[1]

  let payload
  try {
    payload = verifyToken(token)
  } catch (_err) {
    throw AppError.unauthorized('Invalid or expired token')
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) {
    throw AppError.unauthorized('User no longer exists')
  }

  req.user = { id: user.id, email: user.email, role: user.role }
  next()
})

const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized())
    }
    if (req.user.role === ROLES.ADMIN || allowedRoles.includes(req.user.role)) {
      return next()
    }
    next(AppError.forbidden('Insufficient permissions'))
  }

module.exports = { authenticate, authorize }
