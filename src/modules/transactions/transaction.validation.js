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

const createTransactionSchema = z.object({
  body: z
    .object({
      typeId: z.string().uuid('typeId must be a valid id'),
      categoryId: z.string().uuid('categoryId must be a valid id').optional(),
      memberId: z.string().uuid('memberId must be a valid id').optional(),
      description: z.string().min(1).optional(),
      date: z.coerce.date().optional(),
      amount: z.coerce.number().positive('amount must be greater than 0').optional(),
      breakdown: z
        .array(
          z.object({
            offeringTypeId: z.string().uuid('offeringTypeId must be a valid id'),
            amount: z.coerce.number().positive('amount must be greater than 0'),
          }),
        )
        .min(1)
        .optional(),
    })
    .refine((data) => data.amount !== undefined || data.breakdown !== undefined, {
      message: 'Either amount or breakdown is required',
      path: ['amount'],
    }),
})

module.exports = {
  listTransactionsSchema,
  periodQuerySchema,
  byOfferingTypeSchema,
  createTransactionSchema,
}
