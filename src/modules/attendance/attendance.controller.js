const attendanceService = require('./attendance.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const listAttendance = asyncHandler(async (req, res) => {
  const { items, meta, ...rest } = await attendanceService.listAttendance(req.query)
  return ApiResponse.success(res, { ...rest, items }, 'Attendance retrieved', 200, meta)
})

const upsertAttendance = asyncHandler(async (req, res) => {
  const attendance = await attendanceService.upsertAttendance(
    req.params.memberId,
    req.body,
    req.user.id,
  )
  return ApiResponse.success(res, attendance, 'Attendance saved')
})

module.exports = { listAttendance, upsertAttendance }
