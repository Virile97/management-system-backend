const { z } = require('zod')

const listAttendanceSchema = z.object({
  query: z.object({
    date: z.coerce.date({ required_error: 'date is required' }),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
    level: z.string().min(1).optional(),
  }),
})

const upsertAttendanceSchema = z.object({
  params: z.object({
    memberId: z.string().uuid('Invalid memberId format'),
  }),
  body: z
    .object({
      date: z.coerce.date({ required_error: 'date is required' }),
      morningIn: z.coerce.date().nullable().optional(),
      morningOut: z.coerce.date().nullable().optional(),
      afternoonIn: z.coerce.date().nullable().optional(),
      afternoonOut: z.coerce.date().nullable().optional(),
    })
    .refine(
      (data) =>
        data.morningIn !== undefined ||
        data.morningOut !== undefined ||
        data.afternoonIn !== undefined ||
        data.afternoonOut !== undefined,
      { message: 'At least one session time field is required' },
    ),
})

module.exports = { listAttendanceSchema, upsertAttendanceSchema }
