const { Router } = require('express')
const controller = require('./file-storage.controller')
const validate = require('../../middlewares/validate.middleware')
const { authenticate, authorize } = require('../../middlewares/auth.middleware')
const { uploadSingle } = require('../../middlewares/upload.middleware')
const { ROLES } = require('../../config/constants')
const {
  listFilesSchema,
  uploadFileSchema,
  listFoldersSchema,
  createFolderSchema,
  renameFolderSchema,
  renameFileSchema,
  idParamSchema,
  downloadUrlSchema,
  moveFileSchema,
} = require('./file-storage.validation')

const router = Router()

router.use(authenticate)

router.get('/stats', controller.getStats)
router.get('/archive', controller.listArchived)
router.get('/folders', validate(listFoldersSchema), controller.listFolders)
router.get(
  '/folders/:id/breadcrumb',
  validate(idParamSchema),
  controller.getFolderBreadcrumb,
)
router.get('/', validate(listFilesSchema), controller.listFiles)
router.get('/:id/download', validate(downloadUrlSchema), controller.getDownloadUrl)
router.get('/:id/thumbnail', validate(idParamSchema), controller.getThumbnailUrl)

router.post(
  '/folders',
  authorize(ROLES.ADMIN),
  validate(createFolderSchema),
  controller.createFolder,
)
router.patch(
  '/folders/:id',
  authorize(ROLES.ADMIN),
  validate(renameFolderSchema),
  controller.renameFolder,
)
router.delete(
  '/folders/:id',
  authorize(ROLES.ADMIN),
  validate(idParamSchema),
  controller.deleteFolder,
)
router.post(
  '/folders/:id/restore',
  authorize(ROLES.ADMIN),
  validate(idParamSchema),
  controller.restoreFolder,
)
router.delete(
  '/folders/:id/permanent',
  authorize(ROLES.ADMIN),
  validate(idParamSchema),
  controller.permanentlyDeleteFolder,
)

router.post(
  '/upload',
  authorize(ROLES.ADMIN),
  uploadSingle('file'),
  validate(uploadFileSchema),
  controller.uploadFile,
)
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(renameFileSchema),
  controller.renameFile,
)
router.patch(
  '/:id/move',
  authorize(ROLES.ADMIN),
  validate(moveFileSchema),
  controller.moveFile,
)
router.delete(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(idParamSchema),
  controller.deleteFile,
)
router.post(
  '/:id/restore',
  authorize(ROLES.ADMIN),
  validate(idParamSchema),
  controller.restoreFile,
)
router.delete(
  '/:id/permanent',
  authorize(ROLES.ADMIN),
  validate(idParamSchema),
  controller.permanentlyDeleteFile,
)

module.exports = router
