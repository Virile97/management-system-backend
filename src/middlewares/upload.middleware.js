const multer = require('multer')
const env = require('../config/env')
const { AppError } = require('../shared/errors')
const { ALLOWED_MIME_TYPES } = require('../modules/file-storage/file-storage.constants')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FILE_STORAGE_MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(AppError.badRequest(`File type "${file.mimetype}" is not allowed`))
    }
    cb(null, true)
  },
})

/** Wraps multer's callback-style middleware so its errors (MulterError, or
 * the AppError thrown from fileFilter above) reach Express's error handler
 * the same way every other AppError does. error.middleware.js only
 * special-cases `instanceof AppError` — an unwrapped MulterError would
 * otherwise fall through to a generic 500, hiding messages like "file too
 * large" or "bad file type" from the user. */
function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (!err) return next()

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            AppError.badRequest(
              `File exceeds the ${env.FILE_STORAGE_MAX_UPLOAD_MB}MB limit`,
            ),
          )
        }
        return next(AppError.badRequest(err.message))
      }

      return next(err)
    })
  }
}

module.exports = { uploadSingle }
