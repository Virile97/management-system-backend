const pino = require('pino')
const env = require('./env')

const isProduction = env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
})

module.exports = logger
