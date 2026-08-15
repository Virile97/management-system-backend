const { createClient } = require('@supabase/supabase-js')
const env = require('./env')

// Lazily constructed — SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY are
// optional at the env-schema level (many modules never touch Storage), so
// building the client eagerly at require-time would crash the whole app on
// boot for anyone who hasn't configured Supabase yet. Only throws once a
// caller actually tries to use Supabase without a key configured.
let client = null

function getSupabase() {
  if (client) return client

  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      'Supabase is not configured — set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in .env',
    )
  }

  client = createClient(env.SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  return client
}

// Proxy so existing call sites (`supabase.storage.from(...)`, etc.) keep
// working unchanged — the real client is only created on first property
// access, not at module load.
const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      return getSupabase()[prop]
    },
  },
)

module.exports = supabase
