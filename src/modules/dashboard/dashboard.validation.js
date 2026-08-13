const { z } = require('zod')

const overviewSchema = z.object({
  query: z.object({
    financeRange: z
      .string()
      .regex(/^\d+m$/, "financeRange must look like '6m'")
      .optional()
      .default('6m'),
    attendanceRange: z
      .string()
      .regex(/^\d+w$/, "attendanceRange must look like '5w'")
      .optional()
      .default('5w'),
    activityLimit: z.coerce.number().int().positive().max(50).optional().default(5),
  }),
})

module.exports = { overviewSchema }
