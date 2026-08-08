const { z } = require('zod')

const listMembersSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    search: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
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
  statusId: z.string().uuid('Invalid statusId').optional(),
  levelId: z.string().uuid('Invalid levelId').optional(),
  lighthouseGroupId: z.string().uuid('Invalid lighthouseGroupId').optional(),
  groupIds: z.array(z.string().uuid('Invalid groupId')).optional(),
}

const createMemberSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
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
  createMemberSchema,
  updateMemberSchema,
  bulkDeleteMembersSchema,
}
