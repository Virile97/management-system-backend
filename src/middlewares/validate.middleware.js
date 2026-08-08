const { AppError } = require('../shared/errors')

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  })

  if (!result.success) {
    const details = result.error.flatten().fieldErrors
    return next(AppError.validation('Validation failed', details))
  }

  if (result.data.body) req.body = result.data.body
  if (result.data.params) req.params = result.data.params
  if (result.data.query) Object.assign(req.query, result.data.query)

  next()
}

module.exports = validate
