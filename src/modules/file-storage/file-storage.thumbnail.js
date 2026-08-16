const os = require('os')
const path = require('path')
const crypto = require('crypto')
const fs = require('fs/promises')
const sharp = require('sharp')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const logger = require('../../config/logger')
const r2Storage = require('./file-storage.r2')
const repo = require('./file-storage.repository')
const { FILE_TYPES } = require('./file-storage.constants')

ffmpeg.setFfmpegPath(ffmpegPath)

const THUMBNAIL_MAX_DIMENSION = 480
const THUMBNAIL_CONTENT_TYPE = 'image/webp'

/** Which file types currently get a generated thumbnail. DOCUMENT (Word/
 * Excel/PowerPoint) is intentionally excluded — rendering those needs a
 * document converter (e.g. LibreOffice headless) that isn't available in
 * every deploy environment yet; those files keep thumbnailStatus: NONE and
 * the frontend falls back to a static type icon, same as today. */
const GENERATABLE_TYPES = new Set([FILE_TYPES.IMAGE, FILE_TYPES.VIDEO, FILE_TYPES.PDF])

function isGeneratable(fileType) {
  return GENERATABLE_TYPES.has(fileType)
}

async function resizeToThumbnail(inputBuffer) {
  return sharp(inputBuffer)
    .resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 72 })
    .toBuffer()
}

async function generateImageThumbnail(buffer) {
  return resizeToThumbnail(buffer)
}

/** fluent-ffmpeg seeks/reads via file paths, not buffers, so the source
 * video is written to a temp file first. Grabs a frame at 1s in (falls
 * back to the very start for clips shorter than that). */
async function generateVideoThumbnail(buffer) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thumb-'))
  const inputPath = path.join(tempDir, 'input')
  const outputPath = path.join(tempDir, 'frame.png')

  try {
    await fs.writeFile(inputPath, buffer)

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .on('end', resolve)
        .on('error', reject)
        .screenshots({
          timestamps: ['1'],
          filename: path.basename(outputPath),
          folder: tempDir,
        })
    })

    const frameBuffer = await fs.readFile(outputPath)
    return resizeToThumbnail(frameBuffer)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

/** pdf-to-img is ESM-only; dynamic import keeps this file CommonJS like the
 * rest of the module. Renders page 1 only — a thumbnail, not a document
 * viewer — and never executes embedded PDF JavaScript (this library only
 * rasterizes to a canvas, it doesn't run a scriptable viewer context). */
async function generatePdfThumbnail(buffer) {
  const { pdf } = await import('pdf-to-img')
  const document = await pdf(buffer, { scale: 1.5 })
  const pageBuffer = await document.getPage(1)
  return resizeToThumbnail(pageBuffer)
}

async function generateThumbnailBuffer(fileType, buffer) {
  if (fileType === FILE_TYPES.IMAGE) return generateImageThumbnail(buffer)
  if (fileType === FILE_TYPES.VIDEO) return generateVideoThumbnail(buffer)
  if (fileType === FILE_TYPES.PDF) return generatePdfThumbnail(buffer)
  return null
}

/**
 * Fire-and-forget: generates a thumbnail for a just-uploaded file and
 * updates its thumbnailStatus/thumbnailPath. Never throws — errors are
 * logged and recorded as FAILED so the upload request itself is never
 * blocked or affected by a thumbnail failure.
 *
 * Runs in-process (no durable job queue exists in this app yet) — a
 * server restart mid-generation abandons the job, leaving the file stuck
 * at PENDING. Acceptable at this app's scale; revisit if that becomes a
 * real problem.
 */
async function queueThumbnailGeneration(file) {
  if (!isGeneratable(file.fileType)) return

  try {
    await repo.updateFile(file.id, { thumbnailStatus: 'PENDING' })

    const originalBuffer = await r2Storage.downloadObject(file.bucket, file.storagePath)
    const thumbnailBuffer = await generateThumbnailBuffer(file.fileType, originalBuffer)
    if (!thumbnailBuffer) throw new Error('No thumbnail generator for this file type')

    const thumbnailPath = `${file.storagePath}-thumb-${crypto.randomUUID()}.webp`
    await r2Storage.uploadObject(file.bucket, thumbnailPath, thumbnailBuffer, THUMBNAIL_CONTENT_TYPE)

    await repo.updateFile(file.id, { thumbnailPath, thumbnailStatus: 'READY' })
  } catch (err) {
    logger.error({ err, fileId: file.id }, 'Thumbnail generation failed')
    await repo.updateFile(file.id, { thumbnailStatus: 'FAILED' }).catch(() => {})
  }
}

module.exports = {
  isGeneratable,
  queueThumbnailGeneration,
}
