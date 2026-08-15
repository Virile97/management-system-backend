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

  return {
    countsByType: countsByTypeRaw,
    totalFiles,
    usedBytes,
    usedGB: Math.round(usedGB * 10) / 10,
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

async function getDownloadUrl(id) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')

  const { data, error } = await supabase.storage
    .from(file.bucket)
    .createSignedUrl(file.storagePath, SIGNED_URL_EXPIRY_SECONDS, {
      download: file.originalName,
    })

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

async function deleteFile(id) {
  const file = await repo.findFileById(id)
  if (!file) throw AppError.notFound('File not found')

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

async function deleteFolder(id) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')

  const childCount = await repo.countFolderChildren(id)
  if (childCount > 0) {
    throw AppError.conflict('Folder is not empty — move or delete its contents first')
  }

  await repo.deleteFolder(id)
}

async function getFolderBreadcrumb(id) {
  const folder = await repo.findFolderById(id)
  if (!folder) throw AppError.notFound('Folder not found')
  return repo.listFolderBreadcrumb(id)
}

module.exports = {
  listFiles,
  getStats,
  uploadFile,
  getDownloadUrl,
  renameFile,
  moveFile,
  deleteFile,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  getFolderBreadcrumb,
}
