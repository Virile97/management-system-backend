/**
 * Member Active/Inactive sync (cron-friendly one-shot).
 *
 * Activity signal: last attendance date, else member createdAt (UTC date).
 * Deceased members are never changed.
 *
 * Production: install system cron (preferred):
 *   npm run jobs:install-member-status-cron
 *
 * Usage:
 *   node scripts/jobs/sync-member-status.js              # run once
 *   node scripts/jobs/sync-member-status.js --dry-run    # preview counts only
 *   node scripts/jobs/sync-member-status.js --loop       # optional long-lived worker
 *
 * Env:
 *   MEMBER_INACTIVE_AFTER=4w          # e.g. 30d | 4w | 30 days | 4 weeks
 *   MEMBER_STATUS_SYNC_INTERVAL_MS=86400000   # only for --loop
 */
require('dotenv').config()

const env = require('../../src/config/env')
const prisma = require('../../src/config/prisma')
const logger = require('../../src/config/logger')
const { syncMemberActiveStatus } = require('../../src/jobs/sync-member-status')

function hasFlag(flag) {
  return process.argv.includes(flag)
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function runOnce({ dryRun }) {
  return syncMemberActiveStatus({
    inactiveAfter: env.MEMBER_INACTIVE_AFTER,
    dryRun,
  })
}

async function main() {
  const dryRun = hasFlag('--dry-run')
  const loop = hasFlag('--loop')
  const intervalMs = env.MEMBER_STATUS_SYNC_INTERVAL_MS

  logger.info(
    {
      inactiveAfter: env.MEMBER_INACTIVE_AFTER,
      dryRun,
      loop,
      intervalMs: loop ? intervalMs : null,
    },
    'Starting member status sync',
  )

  if (!loop) {
    const result = await runOnce({ dryRun })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  // Long-running worker: one process, periodic set-based updates.
  // Prefer external cron + one-shot mode in prod.
  for (;;) {
    try {
      await runOnce({ dryRun })
    } catch (err) {
      logger.error({ err }, 'Member status sync iteration failed')
    }

    await sleep(intervalMs)
  }
}

main()
  .catch((err) => {
    logger.error({ err }, 'Member status sync failed')
    process.exitCode = 1
  })
  .finally(async () => {
    if (!hasFlag('--loop')) {
      await prisma.$disconnect()
    }
  })
