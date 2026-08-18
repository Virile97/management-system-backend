const fileStorageService = require('./file-storage.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')
const { verifyToken } = require('../../shared/utils/jwt')
const prisma = require('../../config/prisma')
const repo = require('./file-storage.repository')
const { onThumbnailStatus } = require('./file-storage.events')
const { AppError } = require('../../shared/errors')

const listFiles = asyncHandler(async (req, res) => {
  const { items, meta } = await fileStorageService.listFiles(req.query)
  return ApiResponse.success(res, items, 'Files retrieved', 200, meta)
})

const getStats = asyncHandler(async (req, res) => {
  const data = await fileStorageService.getStats()
  return ApiResponse.success(res, data, 'Storage stats retrieved')
})

const uploadFile = asyncHandler(async (req, res) => {
  const data = await fileStorageService.uploadFile(
    { file: req.file, folderId: req.body.folderId, tags: req.body.tags },
    req.user,
  )

  return ApiResponse.created(res, data, 'File uploaded')
})

const getDownloadUrl = asyncHandler(async (req, res) => {
  const forceDownload = req.query.download === 'true'
  const data = await fileStorageService.getDownloadUrl(req.params.id, { forceDownload })

  return ApiResponse.success(res, data, 'Download link generated')
})

const getThumbnailUrl = asyncHandler(async (req, res) => {
  const data = await fileStorageService.getThumbnailUrl(req.params.id)
  return ApiResponse.success(res, data, 'Thumbnail link generated')
})

const renameFile = asyncHandler(async (req, res) => {
  const data = await fileStorageService.renameFile(req.params.id, req.body)
  return ApiResponse.success(res, data, 'File updated')
})

const moveFile = asyncHandler(async (req, res) => {
  const data = await fileStorageService.moveFile(req.params.id, req.body.folderId)
  return ApiResponse.success(res, data, 'File moved')
})

const deleteFile = asyncHandler(async (req, res) => {
  await fileStorageService.deleteFile(req.params.id)
  return ApiResponse.noContent(res)
})

const restoreFile = asyncHandler(async (req, res) => {
  const data = await fileStorageService.restoreFile(req.params.id)
  return ApiResponse.success(res, data, 'File restored')
})

const permanentlyDeleteFile = asyncHandler(async (req, res) => {
  await fileStorageService.permanentlyDeleteFile(req.params.id)
  return ApiResponse.noContent(res)
})

const listFolders = asyncHandler(async (req, res) => {
  const data = await fileStorageService.listFolders(req.query)
  return ApiResponse.success(res, data, 'Folders retrieved')
})

const createFolder = asyncHandler(async (req, res) => {
  const data = await fileStorageService.createFolder(req.body, req.user)
  return ApiResponse.created(res, data, 'Folder created')
})

const renameFolder = asyncHandler(async (req, res) => {
  const data = await fileStorageService.renameFolder(req.params.id, req.body.name)
  return ApiResponse.success(res, data, 'Folder renamed')
})

const deleteFolder = asyncHandler(async (req, res) => {
  await fileStorageService.deleteFolder(req.params.id)
  return ApiResponse.noContent(res)
})

const restoreFolder = asyncHandler(async (req, res) => {
  const data = await fileStorageService.restoreFolder(req.params.id)
  return ApiResponse.success(res, data, 'Folder restored')
})

const permanentlyDeleteFolder = asyncHandler(async (req, res) => {
  await fileStorageService.permanentlyDeleteFolder(req.params.id)
  return ApiResponse.noContent(res)
})

const getFolderBreadcrumb = asyncHandler(async (req, res) => {
  const data = await fileStorageService.getFolderBreadcrumb(req.params.id)
  return ApiResponse.success(res, data, 'Breadcrumb retrieved')
})

const listArchived = asyncHandler(async (req, res) => {
  const data = await fileStorageService.listArchived()
  return ApiResponse.success(res, data, 'Archived items retrieved')
})

const streamThumbnailStatus = asyncHandler(async (req, res) => {
  const { token } = req.query
  if (!token) throw AppError.unauthorized('Missing token')

  let payload
  try {
    payload = verifyToken(token)
  } catch {
    throw AppError.unauthorized('Invalid or expired token')
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } })
  if (!user) throw AppError.unauthorized('User no longer exists')

  const file = await repo.findFileById(req.params.id)
  if (!file) throw AppError.notFound('File not found')

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  const send = (status) => {
    res.write(`event: thumbnail-status\ndata: ${JSON.stringify({ fileId: file.id, status })}\n\n`)
  }

  send(file.thumbnailStatus)
  if (file.thumbnailStatus === 'READY' || file.thumbnailStatus === 'FAILED') {
    return res.end()
  }

  const unsubscribe = onThumbnailStatus(file.id, (status) => {
    send(status)
    if (status === 'READY' || status === 'FAILED') res.end()
  })

  const heartbeat = setInterval(() => res.write(':heartbeat\n\n'), 25_000)

  req.on('close', () => {
    clearInterval(heartbeat)
    unsubscribe()
  })
})

module.exports = {
  listFiles,
  getStats,
  uploadFile,
  getDownloadUrl,
  getThumbnailUrl,
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
  streamThumbnailStatus,
}
