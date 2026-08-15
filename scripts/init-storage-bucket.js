/**
 * One-time (idempotent) setup: creates the private Supabase Storage bucket
 * used by the File Storage feature, if it doesn't already exist.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (not the anon key) — bucket management
 * is an admin-level Storage API operation.
 *
 * Usage:
 *   npm run storage:init-bucket
 */
require('dotenv').config()

const env = require('../src/config/env')
const supabase = require('../src/config/supabase')

async function main() {
  const bucket = env.SUPABASE_STORAGE_BUCKET
  const maxBytes = env.FILE_STORAGE_MAX_UPLOAD_MB * 1024 * 1024

  const { data: existing } = await supabase.storage.getBucket(bucket)
  if (existing) {
    console.log(`Bucket "${bucket}" already exists — nothing to do.`)
    return
  }

  const { error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: maxBytes,
  })

  if (error) {
    if (/already exists/i.test(error.message)) {
      console.log(`Bucket "${bucket}" already exists — nothing to do.`)
      return
    }
    throw error
  }

  console.log(`Created private bucket "${bucket}" (fileSizeLimit: ${maxBytes} bytes).`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Failed to initialize storage bucket:', err.message)
    process.exit(1)
  })
