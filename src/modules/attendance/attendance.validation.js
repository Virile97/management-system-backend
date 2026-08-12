const { z } = require('zod')

const listAttendanceSchema = z.object({
  query: z
    .object({
      from: z.coerce.date({ required_error: 'from is required' }),
      to: z.coerce.date({ required_error: 'to is required' }),
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().optional(),
      search: z.string().min(1).optional(),
      level: z.string().min(1).optional(),
    })
    .refine((data) => data.from <= data.to, {
      message: 'from must be on or before to',
      path: ['from'],
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
