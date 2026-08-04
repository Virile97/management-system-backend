const pinoHttp = require('pino-http')
const logger = require('../config/logger')

const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error'
    if (res.statusCode >= 400) return 'warn'
    return 'info'
  },
})

module.exports = requestLogger
