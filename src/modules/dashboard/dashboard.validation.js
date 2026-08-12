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

const attendanceRangeSchema = z.object({
  query: z.object({
    range: z
      .string()
      .regex(/^\d+w$/, "range must look like '5w'")
      .optional()
      .default('5w'),
  }),
})

module.exports = { rangeSchema, recentActivitySchema, attendanceRangeSchema }
