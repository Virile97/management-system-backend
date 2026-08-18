const crypto = require('crypto')
const { Queue, Worker } = require('bullmq')
const { getRedis } = require('../../config/redis')
const env = require('../../config/env')
const logger = require('../../config/logger')
const r2Storage = require('./file-storage.r2')
const repo = require('./file-storage.repository')
const { isGeneratable, generateThumbnailBuffer, THUMBNAIL_CONTENT_TYPE } = require('./file-storage.thumbnail')
const { emitThumbnailStatus } = require('./file-storage.events')

const QUEUE_NAME = 'thumbnail-generation'

let queue = null

function getQueue() {
  if (queue) return queue
  queue = new Queue(QUEUE_NAME, { connection: getRedis() })
  return queue
}

async function queueThumbnailGeneration(file) {
  if (!isGeneratable(file.fileType)) return

  await getQueue().add(
    'generate',
    {
      fileId: file.id,
      bucket: file.bucket,
      storagePath: file.storagePath,
      fileType: file.fileType,
    },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 1000 },
    }
  )

  await repo.updateFile(file.id, { thumbnailStatus: 'PENDING' })
  emitThumbnailStatus(file.id, 'PENDING')
}

async function processThumbnailJob(job) {
  const { fileId, bucket, storagePath, fileType } = job.data

  const originalBuffer = await r2Storage.downloadObject(bucket, storagePath)
  const thumbnailBuffer = await generateThumbnailBuffer(fileType, originalBuffer)

  if (!thumbnailBuffer) {
    throw new Error('No thumbnail generator for this file type')
  }

  const thumbnailPath = `${storagePath}-thumb-${crypto.randomUUID()}.webp`

  await r2Storage.uploadObject(
    bucket,
    thumbnailPath,
    thumbnailBuffer,
    THUMBNAIL_CONTENT_TYPE
  )

  await repo.updateFile(fileId, {
    thumbnailPath,
    thumbnailStatus: 'READY',
  })

  emitThumbnailStatus(fileId, 'READY')
}

function startThumbnailWorker() {
  const worker = new Worker(QUEUE_NAME, processThumbnailJob, {
    connection: getRedis(),
    concurrency: env.THUMBNAIL_WORKER_CONCURRENCY,
  })

  worker.on('failed', async (job, err) => {
    const fileId = job?.data?.fileId

    logger.error(
      { err, fileId, attempt: job?.attemptsMade },
      'Thumbnail job failed'
    )

    if (!job || job.attemptsMade < job.opts.attempts) return

    await repo
      .updateFile(fileId, { thumbnailStatus: 'FAILED' })
      .catch(() => {})

    emitThumbnailStatus(fileId, 'FAILED')
  })

  return worker
}

module.exports = { queueThumbnailGeneration, startThumbnailWorker }
