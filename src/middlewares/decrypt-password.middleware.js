const { AppError } = require('../shared/errors')
const { decryptWithPrivateKey } = require('../shared/utils/rsa-keys')

function decryptPassword(req, res, next) {
  if (typeof req.body?.password !== 'string') {
    return next(AppError.badRequest('Encrypted password is required'))
  }

  try {
    req.body.password = decryptWithPrivateKey(req.body.password)
  } catch (_err) {
    return next(AppError.badRequest('Unable to decrypt password'))
  }

  next()
}

module.exports = decryptPassword
