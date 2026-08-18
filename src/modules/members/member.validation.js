const { z } = require('zod')
const { periodQuery, offeringTypeIdsQuery } = require('../../shared/validators/common.validation')

const listMembersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
})

const memberBreakdownSchema = z.object({
  query: z.object({
    search: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
})

const memberOfferingsSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  query: periodQuery.and(
    z.object({
      page: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().optional(),
      offeringTypeId: offeringTypeIdsQuery,
    }),
  ),
})

const getMemberSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
  }),
})

const memberFieldsSchema = {
  middleName: z.string().min(1).optional(),
  email: z.string().email('Invalid email address').optional(),
  contact: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  baptizedAt: z.coerce.date().optional(),
  birthDate: z.coerce.date().optional(),
  age: z.coerce.number().int().positive().optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  isNewBeliever: z.boolean().optional(),
  statusId: z.string().uuid('Invalid statusId').optional(),
  lighthouseGroupId: z.string().uuid('Invalid lighthouseGroupId').optional(),
  groupIds: z.array(z.string().uuid('Invalid groupId')).optional(),
}

const createMemberSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    levelId: z.string().uuid('Invalid levelId').min(1, 'levelId is required'),
    ...memberFieldsSchema,
  }),
})

const updateMemberSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  body: z.object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().min(1).optional(),
    levelId: z.string().uuid('Invalid levelId').optional(),
    ...memberFieldsSchema,
  }),
})

const bulkDeleteMembersSchema = z.object({
  body: z.object({
    ids: z.array(z.string().uuid('Invalid id format')).min(1, 'ids must contain at least one id'),
  }),
})

module.exports = {
  listMembersSchema,
  memberBreakdownSchema,
  memberOfferingsSchema,
  getMemberSchema,
  createMemberSchema,
  updateMemberSchema,
  bulkDeleteMembersSchema,
}
