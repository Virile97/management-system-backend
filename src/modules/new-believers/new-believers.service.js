const repo = require('./new-believers.repository')
const { AppError } = require('../../shared/errors')
const { ROLES } = require('../../config/constants')
const {
  NBC_TEACHER_GROUP_ROLE,
  NBC_ENROLLMENT_STATUSES,
} = require('./new-believers.constants')

function memberName(member) {
  if (!member) return '—'
  return [member.firstName, member.middleName, member.lastName]
    .filter(Boolean)
    .join(' ')
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

function progressPercent(sortOrder, lessonCount) {
  if (!lessonCount) return 0
  const completed = Math.max(0, Number(sortOrder) - 1)
  return Math.round((completed / lessonCount) * 100)
}

/** Shape enrollment + related rows for the overview UI without remapping enums. */
function toStudentView(enrollment, lessonCount) {
  const name = memberName(enrollment.student)
  const lesson = enrollment.currentLesson
  return {
    id: enrollment.id,
    memberId: enrollment.studentId,
    name,
    initials: initials(name),
    teacherId: enrollment.teacherId,
    teacherName: memberName(enrollment.teacher),
    currentLesson: lesson?.sortOrder ?? null,
    lessonId: lesson?.id ?? null,
    lessonTitle: lesson?.title || '—',
    progress: progressPercent(lesson?.sortOrder, lessonCount),
    status: enrollment.status,
  }
}

async function resolveViewerTeacher(user) {
  const member = await repo.findMemberByEmail(user?.email)
  if (!member) return null
  if (!repo.isTeacherMember(member)) return null
  return member
}

async function getOverview(user) {
  const isAdmin = user?.role === ROLES.ADMIN
  const [lessons, enrollments, teachers, totalLessons, assignableMembers] =
    await Promise.all([
      repo.listActiveLessons(),
      repo.listEnrollments(),
      repo.listTeacherMembers(),
      repo.countActiveLessons(),
      isAdmin ? repo.listAssignableStudents({ limit: 8 }) : Promise.resolve([]),
    ])

  const viewerTeacher = await resolveViewerTeacher(user)
  const students = enrollments.map((row) => toStudentView(row, totalLessons))

  const myStudents = viewerTeacher
    ? students.filter((s) => s.teacherId === viewerTeacher.id)
    : []

  const needAttention = myStudents.filter(
    (s) => s.status === NBC_ENROLLMENT_STATUSES.BEHIND,
  ).length

  const teachingLessonNumbers = [
    ...new Set(myStudents.map((s) => s.currentLesson).filter(Boolean)),
  ].sort((a, b) => a - b)

  const teachingLessons = lessons.filter((lesson) =>
    teachingLessonNumbers.includes(lesson.sortOrder),
  )

  const lessonsWithStudents = lessons.map((lesson) => {
    const onLesson = students.filter((s) => s.lessonId === lesson.id)
    return {
      id: lesson.id,
      number: lesson.sortOrder,
      title: lesson.title,
      description: lesson.description || '',
      studentCount: onLesson.length,
      students: onLesson,
    }
  })

  const teachersView = teachers.map((teacher) => {
    const name = memberName(teacher)
    const teacherStudents = students.filter((s) => s.teacherId === teacher.id)
    const activeLessons = new Set(teacherStudents.map((s) => s.currentLesson)).size
    return {
      id: teacher.id,
      name,
      shortName: name,
      role:
        viewerTeacher?.id === teacher.id
          ? 'Lead Teacher'
          : 'Teacher',
      isYou: viewerTeacher?.id === teacher.id,
      initials: initials(name),
      students: teacherStudents,
      studentCount: teacherStudents.length,
      activeLessonCount: activeLessons,
    }
  })

  return {
    stats: {
      totalLessons,
      totalStudents: students.length,
      myStudents: myStudents.length,
      needAttention,
      unassigned: assignableMembers.length,
    },
    currentTeacher: viewerTeacher
      ? {
          id: viewerTeacher.id,
          name: memberName(viewerTeacher),
          shortName: memberName(viewerTeacher),
          role: 'Teacher',
          isYou: true,
        }
      : {
          id: null,
          name: user?.name || user?.email || 'Admin',
          shortName: user?.name || 'Admin',
          role: isAdmin ? 'Admin' : 'Teacher',
          isYou: true,
        },
    myStudents,
    teachingLessons: teachingLessons.map((lesson) => ({
      id: lesson.id,
      number: lesson.sortOrder,
      title: lesson.title,
      description: lesson.description || '',
    })),
    lessons: lessonsWithStudents,
    teachers: teachersView,
    teacherOptions: teachers.map((teacher) => ({
      id: teacher.id,
      name: memberName(teacher),
    })),
    assignments: isAdmin ? students : [],
    assignableStudents: assignableMembers.map((member) => {
      const name = memberName(member)
      return {
        id: member.id,
        name,
        initials: initials(name),
        email: member.email || null,
      }
    }),
  }
}

async function searchAssignableStudents(query = {}) {
  const members = await repo.listAssignableStudents({
    search: query.search,
    limit: query.limit ?? 20,
  })

  return members.map((member) => {
    const name = memberName(member)
    return {
      id: member.id,
      name,
      initials: initials(name),
      email: member.email || null,
    }
  })
}

async function createLesson(body) {
  const title = body.title.trim()
  let sortOrder = body.sortOrder
  if (sortOrder == null) {
    const max = await repo.maxLessonSortOrder()
    sortOrder = (max._max.sortOrder || 0) + 1
  } else {
    const existing = await repo.findLessonBySortOrder(sortOrder)
    if (existing) {
      throw AppError.conflict(`Lesson number ${sortOrder} already exists`)
    }
  }

  return repo.createLesson({
    sortOrder,
    title,
    description: body.description,
  })
}

async function updateLesson(id, body) {
  const lesson = await repo.findLessonById(id)
  if (!lesson) throw AppError.notFound('Lesson not found')

  if (body.sortOrder != null && body.sortOrder !== lesson.sortOrder) {
    const clash = await repo.findLessonBySortOrder(body.sortOrder)
    if (clash) {
      throw AppError.conflict(`Lesson number ${body.sortOrder} already exists`)
    }
  }

  return repo.updateLesson(id, {
    ...(body.title != null ? { title: body.title.trim() } : {}),
    ...(body.description !== undefined
      ? { description: body.description }
      : {}),
    ...(body.sortOrder != null ? { sortOrder: body.sortOrder } : {}),
    ...(body.isActive != null ? { isActive: body.isActive } : {}),
  })
}

async function createEnrollment(body, user) {
  const [student, teacher, lesson, existing] = await Promise.all([
    repo.findMemberById(body.studentId),
    repo.findMemberById(body.teacherId),
    repo.findLessonById(body.lessonId),
    repo.findEnrollmentByStudentId(body.studentId),
  ])

  if (!student) throw AppError.notFound('Student member not found')
  if (!student.isNewBeliever) {
    throw AppError.badRequest(
      'Member must be marked as a new believer before assignment',
    )
  }
  if (!teacher) throw AppError.notFound('Teacher member not found')
  if (!repo.isTeacherMember(teacher)) {
    throw AppError.badRequest(
      `Teacher must belong to the ${NBC_TEACHER_GROUP_ROLE} ministry`,
    )
  }
  if (!lesson || !lesson.isActive) {
    throw AppError.badRequest('Lesson not found or inactive')
  }
  if (existing) {
    throw AppError.conflict('Member is already enrolled in New Believers Class')
  }
  if (body.studentId === body.teacherId) {
    throw AppError.badRequest('Student and teacher must be different members')
  }

  return repo.createEnrollment({
    studentId: body.studentId,
    teacherId: body.teacherId,
    currentLessonId: body.lessonId,
    status: body.status || NBC_ENROLLMENT_STATUSES.ON_TRACK,
    actorUserId: user?.id,
  })
}

async function moveEnrollment(id, body, user) {
  const enrollment = await repo.findEnrollmentById(id)
  if (!enrollment) throw AppError.notFound('Enrollment not found')

  const viewer = await resolveViewerTeacher(user)
  if (
    !viewer ||
    !repo.isTeacherMember(viewer) ||
    viewer.id !== enrollment.teacherId
  ) {
    throw AppError.forbidden('Only the assigned teacher can move a student')
  }

  const lesson = await repo.findLessonById(body.lessonId)
  if (!lesson || !lesson.isActive) {
    throw AppError.badRequest('Lesson not found or inactive')
  }

  if (enrollment.currentLessonId === body.lessonId && !body.status) {
    throw AppError.badRequest('Student is already on this lesson')
  }

  if (
    enrollment.currentLessonId === body.lessonId &&
    body.status &&
    body.status === enrollment.status
  ) {
    throw AppError.badRequest('Nothing to update — pick a new lesson or status')
  }

  return repo.moveEnrollment({
    enrollmentId: id,
    fromLessonId: enrollment.currentLessonId,
    toLessonId: body.lessonId,
    status: body.status,
    note: body.note,
    actorUserId: user?.id,
  })
}

async function updateEnrollment(id, body) {
  const enrollment = await repo.findEnrollmentById(id)
  if (!enrollment) throw AppError.notFound('Enrollment not found')

  if (body.teacherId) {
    const teacher = await repo.findMemberById(body.teacherId)
    if (!teacher) throw AppError.notFound('Teacher member not found')
    if (!repo.isTeacherMember(teacher)) {
      throw AppError.badRequest(
        `Teacher must belong to the ${NBC_TEACHER_GROUP_ROLE} ministry`,
      )
    }
  }

  return repo.updateEnrollment(id, {
    ...(body.teacherId ? { teacherId: body.teacherId } : {}),
    ...(body.status ? { status: body.status } : {}),
  })
}

module.exports = {
  getOverview,
  searchAssignableStudents,
  createLesson,
  updateLesson,
  createEnrollment,
  moveEnrollment,
  updateEnrollment,
  listActiveLessons: () => repo.listActiveLessons(),
}
