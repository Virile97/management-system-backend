const crypto = require('crypto')
const prisma = require('../../config/prisma')
const env = require('../../config/env')

const REFRESH_TOKEN_BYTES = 48

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function expiryDate() {
  const days = env.REFRESH_TOKEN_EXPIRES_IN_DAYS
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

async function issueRefreshToken(userId) {
  const rawToken = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('hex')

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(rawToken),
      userId,
      expiresAt: expiryDate(),
    },
  })

  return rawToken
}

// Returns the valid, unexpired, unrevoked token row for a raw token, or null.
async function findValidToken(rawToken) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  })

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    return null
  }

  return record
}

async function revokeToken(tokenId, replacedById) {
  await prisma.refreshToken.update({
    where: { id: tokenId },
    data: { revokedAt: new Date(), ...(replacedById ? { replacedBy: replacedById } : {}) },
  })
}

async function revokeAllForUser(userId) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

module.exports = {
  issueRefreshToken,
  findValidToken,
  revokeToken,
  revokeAllForUser,
  hashToken,
}
