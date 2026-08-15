const { StorageFileType } = require('@prisma/client')

const FILE_TYPES = Object.freeze({
  VIDEO: StorageFileType.VIDEO,
  AUDIO: StorageFileType.AUDIO,
  PDF: StorageFileType.PDF,
  IMAGE: StorageFileType.IMAGE,
  DOCUMENT: StorageFileType.DOCUMENT,
  OTHER: StorageFileType.OTHER,
})

const FILE_TYPE_VALUES = Object.freeze(Object.values(FILE_TYPES))

/** mimetype -> FILE_TYPES bucket. Doubles as the upload allow-list — any
 * mimetype not present here is rejected at the multer fileFilter stage. */
const MIME_TYPE_MAP = Object.freeze({
  'video/mp4': FILE_TYPES.VIDEO,
  'video/quicktime': FILE_TYPES.VIDEO,
  'video/webm': FILE_TYPES.VIDEO,
  'video/x-msvideo': FILE_TYPES.VIDEO,
  'video/x-matroska': FILE_TYPES.VIDEO,

  'audio/mpeg': FILE_TYPES.AUDIO,
  'audio/mp3': FILE_TYPES.AUDIO,
  'audio/wav': FILE_TYPES.AUDIO,
  'audio/x-wav': FILE_TYPES.AUDIO,
  'audio/mp4': FILE_TYPES.AUDIO,
  'audio/x-m4a': FILE_TYPES.AUDIO,
  'audio/ogg': FILE_TYPES.AUDIO,

  'image/jpeg': FILE_TYPES.IMAGE,
  'image/png': FILE_TYPES.IMAGE,
  'image/gif': FILE_TYPES.IMAGE,
  'image/webp': FILE_TYPES.IMAGE,
  'image/svg+xml': FILE_TYPES.IMAGE,

  'application/pdf': FILE_TYPES.PDF,

  'application/msword': FILE_TYPES.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    FILE_TYPES.DOCUMENT,
  'application/vnd.ms-excel': FILE_TYPES.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    FILE_TYPES.DOCUMENT,
  'application/vnd.ms-powerpoint': FILE_TYPES.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation':
    FILE_TYPES.DOCUMENT,
  'text/csv': FILE_TYPES.DOCUMENT,
  'text/plain': FILE_TYPES.DOCUMENT,

  'application/zip': FILE_TYPES.OTHER,
  'application/x-zip-compressed': FILE_TYPES.OTHER,
})

const ALLOWED_MIME_TYPES = Object.freeze(Object.keys(MIME_TYPE_MAP))

function resolveFileType(mimeType) {
  return MIME_TYPE_MAP[mimeType] || null
}

/** Signed URL lifetime for on-demand download/view links. */
const SIGNED_URL_EXPIRY_SECONDS = 600

module.exports = {
  FILE_TYPES,
  FILE_TYPE_VALUES,
  MIME_TYPE_MAP,
  ALLOWED_MIME_TYPES,
  resolveFileType,
  SIGNED_URL_EXPIRY_SECONDS,
}
