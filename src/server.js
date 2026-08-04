const app = require('./app')
const env = require('./config/env')
const logger = require('./config/logger')
const prisma = require('./config/prisma')

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`)
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
  process.exit(1)
})
