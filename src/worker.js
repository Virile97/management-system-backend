/**
 * Standalone background-worker process — runs BullMQ job processors
 * (currently just file-storage thumbnail generation) outside the HTTP
 * request path. Deliberately separate from server.js so it can be scaled,
 * deployed, and resource-limited independently of the API: thumbnail work
 * (ffmpeg, sharp, pdf-to-img) is CPU-heavy and shouldn't compete with
 * request handling on the same instance, or scale 1:1 with API replicas.
 *
 * Run with `npm run worker`. Safe to run multiple instances of this
 * process concurrently — BullMQ coordinates job distribution through Redis,
 * so replicas share the queue rather than duplicating work.
 */
const env = require('./config/env')
const logger = require('./config/logger')
const prisma = require('./config/prisma')
const { startThumbnailWorker } = require('./modules/file-storage/file-storage.queue')

if (!env.REDIS_URL) {
  logger.error('REDIS_URL is not set — the worker has nothing to connect to.')
  process.exit(1)
}

const thumbnailWorker = startThumbnailWorker()
logger.info('Thumbnail worker started')

async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down worker gracefully...`)
  await thumbnailWorker.close()
  await prisma.$disconnect()
  logger.info('Worker shutdown complete.')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection in worker')
})
