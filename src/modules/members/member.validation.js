const { z } = require('zod')

const listMembersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
  }),
})

module.exports = { listMembersSchema }
