const { z } = require('zod')

const createPostSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Title is required'),
    content: z.string().optional(),
    published: z.boolean().optional(),
  }),
})

const updatePostSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid id format'),
  }),
  body: z.object({
    title: z.string().min(1).optional(),
    content: z.string().optional(),
    published: z.boolean().optional(),
  }),
})

const listPostsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    published: z.enum(['true', 'false']).optional(),
  }),
})

module.exports = { createPostSchema, updatePostSchema, listPostsSchema }
