const crypto = require('crypto')
const prisma = require('../../config/prisma')
const env = require('../../config/env')

const TOKEN_BYTES = 32

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function expiryDate() {
  const hours = env.PASSWORD_SETUP_TOKEN_EXPIRES_IN_HOURS
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

/**
 * Issues a one-time password-setup token for the user.
 * Invalidates any unused prior tokens for that user.
 * @returns {Promise<{ rawToken: string, expiresAt: Date }>}
 */
async function issuePasswordSetupToken(userId) {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  const expiresAt = expiryDate()

  await prisma.$transaction([
    prisma.passwordSetupToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordSetupToken.create({
      data: {
        tokenHash: hashToken(rawToken),
        userId,
        expiresAt,
      },
    }),
  ])

  return { rawToken, expiresAt }
}

/**
 * @returns {Promise<null|{ id: string, userId: string, expiresAt: Date, user: object }>}
 */
async function findValidPasswordSetupToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null

  const record = await prisma.passwordSetupToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          password: true,
        },
      },
    },
  })

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return null
  }

  return record
}

async function markPasswordSetupTokenUsed(tokenId) {
  await prisma.passwordSetupToken.update({
    where: { id: tokenId },
    data: { usedAt: new Date() },
  })
}

module.exports = {
  issuePasswordSetupToken,
  findValidPasswordSetupToken,
  markPasswordSetupTokenUsed,
  hashToken,
}
