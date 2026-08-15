const prisma = require('../../config/prisma')
const {
  NBC_TEACHER_GROUP_ROLE,
  NBC_LESSON_EVENT_TYPES,
} = require('./new-believers.constants')

const memberSelect = {
  id: true,
  email: true,
  firstName: true,
  middleName: true,
  lastName: true,
}

function listActiveLessons() {
  return prisma.nbcLesson.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

function listAllLessons() {
  return prisma.nbcLesson.findMany({
    orderBy: { sortOrder: 'asc' },
  })
}

function findLessonById(id) {
  return prisma.nbcLesson.findUnique({ where: { id } })
}

function findLessonBySortOrder(sortOrder) {
  return prisma.nbcLesson.findUnique({ where: { sortOrder } })
}

function maxLessonSortOrder() {
  return prisma.nbcLesson.aggregate({ _max: { sortOrder: true } })
}

function createLesson({ sortOrder, title, description }) {
  return prisma.nbcLesson.create({
    data: {
      sortOrder,
      title,
      description: description || null,
    },
  })
}

function updateLesson(id, data) {
  return prisma.nbcLesson.update({
    where: { id },
    data,
  })
}

function countActiveLessons() {
  return prisma.nbcLesson.count({ where: { isActive: true } })
}

function listTeacherMembers() {
  return prisma.member.findMany({
    where: {
      groups: { some: { group: { role: NBC_TEACHER_GROUP_ROLE } } },
    },
    select: memberSelect,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
}

/** New believers not yet enrolled — candidates for assignment. */
function listAssignableStudents({ search, limit = 20 } = {}) {
  const trimmed = String(search || '').trim()
  return prisma.member.findMany({
    where: {
      isNewBeliever: true,
      nbcEnrollmentsAsStudent: { none: {} },
      ...(trimmed
        ? {
            OR: [
              { email: { contains: trimmed, mode: 'insensitive' } },
              { firstName: { contains: trimmed, mode: 'insensitive' } },
              { middleName: { contains: trimmed, mode: 'insensitive' } },
              { lastName: { contains: trimmed, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: memberSelect,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: Math.min(100, Math.max(1, Number(limit) || 20)),
  })
}

function findMemberById(id) {
  return prisma.member.findUnique({
    where: { id },
    select: {
      ...memberSelect,
      isNewBeliever: true,
      groups: {
        select: { group: { select: { id: true, role: true } } },
      },
    },
  })
}

function findMemberByEmail(email) {
  if (!email) return null
  return prisma.member.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: {
      ...memberSelect,
      groups: {
        select: { group: { select: { role: true } } },
      },
    },
  })
}

function isTeacherMember(member) {
  return (member?.groups || []).some(
    (row) => row.group?.role === NBC_TEACHER_GROUP_ROLE,
  )
}

function listEnrollments() {
  return prisma.nbcEnrollment.findMany({
    where: { graduatedAt: null },
    include: {
      student: { select: memberSelect },
      teacher: { select: memberSelect },
      currentLesson: true,
    },
    orderBy: { enrolledAt: 'desc' },
  })
}

function findEnrollmentById(id) {
  return prisma.nbcEnrollment.findUnique({
    where: { id },
    include: {
      student: { select: memberSelect },
      teacher: { select: memberSelect },
      currentLesson: true,
    },
  })
}

function findEnrollmentByStudentId(studentId) {
  return prisma.nbcEnrollment.findUnique({
    where: { studentId },
  })
}

function createEnrollment({
  studentId,
  teacherId,
  currentLessonId,
  status,
  actorUserId,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: studentId },
      data: { isNewBeliever: true },
    })

    const enrollment = await tx.nbcEnrollment.create({
      data: {
        studentId,
        teacherId,
        currentLessonId,
        status,
      },
      include: {
        student: { select: memberSelect },
        teacher: { select: memberSelect },
        currentLesson: true,
      },
    })

    await tx.nbcLessonEvent.create({
      data: {
        enrollmentId: enrollment.id,
        fromLessonId: null,
        toLessonId: currentLessonId,
        type: NBC_LESSON_EVENT_TYPES.ENROLL,
        actorUserId: actorUserId || null,
      },
    })

    return enrollment
  })
}

function moveEnrollment({
  enrollmentId,
  fromLessonId,
  toLessonId,
  status,
  note,
  actorUserId,
}) {
  return prisma.$transaction(async (tx) => {
    const enrollment = await tx.nbcEnrollment.update({
      where: { id: enrollmentId },
      data: {
        currentLessonId: toLessonId,
        ...(status ? { status } : {}),
      },
      include: {
        student: { select: memberSelect },
        teacher: { select: memberSelect },
        currentLesson: true,
      },
    })

    await tx.nbcLessonEvent.create({
      data: {
        enrollmentId,
        fromLessonId,
        toLessonId,
        type: NBC_LESSON_EVENT_TYPES.MOVE,
        note: note || null,
        actorUserId: actorUserId || null,
      },
    })

    return enrollment
  })
}

function updateEnrollment(id, data) {
  return prisma.nbcEnrollment.update({
    where: { id },
    data,
    include: {
      student: { select: memberSelect },
      teacher: { select: memberSelect },
      currentLesson: true,
    },
  })
}

function countNewBelievers() {
  return prisma.member.count({ where: { isNewBeliever: true } })
}

module.exports = {
  listActiveLessons,
  listAllLessons,
  findLessonById,
  findLessonBySortOrder,
  maxLessonSortOrder,
  createLesson,
  updateLesson,
  countActiveLessons,
  listTeacherMembers,
  listAssignableStudents,
  findMemberById,
  findMemberByEmail,
  isTeacherMember,
  listEnrollments,
  findEnrollmentById,
  findEnrollmentByStudentId,
  createEnrollment,
  moveEnrollment,
  updateEnrollment,
  countNewBelievers,
}
