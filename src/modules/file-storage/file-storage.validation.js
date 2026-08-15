const { z } = require('zod')
const { FILE_TYPE_VALUES } = require('./file-storage.constants')

const listFilesSchema = z.object({
  query: z.object({
    folderId: z.string().uuid().optional(),
    type: z.enum(FILE_TYPE_VALUES).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    tag: z.string().trim().min(1).max(60).optional(),
    sort: z.enum(['date', 'name', 'size']).optional().default('date'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  }),
})

// multer populates req.file separately — this schema only covers the
// string fields multer parses into req.body from the multipart form.
const uploadFileSchema = z.object({
  body: z.object({
    folderId: z.string().uuid().optional().or(z.literal('')),
    tags: z.string().trim().max(300).optional().or(z.literal('')),
  }),
})

const listFoldersSchema = z.object({
  query: z.object({
    folderId: z.string().uuid().optional(),
  }),
})

const createFolderSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    parentId: z.string().uuid().nullable().optional(),
  }),
})

const renameFolderSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ name: z.string().trim().min(1).max(120) }),
})

const renameFileSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z
    .object({
      name: z.string().trim().min(1).max(255).nullable().optional(),
      tags: z
        .array(z.string().trim().min(1).max(60))
        .max(10)
        .nullable()
        .optional(),
    })
    .refine((body) => Object.keys(body).length > 0, {
      message: 'At least one field is required',
    }),
})

const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
})

const moveFileSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ folderId: z.string().uuid().nullable() }),
})

module.exports = {
  listFilesSchema,
  uploadFileSchema,
  listFoldersSchema,
  createFolderSchema,
  renameFolderSchema,
  renameFileSchema,
  idParamSchema,
  moveFileSchema,
}
