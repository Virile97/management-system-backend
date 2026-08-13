const { PrismaClient } = require('@prisma/client')
const env = require('./env')
const logger = require('./logger')

const slowQueryMs = env.SLOW_QUERY_MS

const prisma = new PrismaClient({
  log:
    slowQueryMs > 0
      ? [
          { emit: 'event', level: 'query' },
          { emit: 'stdout', level: 'warn' },
          { emit: 'stdout', level: 'error' },
        ]
      : env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
})

if (slowQueryMs > 0) {
  prisma.$on('query', (event) => {
    if (event.duration < slowQueryMs) return

    logger.warn(
      {
        durationMs: event.duration,
        target: event.target,
        query: event.query,
        params: event.params,
      },
      'Slow query detected',
    )
  })
}

module.exports = prisma
