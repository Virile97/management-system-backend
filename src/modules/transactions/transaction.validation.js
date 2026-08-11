const { z } = require('zod')
const { periodQuery, offeringTypeIdsQuery } = require('../../shared/validators/common.validation')

const listTransactionsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    type: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    search: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
})

const periodQuerySchema = z.object({ query: periodQuery })

const byOfferingTypeSchema = z.object({
  query: periodQuery.and(z.object({ offeringTypeId: offeringTypeIdsQuery })),
})

const breakdownSchema = z
  .array(
    z.object({
      offeringTypeId: z.string().uuid('offeringTypeId must be a valid id'),
      amount: z.coerce.number().positive('amount must be greater than 0'),
    }),
  )
  .min(1)

const createTransactionSchema = z.object({
  body: z
    .object({
      typeId: z.string().uuid('typeId must be a valid id'),
      categoryId: z.string().uuid('categoryId must be a valid id').nullable().optional(),
      memberId: z.string().uuid('memberId must be a valid id').nullable().optional(),
      description: z.string().min(1).nullable().optional(),
      date: z.coerce.date().optional(),
      amount: z.coerce.number().positive('amount must be greater than 0').optional(),
      breakdown: breakdownSchema.optional(),
    })
    .refine((data) => data.amount !== undefined || data.breakdown !== undefined, {
      message: 'Either amount or breakdown is required',
      path: ['amount'],
    }),
})

const updateTransactionSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  body: z
    .object({
      typeId: z.string().uuid('typeId must be a valid id').optional(),
      categoryId: z.string().uuid('categoryId must be a valid id').nullable().optional(),
      memberId: z.string().uuid('memberId must be a valid id').nullable().optional(),
      description: z.string().min(1).nullable().optional(),
      date: z.coerce.date().optional(),
      amount: z.coerce.number().positive('amount must be greater than 0').optional(),
      breakdown: breakdownSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required',
    }),
})

module.exports = {
  listTransactionsSchema,
  periodQuerySchema,
  byOfferingTypeSchema,
  createTransactionSchema,
  updateTransactionSchema,
}
