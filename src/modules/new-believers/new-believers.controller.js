const newBelieversService = require('./new-believers.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

const getOverview = asyncHandler(async (req, res) => {
  const data = await newBelieversService.getOverview(req.user)
  return ApiResponse.success(res, data, 'New Believers overview retrieved')
})

const searchAssignableStudents = asyncHandler(async (req, res) => {
  const data = await newBelieversService.searchAssignableStudents(req.query)
  return ApiResponse.success(res, data, 'Assignable students retrieved')
})

const listLessons = asyncHandler(async (req, res) => {
  const data = await newBelieversService.listActiveLessons()
  return ApiResponse.success(res, data, 'Lessons retrieved')
})

const createLesson = asyncHandler(async (req, res) => {
  const lesson = await newBelieversService.createLesson(req.body)
  return ApiResponse.created(res, lesson, 'Lesson created')
})

const updateLesson = asyncHandler(async (req, res) => {
  const lesson = await newBelieversService.updateLesson(req.params.id, req.body)
  return ApiResponse.success(res, lesson, 'Lesson updated')
})

const createEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await newBelieversService.createEnrollment(req.body, req.user)
  return ApiResponse.created(res, enrollment, 'Student enrolled')
})

const moveEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await newBelieversService.moveEnrollment(
    req.params.id,
    req.body,
    req.user,
  )
  return ApiResponse.success(res, enrollment, 'Student moved to lesson')
})

const updateEnrollment = asyncHandler(async (req, res) => {
  const enrollment = await newBelieversService.updateEnrollment(
    req.params.id,
    req.body,
  )
  return ApiResponse.success(res, enrollment, 'Enrollment updated')
})

module.exports = {
  getOverview,
  searchAssignableStudents,
  listLessons,
  createLesson,
  updateLesson,
  createEnrollment,
  moveEnrollment,
  updateEnrollment,
}
