const { z } = require('zod')

const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
})

const paginationQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
})

const periodQuery = z
  .object({
    period: z.enum(['today', 'month', 'year', 'all', 'custom']).optional().default('month'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => data.period !== 'custom' || (data.from && data.to), {
    message: "from and to are required when period is 'custom'",
    path: ['from'],
  })

module.exports = { idParamSchema, paginationQuerySchema, periodQuery }
