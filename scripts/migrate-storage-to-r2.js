/**
 * One-off migration: copies every existing File Storage object (originals
 * + generated thumbnails) from the old Supabase Storage bucket into the
 * new Cloudflare R2 bucket, under the same storagePath/thumbnailPath keys
 * already recorded in the database — so no DB rows need to change.
 *
 * Non-destructive: only reads from Supabase and writes to R2. The Supabase
 * bucket is left untouched; delete it manually once you've verified the
 * app works end-to-end against R2.
 *
 * Requires (temporarily, just for this script):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET
 * plus the app's normal R2_* env vars.
 *
 * Usage:
 *   node scripts/migrate-storage-to-r2.js
 *   node scripts/migrate-storage-to-r2.js --dry-run
 */
require('dotenv').config()

const { createClient } = require('@supabase/supabase-js')
const { PrismaClient } = require('@prisma/client')
const env = require('../src/config/env')
const r2Storage = require('../src/modules/file-storage/file-storage.r2')

const dryRun = process.argv.includes('--dry-run')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_STORAGE_BUCKET) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET in .env — ' +
      'these are only needed temporarily to read the old bucket for this migration.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const prisma = new PrismaClient()

async function downloadFromSupabase(storagePath) {
  const { data, error } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .download(storagePath)
  if (error || !data) {
    throw new Error(error?.message || `No data returned for ${storagePath}`)
  }
  return Buffer.from(await data.arrayBuffer())
}

async function migrateObject(storagePath, contentType, label) {
  const buffer = await downloadFromSupabase(storagePath)
  console.log(`  ${label}: downloaded ${buffer.length} bytes from Supabase`)

  if (dryRun) {
    console.log(`  ${label}: [dry-run] would upload to R2 bucket "${env.R2_BUCKET}"`)
    return
  }

  await r2Storage.uploadObject(env.R2_BUCKET, storagePath, buffer, contentType)
  console.log(`  ${label}: uploaded to R2`)
}

async function main() {
  const files = await prisma.storageFile.findMany({
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      storagePath: true,
      thumbnailPath: true,
      thumbnailStatus: true,
    },
  })

  console.log(
    `Found ${files.length} file(s) to migrate${dryRun ? ' (dry run — no writes)' : ''}.\n`,
  )

  let succeeded = 0
  const failed = []

  for (const file of files) {
    console.log(`${file.originalName} (${file.id})`)
    try {
      // Intentionally sequential — this is a one-off script, not a hot path.
      await migrateObject(file.storagePath, file.mimeType, 'original')

      if (file.thumbnailStatus === 'READY' && file.thumbnailPath) {
        await migrateObject(file.thumbnailPath, 'image/webp', 'thumbnail')
      }

      succeeded += 1
    } catch (err) {
      console.error(`  FAILED: ${err.message}`)
      failed.push({ id: file.id, name: file.originalName, error: err.message })
    }
    console.log('')
  }

  console.log('---')
  console.log(`Done: ${succeeded}/${files.length} file(s) migrated successfully.`)
  if (failed.length > 0) {
    console.log(`${failed.length} failed:`)
    for (const f of failed) console.log(`  - ${f.name} (${f.id}): ${f.error}`)
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error('Migration script crashed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
