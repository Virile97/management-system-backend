const crypto = require('crypto')
const repo = require('./file-storage.repository')
const supabase = require('../../config/supabase')
const env = require('../../config/env')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { resolveFileType, SIGNED_URL_EXPIRY_SECONDS } = require('./file-storage.constants')

const bucket = env.SUPABASE_STORAGE_BUCKET

function sanitizeFilename(name) {
  return String(name || 'file')
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'file'
}

function uploaderName(user) {
  if (!user) return null
  return user.name || user.email || null
}

/** Maps a DB row to the public API shape. Never includes storagePath/bucket
 * — clients only get an id and must request a signed URL to reach bytes. */
function toFileResponse(file) {
  return {
    id: file.id,
    name: file.name,
    originalName: file.originalName,
    folderId: file.folderId,
    folder: file.folder ? { id: file.folder.id, name: file.folder.name } : null,
    mimeType: file.mimeType,
    sizeBytes: Number(file.sizeBytes),
    fileType: file.fileType,
    tags: file.tags,
    uploadedBy: file.uploadedBy,
    uploadedByName: uploaderName(file.uploadedByUser),
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    deletedAt: file.deletedAt ?? null,
  }
}

function toFolderResponse(folder) {
  return {
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    createdBy: folder.createdBy,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    deletedAt: folder.deletedAt ?? null,
  }
}

async function listFiles(query = {}) {
  const { page, limit, skip } = getPagination(query)
  const params = {
    folderId: query.folderId,
    type: query.type,
    search: query.search,
    tag: query.tag,
    sort: query.sort || 'date',
    order: query.order || 'desc',
  }

  const [files, total] = await Promise.all([
    repo.listFiles({ ...params, skip, limit }),
    repo.countFiles(params),
  ])

  return {
    items: files.map(toFileResponse),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getStats() {
  const [countsByTypeRaw, totalFiles, usedBytesRaw] = await Promise.all([
    repo.countByType(),
    repo.countAllFiles(),
    repo.sumSizeBytes(),
  ])

  const usedBytes = Number(usedBytesRaw)
  const quotaGB = env.FILE_STORAGE_QUOTA_GB
  const usedGB = usedBytes / (1024 * 1024 * 1024)
  const usedPercent = quotaGB > 0 ? Math.min(100, Math.round((usedGB / quotaGB) * 100)) : 0
  const remainingGB = Math.max(0, quotaGB - usedGB)

  return {
    countsByType: countsByTypeRaw,
    totalFiles,
    usedBytes,
    usedGB: Math.round(usedGB * 10) / 10,
    remainingGB: Math.round(remainingGB * 10) / 10,
    quotaGB,
    usedPercent,
  }
}

async function uploadFile({ file, folderId, tags }, user) {
  if (!file) throw AppError.badRequest('No file provided')

  const fileType = resolveFileType(file.mimetype)
  if (!fileType) {
    throw AppError.badRequest(`File type "${file.mimetype}" is not allowed`)
  }

  let folder = null
  if (folderId) {
    folder = await repo.findFolderById(folderId)
    if (!folder) throw AppError.notFound('Folder not found')
  }

  const sanitized = sanitizeFilename(file.originalname)
  const storagePath = `${folderId || 'root'}/${crypto.randomUUID()}-${sanitized}`

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    })

  if (uploadError) {
    throw AppError.internal('Failed to upload file to storage')
  }

  const tagList = tags
    ? tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10)
    : []

  try {
    const created = await repo.createFile({
      name: sanitized,
      originalName: file.originalname,
      folderId: folderId || null,
      bucket,
      storagePath,
      mimeType: file.mimetype,
      sizeBytes: BigInt(file.size),
      fileType,
      tags: tagList,
      uploadedBy: user?.id || null,
    })
    return toFileResponse(created)
  } catch {
    // Best-effort cleanup — Supabase upload already succeeded but the DB
    // insert failed. No true two-phase-commit against an external object
    // store, so this is an accepted eventual-consistency compromise.
    await supabase.storage.from(bucket).remove([storagePath]).catch(() => {})
    throw AppError.internal('File uploaded but failed to save metadata — please retry')
  }
}

/**
 * `forceDownload: true` sets Supabase's `download` option, which forces
 * `Content-Disposition: attachment` on the response — the browser downloads
 * the file instead of rendering it, no matter what element requests it
 * (<img>, <embed>, <video>, a new-tab link). Grid thumbnails, click-to-
 * preview, and viewer embeds must all use `forceDownload: false` (inline)
 * or they silently download instead of displaying. Only an explicit "download
 * this file" action should pass true.
 */
async function getDownloadUrl(id, { forceDownload = false } = {}) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')

  const { data, error } = await supabase.storage
    .from(file.bucket)
    .createSignedUrl(
      file.storagePath,
      SIGNED_URL_EXPIRY_SECONDS,
      forceDownload ? { download: file.originalName } : {},
    )

  if (error || !data?.signedUrl) {
    throw AppError.internal('Failed to generate download link')
  }

  return {
    url: data.signedUrl,
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
    expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
  }
}

async function renameFile(id, body) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')

  const updated = await repo.updateFile(id, {
    ...(body.name != null ? { name: sanitizeFilename(body.name) } : {}),
    ...(body.tags != null ? { tags: body.tags } : {}),
  })
  return toFileResponse(updated)
}

async function moveFile(id, folderId) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')

  if (folderId) {
    const folder = await repo.findFolderById(folderId)
    if (!folder) throw AppError.notFound('Folder not found')
  }

  // Only the DB folderId changes — the underlying Supabase object keeps its
  // original storagePath. The DB is the sole source of truth for logical
  // folder membership; the storage key is an opaque, immutable identifier.
  const updated = await repo.updateFile(id, { folderId: folderId || null })
  return toFileResponse(updated)
}

/** Soft-delete — moves the file to Archive. The Supabase object is left
 * alone until a subsequent permanentlyDeleteFile call. */
async function deleteFile(id) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')
  if (file.deletedAt) throw AppError.conflict('File is already archived')

  await repo.archiveFile(id, new Date())
}

async function restoreFile(id) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')
  if (!file.deletedAt) throw AppError.conflict('File is not archived')

  const restored = await repo.restoreFile(id)
  return toFileResponse(restored)
}

/** Real, irreversible deletion — only allowed once a file is already
 * archived, mirroring how the trash works in most file managers. */
async function permanentlyDeleteFile(id) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')
  if (!file.deletedAt) {
    throw AppError.conflict('Archive the file before deleting it permanently')
  }

  const { error } = await supabase.storage.from(file.bucket).remove([file.storagePath])
  if (error) {
    // A leftover Storage blob is a lesser problem than a DB row the UI can
    // no longer resolve — proceed with the DB delete regardless.
    console.warn(`Failed to remove storage object ${file.storagePath}:`, error.message)
  }

  await repo.deleteFile(id)
}

async function listFolders(query = {}) {
  const folders = await repo.listFolders({ parentId: query.folderId || null })
  return folders.map(toFolderResponse)
}

async function createFolder(body, user) {
  if (body.parentId) {
    const parent = await repo.findFolderById(body.parentId)
    if (!parent) throw AppError.notFound('Parent folder not found')
  }

  const existing = await repo.findFolderByName({
    parentId: body.parentId || null,
    name: body.name,
  })
  if (existing) {
    throw AppError.conflict(`A folder named "${body.name}" already exists here`)
  }

  const folder = await repo.createFolder({
    name: body.name,
    parentId: body.parentId || null,
    createdBy: user?.id || null,
  })
  return toFolderResponse(folder)
}

async function renameFolder(id, name) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')

  const clash = await repo.findFolderByName({ parentId: folder.parentId, name })
  if (clash && clash.id !== id) {
    throw AppError.conflict(`A folder named "${name}" already exists here`)
  }

  const updated = await repo.updateFolder(id, { name })
  return toFolderResponse(updated)
}

/** Soft-delete — archives the folder along with every file/subfolder
 * inside it (recursively), all as one unit. */
async function deleteFolder(id) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')
  if (folder.deletedAt) throw AppError.conflict('Folder is already archived')

  await repo.archiveFolderTree(id, new Date())
}

async function restoreFolder(id) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')
  if (!folder.deletedAt) throw AppError.conflict('Folder is not archived')

  await repo.restoreFolderTree(id)
  const restored = await repo.findFolderById(id)
  return toFolderResponse(restored)
}

/** Real, irreversible deletion — only allowed once a folder is already
 * archived and has no remaining children (its files/subfolders must be
 * permanently deleted first, or the whole tree was archived together and
 * should be purged file-by-file/folder-by-folder from Archive). */
async function permanentlyDeleteFolder(id) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')
  if (!folder.deletedAt) {
    throw AppError.conflict('Archive the folder before deleting it permanently')
  }

  const childCount = await repo.countAllFolderChildren(id)
  if (childCount > 0) {
    throw AppError.conflict('Folder is not empty — delete its contents first')
  }

  await repo.deleteFolder(id)
}

async function getFolderBreadcrumb(id) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')
  return repo.listFolderBreadcrumb(id)
}

/** Flat list of everything currently archived — files and folders together,
 * most-recently-archived first. */
async function listArchived() {
  const { files, folders } = await repo.listArchived()
  const items = [
    ...folders.map((folder) => ({ ...toFolderResponse(folder), itemType: 'folder' })),
    ...files.map((file) => ({ ...toFileResponse(file), itemType: 'file' })),
  ]
  items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))
  return items
}

module.exports = {
  listFiles,
  getStats,
  uploadFile,
  getDownloadUrl,
  renameFile,
  moveFile,
  deleteFile,
  restoreFile,
  permanentlyDeleteFile,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  restoreFolder,
  permanentlyDeleteFolder,
  getFolderBreadcrumb,
  listArchived,
}
