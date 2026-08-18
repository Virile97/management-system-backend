const dotenv = require('dotenv')
const { z } = require('zod')

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('/api/v1'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Cloudflare R2 (S3-compatible object storage) — used for File Storage.
  // Optional at the env-schema level (many modules never touch Storage) so
  // the app can still boot without them configured; only throws once a
  // caller actually tries to use R2 — see src/config/r2.js.
  // R2_ACCOUNT_ID builds the endpoint: https://<id>.r2.cloudflarestorage.com
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().default('church-files'),

  // Redis — backs the BullMQ queue that runs thumbnail generation as a
  // durable background job instead of in-process fire-and-forget. Optional
  // at the env-schema level so the app can still boot without it configured;
  // only throws once a caller actually tries to use the queue — see
  // src/config/redis.js.
  REDIS_URL: z.string().optional().default(''),
  // How many thumbnail jobs one worker process runs at once. ffmpeg/sharp/
  // pdf-to-img are CPU-heavy, so this should track the worker container's
  // CPU count, not scale with API traffic — tune per deploy, not per load.
  THUMBNAIL_WORKER_CONCURRENCY: z.coerce.number().default(2),

  // File Storage upload ceiling (MB) — not enforced by R2 itself (no
  // per-file size cap to query via the API), just a client-facing limit.
  FILE_STORAGE_MAX_UPLOAD_MB: z.coerce.number().default(50),
  // Cosmetic quota shown in the storage-usage widget — computed from this
  // app's own DB (SUM of file sizeBytes), NOT read from Cloudflare. Default
  // of 10 matches R2's free-tier storage allowance (10 GB-months/month);
  // raise it once you're on paid usage, since R2 has no hard storage cap to
  // enforce against. If R2 objects are ever created/deleted outside this
  // app, this number can drift from what Cloudflare actually bills you for.
  FILE_STORAGE_QUOTA_GB: z.coerce.number().default(10),

  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('15m'),

  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().default(30),

  APP_API_KEY: z.string().min(1, 'APP_API_KEY is required'),

  FRONTEND_URL: z.string().min(1, 'FRONTEND_URL is required'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  ATTENDANCE_UPSERT_RATE_LIMIT_MAX: z.coerce.number().default(100),

  RESEND_API_KEY: z.string().optional().default(''),
  RESEND_FROM: z.string().optional().default(''),
  APP_NAME: z.string().optional().default('Management System'),

  PASSWORD_SETUP_TOKEN_EXPIRES_IN_HOURS: z.coerce.number().default(48),

  // Log Prisma queries slower than this (ms). 0 disables. Use 200 locally to measure.
  SLOW_QUERY_MS: z.coerce.number().default(0),

  // Auto Active/Inactive sync threshold, e.g. "30d", "4w", "30 days", "4 weeks".
  // Used by the daily cron job: npm run jobs:install-member-status-cron
  MEMBER_INACTIVE_AFTER: z.string().default('4w'),
  // Only for optional --loop mode (prefer cron one-shot in production).
  MEMBER_STATUS_SYNC_INTERVAL_MS: z.coerce.number().default(86_400_000),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment variables')
}

module.exports = parsed.data
