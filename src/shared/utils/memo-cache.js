function createMemoCache(ttlMs) {
  let cached = null
  let expiresAt = 0

  async function withCache(compute) {
    const now = Date.now()
    if (cached && now < expiresAt) {
      return cached
    }
    cached = await compute()
    expiresAt = now + ttlMs
    return cached
  }

  withCache.clear = () => {
    cached = null
    expiresAt = 0
  }

  return withCache
}

module.exports = { createMemoCache }
