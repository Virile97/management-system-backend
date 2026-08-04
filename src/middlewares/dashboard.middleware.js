const { AppError } = require('../shared/errors')
const env = require('../config/env')

function requireApiKey(req, res, next) {
  const apiKey = req.get('Lbbc-Api-Key') || ''
  const validApiKey = apiKey && apiKey === env.LBBC_API_KEY

  if (!validApiKey) {
    return next(AppError.unauthorized('Invalid or missing API key'))
  }

  next()
}

module.exports = { requireApiKey }
