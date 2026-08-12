const { z } = require('zod')

const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(1).optional(),
  }),
})

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
})

const verifyPasswordSetupSchema = z.object({
  query: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
})

const setPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
})

module.exports = {
  registerSchema,
  loginSchema,
  verifyPasswordSetupSchema,
  setPasswordSchema,
}
