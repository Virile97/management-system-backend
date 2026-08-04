const { AppError, ErrorCodes } = require('../shared/errors')
const ApiResponse = require('../shared/utils/api-response')
const logger = require('../config/logger')
const env = require('../config/env')

function notFoundHandler(req, res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`))
}

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) {
    logger.warn({ err }, err.message)
    return ApiResponse.error(res, err.message, err.statusCode, err.code, err.details)
  }

  logger.error({ err }, 'Unhandled error')

  const message =
    env.NODE_ENV === 'production' || env.NODE_ENV === 'staging'
      ? 'Something went wrong'
      : err.message
  return ApiResponse.error(res, message, 500, ErrorCodes.INTERNAL_ERROR)
}

module.exports = { notFoundHandler, errorHandler }
