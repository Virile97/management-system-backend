/**
 * Single-value TTL memo (e.g. dashboard stats with no params).
 */
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

/**
 * Keyed TTL memo for parameterized responses (e.g. dashboard overview ranges).
 */
function createKeyedMemoCache(ttlMs, { maxEntries = 50 } = {}) {
  const store = new Map()

  async function withCache(key, compute) {
    const now = Date.now()
    const hit = store.get(key)
    if (hit && now < hit.expiresAt) {
      return hit.value
    }

    const value = await compute()
    store.set(key, { value, expiresAt: now + ttlMs })

    if (store.size > maxEntries) {
      const oldestKey = store.keys().next().value
      store.delete(oldestKey)
    }

    return value
  }

  withCache.clear = () => {
    store.clear()
  }

  return withCache
}

module.exports = { createMemoCache, createKeyedMemoCache }
