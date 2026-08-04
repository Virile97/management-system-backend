const { z } = require('zod')

const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  body: z.object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
  }),
})

const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
})

module.exports = { updateUserSchema, listUsersSchema }
