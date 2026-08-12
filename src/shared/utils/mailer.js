const { Resend } = require("resend")
const env = require("../../config/env")
const logger = require("../../config/logger")

let resendClient

const isMailConfigured = () =>
  Boolean(env.RESEND_API_KEY && env.RESEND_FROM)

function getResendClient() {
  if (!isMailConfigured()) return null
  return (resendClient ||= new Resend(env.RESEND_API_KEY))
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} options
 */
async function sendMail({ to, subject, text, html }) {
  const client = getResendClient()

  if (!client) {
    logger.warn(
      { to, subject, text },
      "Resend is not configured — email was not sent (logged for development)"
    )
    return { queued: false, logged: true }
  }

  const { data, error } = await client.emails.send({
    from: env.RESEND_FROM,
    to: [to],
    subject,
    text,
    html: html || text,
  })

  if (error) {
    logger.error({ err: error, to, subject }, "Resend failed to send email")
    throw new Error(error.message || "Failed to send email via Resend")
  }

  return {
    queued: true,
    logged: false,
    id: data?.id || null,
  }
}

module.exports = { sendMail, isMailConfigured }