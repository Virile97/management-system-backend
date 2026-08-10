const env = require('../../config/env')

const COOKIE_NAME = 'refreshToken'

const baseCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' || env.NODE_ENV === 'staging',
  sameSite: 'lax',
  path: '/api/v1/auth',
}

function setRefreshTokenCookie(res, rawToken) {
  res.cookie(COOKIE_NAME, rawToken, {
    ...baseCookieOptions,
    maxAge: env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
  })
}

function clearRefreshTokenCookie(res) {
  res.clearCookie(COOKIE_NAME, baseCookieOptions)
}

module.exports = { COOKIE_NAME, setRefreshTokenCookie, clearRefreshTokenCookie }
