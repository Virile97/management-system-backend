const env = require('../../config/env')
const { sendMail } = require('../../shared/utils/mailer')

const ROLE_LABELS = Object.freeze({
  ADMIN: 'Admin',
  FINANCE_ADMIN: 'Finance Admin',
  USER: 'User',
})

function roleLabel(role) {
  return ROLE_LABELS[role] || role
}

function buildSetPasswordUrl(rawToken) {
  const base = env.FRONTEND_URL.replace(/\/$/, '')
  return `${base}/set-password?token=${encodeURIComponent(rawToken)}`
}

/**
 * Notify a newly created user and send a one-time set-password link.
 * @param {{
 *   name: string|null,
 *   email: string,
 *   role: string,
 *   setupToken: string,
 *   expiresAt: Date
 * }} user
 */
async function sendAccountCreatedEmail(user) {
  const label = roleLabel(user.role)
  const displayName = user.name || user.email
  const appName = env.APP_NAME
  const setPasswordUrl = buildSetPasswordUrl(user.setupToken)
  const expiresAtLabel = user.expiresAt.toUTCString()

  const subject = `Your ${appName} account has been added as ${label}`

  const text = [
    `Hi ${displayName},`,
    '',
    `An account has been created for you on ${appName}.`,
    `You have been added as: ${label}.`,
    '',
    'Create your password using this secure link:',
    setPasswordUrl,
    '',
    `This link expires on ${expiresAtLabel} and can only be used once.`,
    'If you did not expect this email, you can ignore it.',
    '',
    `— ${appName}`,
  ].join('\n')

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
      <p>Hi ${escapeHtml(displayName)},</p>
      <p>An account has been created for you on <strong>${escapeHtml(appName)}</strong>.</p>
      <p>You have been added as: <strong>${escapeHtml(label)}</strong>.</p>
      <p>
        <a href="${escapeHtml(setPasswordUrl)}">Create your password</a>
      </p>
      <p style="color: #555; font-size: 14px;">
        This link expires on <strong>${escapeHtml(expiresAtLabel)}</strong> and can only be used once.
      </p>
      <p style="color: #555; font-size: 14px;">
        If you did not expect this email, you can ignore it.
      </p>
      <p>— ${escapeHtml(appName)}</p>
    </div>
  `.trim()

  return sendMail({ to: user.email, subject, text, html })
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

module.exports = { sendAccountCreatedEmail, roleLabel, buildSetPasswordUrl }
