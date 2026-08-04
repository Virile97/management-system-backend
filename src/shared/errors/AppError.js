const ErrorCodes = require('./ErrorCodes')

class AppError extends Error {
  constructor(message, statusCode = 500, code = ErrorCodes.INTERNAL_ERROR, details = undefined) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }

  static badRequest(message, details) {
    return new AppError(message, 400, ErrorCodes.BAD_REQUEST, details)
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError(message, 401, ErrorCodes.UNAUTHORIZED)
  }

  static forbidden(message = 'Forbidden') {
    return new AppError(message, 403, ErrorCodes.FORBIDDEN)
  }

  static notFound(message = 'Resource not found') {
    return new AppError(message, 404, ErrorCodes.NOT_FOUND)
  }

  static conflict(message, details) {
    return new AppError(message, 409, ErrorCodes.CONFLICT, details)
  }

  static validation(message, details) {
    return new AppError(message, 422, ErrorCodes.VALIDATION_ERROR, details)
  }

  static internal(message = 'Internal server error') {
    return new AppError(message, 500, ErrorCodes.INTERNAL_ERROR)
  }
}

module.exports = AppError
