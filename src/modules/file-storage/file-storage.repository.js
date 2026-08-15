const prisma = require('../../config/prisma')

const uploaderSelect = {
  id: true,
  name: true,
  email: true,
}

const folderSelect = {
  id: true,
  name: true,
}

/**
 * folderId scoping rules:
 * - Explicit folderId (a real uuid) -> that folder only.
 * - No folderId AND no type/search/tag filter -> root level only
 *   (folderId IS NULL). This is plain folder browsing ("All Files" at the
 *   top level), so it must not leak files sitting inside subfolders.
 * - No folderId but type/search/tag IS set -> library-wide, unscoped by
 *   folder. Sidebar type filters and search intentionally search
 *   everywhere, not just the current level.
 */
function buildFileWhere({ folderId, type, search, tag }) {
  const isLibraryWideQuery = Boolean(type || search || tag)

  return {
    ...(folderId !== undefined
      ? { folderId: folderId || null }
      : isLibraryWideQuery
        ? {}
        : { folderId: null }),
    ...(type ? { fileType: type } : {}),
    ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
  }
}

const SORT_FIELD_MAP = {
  date: 'createdAt',
  name: 'name',
  size: 'sizeBytes',
}

function listFiles({ folderId, type, search, tag, sort, order, skip, limit }) {
  return prisma.storageFile.findMany({
    where: buildFileWhere({ folderId, type, search, tag }),
    include: {
      uploadedByUser: { select: uploaderSelect },
      folder: { select: folderSelect },
    },
    orderBy: { [SORT_FIELD_MAP[sort] || 'createdAt']: order || 'desc' },
    skip,
    take: limit,
  })
}

function countFiles({ folderId, type, search, tag }) {
  return prisma.storageFile.count({ where: buildFileWhere({ folderId, type, search, tag }) })
}

async function countByType() {
  const rows = await prisma.storageFile.groupBy({
    by: ['fileType'],
    _count: true,
  })
  return rows.reduce((acc, row) => {
    acc[row.fileType] = row._count
    return acc
  }, {})
}

function countAllFiles() {
  return prisma.storageFile.count()
}

async function sumSizeBytes() {
  const result = await prisma.storageFile.aggregate({
    _sum: { sizeBytes: true },
  })
  return result._sum.sizeBytes || 0n
}

function findFileById(id) {
  return prisma.storageFile.findUnique({
    where: { id },
    include: {
      uploadedByUser: { select: uploaderSelect },
      folder: { select: folderSelect },
    },
  })
}

function createFile(data) {
  return prisma.storageFile.create({
    data,
    include: {
      uploadedByUser: { select: uploaderSelect },
      folder: { select: folderSelect },
    },
  })
}

function updateFile(id, data) {
  return prisma.storageFile.update({
    where: { id },
    data,
    include: {
      uploadedByUser: { select: uploaderSelect },
      folder: { select: folderSelect },
    },
  })
}

function deleteFile(id) {
  return prisma.storageFile.delete({ where: { id } })
}

function findFolderById(id) {
  return prisma.folder.findUnique({ where: { id } })
}

function listFolders({ parentId } = {}) {
  return prisma.folder.findMany({
    where: { parentId: parentId ?? null },
    orderBy: { name: 'asc' },
  })
}

function findFolderByName({ parentId, name }) {
  return prisma.folder.findFirst({
    where: {
      parentId: parentId ?? null,
      name: { equals: name, mode: 'insensitive' },
    },
  })
}

function createFolder(data) {
  return prisma.folder.create({ data })
}

function updateFolder(id, data) {
  return prisma.folder.update({ where: { id }, data })
}

function deleteFolder(id) {
  return prisma.folder.delete({ where: { id } })
}

async function countFolderChildren(id) {
  const [subfolders, files] = await Promise.all([
    prisma.folder.count({ where: { parentId: id } }),
    prisma.storageFile.count({ where: { folderId: id } }),
  ])
  return subfolders + files
}

async function listFolderBreadcrumb(folderId) {
  const chain = []
  let currentId = folderId

  while (currentId) {
    const folder = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true },
    })
    if (!folder) break
    chain.unshift({ id: folder.id, name: folder.name })
    currentId = folder.parentId
  }

  return chain
}

module.exports = {
  listFiles,
  countFiles,
  countByType,
  countAllFiles,
  sumSizeBytes,
  findFileById,
  createFile,
  updateFile,
  deleteFile,
  findFolderById,
  listFolders,
  findFolderByName,
  createFolder,
  updateFolder,
  deleteFolder,
  countFolderChildren,
  listFolderBreadcrumb,
}
