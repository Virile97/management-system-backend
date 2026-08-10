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
    period: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional().default('month'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((data) => data.period !== 'custom' || (data.from && data.to), {
    message: "from and to are required when period is 'custom'",
    path: ['from'],
  })

// Accepts repeated query keys (?offeringTypeId=a&offeringTypeId=b, parsed by
// Express as an array), a single value (parsed as a string), or a
// comma-separated value, and normalizes all three to an array of ids.
const offeringTypeIdsQuery = z.preprocess((value) => {
  if (value === undefined) return undefined
  const values = Array.isArray(value) ? value : String(value).split(',')
  return values.map((v) => v.trim()).filter(Boolean)
}, z.array(z.string().uuid('offeringTypeId must be a valid id')).optional())

module.exports = { idParamSchema, paginationQuerySchema, periodQuery, offeringTypeIdsQuery }
