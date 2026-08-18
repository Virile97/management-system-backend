const app = require('./app')
const env = require('./config/env')
const logger = require('./config/logger')
const prisma = require('./config/prisma')

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`)
})

if (!env.REDIS_URL) {
  logger.warn(
    'REDIS_URL not set — thumbnail generation is disabled. Uploads still ' +
      'succeed but thumbnailStatus stays NONE until Redis is configured and ' +
      '`npm run worker` is running (see src/worker.js).',
  )
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(
      { port: env.PORT },
      `Port ${env.PORT} is already in use. Stop the other process, then restart.`,
    )
  } else {
    logger.error({ err }, 'Server failed to start')
  }
  process.exit(1)
})

async function shutdown(signal) {
  logger.info(`${signal} received. Shutting down gracefully...`)
  server.close(async () => {
    await prisma.$disconnect()
    logger.info('Shutdown complete.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection')
})
