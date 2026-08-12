const { z } = require('zod')
const { ROLES } = require('../../config/constants')

const roleSchema = z.enum([ROLES.ADMIN, ROLES.FINANCE_ADMIN, ROLES.USER])

const createUserSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Full name is required'),
    email: z.string().trim().email('Invalid email address'),
    contact: z.string().trim().min(5, 'Contact is required'),
    role: roleSchema,
  }),
})

const updateUserSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  body: z
    .object({
      name: z.string().trim().min(1).optional(),
      email: z.string().trim().email().optional(),
      contact: z.string().trim().min(5).nullable().optional(),
      role: roleSchema.optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
})

const listUsersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
})

module.exports = { createUserSchema, updateUserSchema, listUsersSchema }
