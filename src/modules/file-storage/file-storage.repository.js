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
 *
 * All active-view queries also exclude archived rows (deletedAt IS NULL) —
 * see the *Archived variants below for the archive listing itself.
 */
function buildFileWhere({ folderId, type, search, tag }) {
  const isLibraryWideQuery = Boolean(type || search || tag)

  return {
    deletedAt: null,
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
    where: { deletedAt: null },
    _count: true,
  })
  return rows.reduce((acc, row) => {
    acc[row.fileType] = row._count
    return acc
  }, {})
}

function countAllFiles() {
  return prisma.storageFile.count({ where: { deletedAt: null } })
}

async function sumSizeBytes() {
  const result = await prisma.storageFile.aggregate({
    where: { deletedAt: null },
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

/** Real, irreversible row removal — only ever called on an already-archived
 * row, after its Supabase object has been removed. */
function deleteFile(id) {
  return prisma.storageFile.delete({ where: { id } })
}

function findFolderById(id) {
  return prisma.folder.findUnique({ where: { id } })
}

function listFolders({ parentId } = {}) {
  return prisma.folder.findMany({
    where: { parentId: parentId ?? null, deletedAt: null },
    orderBy: { name: 'asc' },
  })
}

function findFolderByName({ parentId, name }) {
  return prisma.folder.findFirst({
    where: {
      parentId: parentId ?? null,
      name: { equals: name, mode: 'insensitive' },
      deletedAt: null,
    },
  })
}

function createFolder(data) {
  return prisma.folder.create({ data })
}

function updateFolder(id, data) {
  return prisma.folder.update({ where: { id }, data })
}

/** Real, irreversible row removal — only ever called on an already-archived
 * folder, once it has no remaining children. */
function deleteFolder(id) {
  return prisma.folder.delete({ where: { id } })
}

async function countFolderChildren(id) {
  const [subfolders, files] = await Promise.all([
    prisma.folder.count({ where: { parentId: id, deletedAt: null } }),
    prisma.storageFile.count({ where: { folderId: id, deletedAt: null } }),
  ])
  return subfolders + files
}

/** Same as countFolderChildren but ignores archive status — used before a
 * permanent delete, since a folder still holding archived children can't
 * be purged without orphaning them. */
async function countAllFolderChildren(id) {
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

/** All descendant folder ids under `id`, not including `id` itself.
 * Walked level-by-level rather than a single recursive query since this
 * schema has no native recursive-CTE helper wired up elsewhere. */
async function listDescendantFolderIds(id) {
  const ids = []
  let frontier = [id]

  while (frontier.length > 0) {
    const children = await prisma.folder.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    })
    frontier = children.map((c) => c.id)
    ids.push(...frontier)
  }

  return ids
}

/** Soft-deletes a folder and every file/subfolder inside it (recursively),
 * all stamped with the same deletedAt so they archive/restore as one unit. */
async function archiveFolderTree(id, deletedAt) {
  const descendantFolderIds = await listDescendantFolderIds(id)
  const allFolderIds = [id, ...descendantFolderIds]

  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { id: { in: allFolderIds } },
      data: { deletedAt },
    }),
    prisma.storageFile.updateMany({
      where: { folderId: { in: allFolderIds } },
      data: { deletedAt },
    }),
  ])
}

/** Collects the ids of every archived ancestor above `parentId`, walking up
 * the chain until an active folder or the root is reached. Read-only — used
 * to build a restore operation list that runs inside the caller's
 * transaction, rather than issuing separate non-transactional updates. */
async function collectArchivedAncestorIds(parentId) {
  const ids = []
  let currentId = parentId

  while (currentId) {
    const parent = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, parentId: true, deletedAt: true },
    })
    if (!parent) break
    if (parent.deletedAt) ids.push(parent.id)
    currentId = parent.parentId
  }

  return ids
}

/** Restores a folder and everything archived alongside it in the same
 * archiveFolderTree call (matched by identical deletedAt timestamp), plus
 * restores any archived ancestors so the tree isn't left with a restored
 * item nested under a still-archived (invisible) parent. All updates run in
 * a single transaction so a failure partway leaves nothing half-restored. */
async function restoreFolderTree(id) {
  const folder = await prisma.folder.findUnique({ where: { id } })
  if (!folder || !folder.deletedAt) return

  const descendantFolderIds = await listDescendantFolderIds(id)
  const allFolderIds = [id, ...descendantFolderIds]
  const ancestorIds = await collectArchivedAncestorIds(folder.parentId)

  await prisma.$transaction([
    prisma.folder.updateMany({
      where: { id: { in: allFolderIds }, deletedAt: folder.deletedAt },
      data: { deletedAt: null },
    }),
    prisma.storageFile.updateMany({
      where: { folderId: { in: allFolderIds }, deletedAt: folder.deletedAt },
      data: { deletedAt: null },
    }),
    ...(ancestorIds.length > 0
      ? [
          prisma.folder.updateMany({
            where: { id: { in: ancestorIds } },
            data: { deletedAt: null },
          }),
        ]
      : []),
  ])
}

function archiveFile(id, deletedAt) {
  return prisma.storageFile.update({ where: { id }, data: { deletedAt } })
}

/** Restores a single file plus any archived ancestor folders, all in one
 * transaction (see restoreFolderTree for why this must be atomic). */
async function restoreFile(id) {
  const file = await prisma.storageFile.findUnique({ where: { id } })
  if (!file) return null

  const ancestorIds = file.folderId
    ? await collectArchivedAncestorIds(file.folderId)
    : []

  const [updated] = await prisma.$transaction([
    prisma.storageFile.update({ where: { id }, data: { deletedAt: null } }),
    ...(ancestorIds.length > 0
      ? [
          prisma.folder.updateMany({
            where: { id: { in: ancestorIds } },
            data: { deletedAt: null },
          }),
        ]
      : []),
  ])

  return updated
}

/** Flat list of every archived file and folder, most-recently-archived
 * first. Each row carries enough context (original folder name) to show
 * where it came from without needing full archive-side folder navigation. */
async function listArchived() {
  const [files, folders] = await Promise.all([
    prisma.storageFile.findMany({
      where: { deletedAt: { not: null } },
      include: {
        uploadedByUser: { select: uploaderSelect },
        folder: { select: folderSelect },
      },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.folder.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    }),
  ])
  return { files, folders }
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
  archiveFile,
  restoreFile,
  findFolderById,
  listFolders,
  findFolderByName,
  createFolder,
  updateFolder,
  deleteFolder,
  archiveFolderTree,
  restoreFolderTree,
  countFolderChildren,
  countAllFolderChildren,
  listFolderBreadcrumb,
  listArchived,
}
