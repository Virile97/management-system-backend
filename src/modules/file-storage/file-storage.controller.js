const fileStorageService = require('./file-storage.service')
const { asyncHandler, ApiResponse } = require('../../shared/utils')

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
  const data = await fileStorageService.getDownloadUrl(req.params.id)
  return ApiResponse.success(res, data, 'Download link generated')
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

const getFolderBreadcrumb = asyncHandler(async (req, res) => {
  const data = await fileStorageService.getFolderBreadcrumb(req.params.id)
  return ApiResponse.success(res, data, 'Breadcrumb retrieved')
})

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
