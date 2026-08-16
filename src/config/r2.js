const { S3Client } = require('@aws-sdk/client-s3')
const env = require('./env')

// Lazily constructed — R2_* is optional at the env-schema level (many
// modules never touch Storage), so building the client eagerly at
// require-time would crash the whole app on boot for anyone who hasn't
// configured R2 yet. Only throws once a caller actually tries to use R2.
let client = null

function getR2() {
  if (client) return client

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'Cloudflare R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'and R2_SECRET_ACCESS_KEY in .env',
    )
  }

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
  return client
}

const r2 = new Proxy(
  {},
  {
    get(_target, prop) {
      return getR2()[prop]
    },
  },
)

module.exports = r2
