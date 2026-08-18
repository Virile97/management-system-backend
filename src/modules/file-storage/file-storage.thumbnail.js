const os = require('os')
const path = require('path')
const fs = require('fs/promises')
const sharp = require('sharp')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegPath = require('ffmpeg-static')
const { FILE_TYPES } = require('./file-storage.constants')

ffmpeg.setFfmpegPath(ffmpegPath)

const THUMBNAIL_MAX_DIMENSION = 480
const THUMBNAIL_CONTENT_TYPE = 'image/webp'

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

async function generatePdfThumbnail(buffer) {
  const { pdf } = await import('pdf-to-img')
  const document = await pdf(buffer, { scale: 1.5 })
  const pageBuffer = await document.getPage(1)

  return resizeToThumbnail(pageBuffer)
}

async function generateThumbnailBuffer(fileType, buffer) {
  const generators = {
    [FILE_TYPES.IMAGE]: generateImageThumbnail,
    [FILE_TYPES.VIDEO]: generateVideoThumbnail,
    [FILE_TYPES.PDF]: generatePdfThumbnail,
  }

  return generators[fileType]?.(buffer) ?? null
}

module.exports = {
  isGeneratable,
  generateThumbnailBuffer,
  THUMBNAIL_CONTENT_TYPE,
}
