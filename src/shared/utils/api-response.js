class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200, meta = undefined) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      ...(meta ? { meta } : {}),
    })
  }

  static created(res, data = null, message = 'Created') {
    return ApiResponse.success(res, data, message, 201)
  }

  static noContent(res) {
    return res.status(204).send()
  }

  static error(
    res,
    message = 'Something went wrong',
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details = undefined,
  ) {
    return res.status(statusCode).json({
      success: false,
      message,
      code,
      ...(details ? { details } : {}),
    })
  }
}

module.exports = ApiResponse
