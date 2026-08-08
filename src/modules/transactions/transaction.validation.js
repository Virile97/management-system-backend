const { z } = require('zod')

const listTransactionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    type: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
})

const monthlyTrendSchema = z.object({
  query: z.object({
    range: z
      .string()
      .regex(/^\d+m$/, "range must look like '6m'")
      .optional()
      .default('6m'),
  }),
})

module.exports = { listTransactionsSchema, monthlyTrendSchema }
