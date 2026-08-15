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
  moveFileSchema,
} = require('./file-storage.validation')

const router = Router()

router.use(authenticate)

router.get('/stats', controller.getStats)
router.get('/folders', validate(listFoldersSchema), controller.listFolders)
router.get(
  '/folders/:id/breadcrumb',
  validate(idParamSchema),
  controller.getFolderBreadcrumb,
)
router.get('/', validate(listFilesSchema), controller.listFiles)
router.get('/:id/download', validate(idParamSchema), controller.getDownloadUrl)

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

module.exports = router
