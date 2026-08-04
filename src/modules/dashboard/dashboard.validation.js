const { z } = require('zod')

const rangeSchema = z.object({
  query: z.object({
    range: z
      .string()
      .regex(/^\d+m$/, "range must look like '6m'")
      .optional()
      .default('6m'),
  }),
})

const recentActivitySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().positive().max(50).optional().default(5),
  }),
})

module.exports = { rangeSchema, recentActivitySchema }
