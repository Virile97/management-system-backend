const rateLimit = require('express-rate-limit')
const env = require('../config/env')

const rateLimitMessage = {
  success: false,
  message: 'Too many requests, please try again later.',
  code: 'RATE_LIMITED',
}

function isAttendanceUpsert(req) {
  return req.method === 'PUT' && /\/attendance\/[^/]+\/?$/.test(req.path)
}

const rateLimitMiddleware = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Attendance upserts use a dedicated limiter so click-to-update is not blocked
  // by unrelated traffic in the global bucket.
  skip: isAttendanceUpsert,
  message: rateLimitMessage,
})

// Cap rapid attendance save clicks at 100 requests per window (per user).
const attendanceUpsertRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.ATTENDANCE_UPSERT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `attendance-upsert:${req.user.id}`,
  message: rateLimitMessage,
})

module.exports = rateLimitMiddleware
module.exports.attendanceUpsertRateLimit = attendanceUpsertRateLimit
