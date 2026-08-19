const { z } = require('zod')
const { periodQuery } = require('../../shared/validators/common.validation')

const yearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

/** Overview requires year so goal never silently falls back to another calendar year. */
const overviewYearQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
})

const includeQuery = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value)) return value
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}, z.array(z.enum(['goal', 'stats', 'retention'])).optional())

const memberUuid = z.string().uuid('Must be a valid member id')

/** Accept winnerMemberIds[], or legacy singular winnerMemberId. Dedupes, requires ≥1. */
const winnerMemberIdsField = z.preprocess((value) => {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value) return [value]
  return value
}, z.array(memberUuid).min(1, 'At least one soul winner is required').max(20))

function normalizeWinnerIds(body) {
  if (!body || typeof body !== 'object') return body
  const next = { ...body }
  if (next.winnerMemberIds == null && next.winnerMemberId != null) {
    next.winnerMemberIds = [next.winnerMemberId]
  }
  delete next.winnerMemberId
  if (Array.isArray(next.winnerMemberIds)) {
    next.winnerMemberIds = [...new Set(next.winnerMemberIds)]
  }
  return next
}

const periodWithPagination = periodQuery.and(
  z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
    status: z
      .enum(['New Convert', 'Active Member', 'Active', 'Inactive'])
      .optional(),
    // Member UUID of any soul winner on the record.
    winnerMemberId: z.string().uuid('winnerMemberId must be a member UUID').optional(),
    event: z.string().min(1).optional(),
    sort: z.enum(['date', 'convert', 'status']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
  }),
)

const overviewSchema = z.object({
  query: periodQuery.and(overviewYearQuery).and(z.object({ include: includeQuery })),
})

const listRecordsSchema = z.object({ query: periodWithPagination })

const listWinnersSchema = z.object({
  query: periodQuery.and(
    z.object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().optional(),
      search: z.string().min(1).optional(),
    }),
  ),
})

const trendsSchema = z.object({
  query: periodQuery.and(
    z.object({
      year: z.coerce.number().int().min(2000).max(2100).optional(),
    }),
  ),
})

const getGoalSchema = z.object({ query: yearQuery })

const createRecordSchema = z.object({
  // Optional period/year on query so mutation snapshot can match the open UI filters.
  query: z
    .object({
      period: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      year: z.coerce.number().int().min(2000).max(2100).optional(),
    })
    .optional(),
  body: z.preprocess(
    normalizeWinnerIds,
    z.object({
      firstName: z.string().min(1, 'First name is required'),
      middleName: z.string().min(1).optional().nullable(),
      lastName: z.string().min(1, 'Last name is required'),
      contact: z.string().min(1).optional().nullable(),
      location: z.string().min(1).optional().nullable(),
      age: z.coerce.number().int().min(0).max(120).optional().nullable(),
      event: z.string().min(1).max(200).optional().nullable(),
      notes: z.string().min(1).optional().nullable(),
      wonAt: z.coerce.date().optional(),
      winnerMemberIds: winnerMemberIdsField,
    }),
  ),
})

const updateRecordSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  body: z.preprocess(
    normalizeWinnerIds,
    z
      .object({
        firstName: z.string().min(1).optional(),
        middleName: z.string().min(1).optional().nullable(),
        lastName: z.string().min(1).optional(),
        contact: z.string().min(1).optional().nullable(),
        location: z.string().min(1).optional().nullable(),
        age: z.coerce.number().int().min(0).max(120).optional().nullable(),
        event: z.string().min(1).max(200).optional().nullable(),
        notes: z.string().min(1).optional().nullable(),
        wonAt: z.coerce.date().optional(),
        winnerMemberIds: winnerMemberIdsField.optional(),
      })
      .refine((body) => Object.keys(body).length > 0, {
        message: 'At least one field is required',
      }),
  ),
})

const baptizeRecordSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  query: z
    .object({
      period: z.enum(['today', 'week', 'month', 'year', 'all', 'custom']).optional(),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      year: z.coerce.number().int().min(2000).max(2100).optional(),
    })
    .optional(),
  body: z
    .object({
      baptizedAt: z.coerce.date().optional(),
      email: z.string().email().optional(),
      gender: z.enum(['MALE', 'FEMALE']).optional(),
      birthDate: z.coerce.date().optional(),
      groupIds: z.array(z.string().uuid('Invalid groupId')).optional(),
      levelId: z.string().uuid('Invalid levelId').optional(),
      lighthouseGroupId: z.string().uuid('Invalid lighthouseGroupId').optional(),
    })
    .optional()
    .default({}),
})

const upsertGoalSchema = z.object({
  body: z.object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    targetCount: z.coerce.number().int().positive('targetCount must be greater than 0'),
  }),
})

module.exports = {
  overviewSchema,
  listRecordsSchema,
  listWinnersSchema,
  trendsSchema,
  getGoalSchema,
  createRecordSchema,
  updateRecordSchema,
  baptizeRecordSchema,
  upsertGoalSchema,
}
