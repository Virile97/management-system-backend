const { NbcEnrollmentStatus } = require('@prisma/client')

/** Ministry/group role that marks a member as an NBC teacher. */
const NBC_TEACHER_GROUP_ROLE = 'New Believers Teachers'

const NBC_LESSON_EVENT_TYPES = Object.freeze({
  ENROLL: 'ENROLL',
  MOVE: 'MOVE',
  COMPLETE: 'COMPLETE',
})

const NBC_ENROLLMENT_STATUSES = Object.freeze({
  ON_TRACK: NbcEnrollmentStatus.ON_TRACK,
  BEHIND: NbcEnrollmentStatus.BEHIND,
  ADVANCED: NbcEnrollmentStatus.ADVANCED,
})

const NBC_ENROLLMENT_STATUS_VALUES = Object.freeze(
  Object.values(NBC_ENROLLMENT_STATUSES),
)

module.exports = {
  NBC_TEACHER_GROUP_ROLE,
  NBC_LESSON_EVENT_TYPES,
  NBC_ENROLLMENT_STATUSES,
  NBC_ENROLLMENT_STATUS_VALUES,
}
