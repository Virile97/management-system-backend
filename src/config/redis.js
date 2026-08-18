const Redis = require('ioredis')
const env = require('./env')

// Lazily constructed — REDIS_URL is optional at the env-schema level (most
// of the app doesn't need it), so building the connection eagerly at
// require-time would crash the whole app on boot for anyone who hasn't
// configured Redis yet. Only throws once a caller actually tries to use it.
let connection = null

function getRedis() {
  if (connection) return connection

  if (!env.REDIS_URL) {
    throw new Error('Redis is not configured — set REDIS_URL in .env')
  }

  // BullMQ requires this exact setting on any connection it drives.
  connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
  return connection
}

module.exports = { getRedis }
