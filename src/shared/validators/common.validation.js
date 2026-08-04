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

module.exports = { idParamSchema, paginationQuerySchema }
