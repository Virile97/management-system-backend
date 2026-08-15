const { z } = require('zod')
const { NBC_ENROLLMENT_STATUS_VALUES } = require('./new-believers.constants')

const enrollmentStatus = z.enum(NBC_ENROLLMENT_STATUS_VALUES)

const overviewSchema = z.object({
  query: z.object({}).optional().default({}),
})

const createLessonSchema = z.object({
  body: z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    sortOrder: z.coerce.number().int().positive().max(200),
  }),
})

const updateLessonSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      description: z.string().trim().max(500).optional().nullable(),
      sortOrder: z.coerce.number().int().positive().max(200).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
})

const createEnrollmentSchema = z.object({
  body: z.object({
    studentId: z.string().uuid(),
    teacherId: z.string().uuid(),
    lessonId: z.string().uuid(),
    status: enrollmentStatus.optional().default('ON_TRACK'),
  }),
})

const moveEnrollmentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    lessonId: z.string().uuid(),
    status: enrollmentStatus.optional(),
    note: z.string().trim().max(300).optional().nullable(),
  }),
})

const updateEnrollmentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      teacherId: z.string().uuid().optional(),
      status: enrollmentStatus.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
})

const assignableStudentsSchema = z.object({
  query: z.object({
    search: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().positive().max(50).optional(),
  }),
})

const memberJourneySchema = z.object({
  params: z.object({
    memberId: z.string().uuid(),
  }),
})

module.exports = {
  overviewSchema,
  assignableStudentsSchema,
  memberJourneySchema,
  createLessonSchema,
  updateLessonSchema,
  createEnrollmentSchema,
  moveEnrollmentSchema,
  updateEnrollmentSchema,
}
