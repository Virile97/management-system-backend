const { z } = require('zod')

const listTransactionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    type: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
  }),
})

module.exports = { listTransactionsSchema }
