const { Prisma } = require('@prisma/client')
const prisma = require('../config/prisma')
const logger = require('../config/logger')

const PROTECTED_STATUSES = Object.freeze(['Deceased'])

/**
 * Parse MEMBER_INACTIVE_AFTER values like "30d", "4w", "30 days", "4 weeks".
 * Bare numbers default to days.
 * @returns {{ amount: number, unit: 'days' | 'weeks', label: string, cutoff: Date }}
 */
function parseInactiveAfter(raw, now = new Date()) {
  const value = String(raw ?? '').trim()
  const match = value.match(/^(\d+)\s*(d|day|days|w|week|weeks)?$/i)

  if (!match) {
    throw new Error(
      `Invalid MEMBER_INACTIVE_AFTER "${raw}". Use e.g. "30d", "4w", "30 days", or "4 weeks".`,
    )
  }

  const amount = Number(match[1])
  if (!Number.isInteger(amount) || amount < 1) {
    throw new Error('MEMBER_INACTIVE_AFTER amount must be a positive integer')
  }

  const unitToken = (match[2] || 'd').toLowerCase()
  const unit = unitToken.startsWith('w') ? 'weeks' : 'days'
  const days = unit === 'weeks' ? amount * 7 : amount

  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  )

  return {
    amount,
    unit,
    label: `${amount}${unit === 'weeks' ? 'w' : 'd'}`,
    cutoff,
  }
}

async function resolveStatusIds() {
  const statuses = await prisma.status.findMany({
    where: { name: { in: ['Active', 'Inactive', ...PROTECTED_STATUSES] } },
    select: { id: true, name: true },
  })

  const byName = Object.fromEntries(statuses.map((status) => [status.name, status.id]))

  if (!byName.Active || !byName.Inactive) {
    throw new Error('Required statuses "Active" and "Inactive" are missing from the database')
  }

  return byName
}

/**
 * Set-based Active/Inactive sync.
 * Activity = MAX(attendance.date), else member.createdAt::date.
 * Never mutates Deceased (or other protected statuses).
 *
 * @returns {Promise<{ markedInactive: number, markedActive: number, cutoff: Date, threshold: string }>}
 */
async function syncMemberActiveStatus({ inactiveAfter, dryRun = false } = {}) {
  const { cutoff, label } = parseInactiveAfter(inactiveAfter)
  const statusIds = await resolveStatusIds()

  const protectedNames = PROTECTED_STATUSES
  const protectedSql = Prisma.join(protectedNames.map((name) => Prisma.sql`${name}`))

  const eligibleMembersSql = Prisma.sql`
    SELECT
      m.id,
      COALESCE(
        (
          SELECT MAX(a.date)
          FROM attendances a
          WHERE a."memberId" = m.id
        ),
        (m."createdAt" AT TIME ZONE 'UTC')::date
      ) AS "lastActivityDate",
      s.name AS "statusName"
    FROM members m
    LEFT JOIN statuses s ON s.id = m."statusId"
    WHERE s.name IS NULL
       OR s.name NOT IN (${protectedSql})
  `

  if (dryRun) {
    const preview = await prisma.$queryRaw`
      WITH eligible AS (
        ${eligibleMembersSql}
      )
      SELECT
        COUNT(*) FILTER (
          WHERE "lastActivityDate" < ${cutoff}::date
            AND ("statusName" IS DISTINCT FROM 'Inactive')
        )::int AS "wouldMarkInactive",
        COUNT(*) FILTER (
          WHERE "lastActivityDate" >= ${cutoff}::date
            AND ("statusName" IS DISTINCT FROM 'Active')
        )::int AS "wouldMarkActive"
      FROM eligible
    `

    const result = {
      markedInactive: Number(preview[0]?.wouldMarkInactive ?? 0),
      markedActive: Number(preview[0]?.wouldMarkActive ?? 0),
      cutoff,
      threshold: label,
      dryRun: true,
    }

    logger.info(result, 'Member status sync dry-run')
    return result
  }

  const [inactiveResult, activeResult] = await prisma.$transaction([
    prisma.$executeRaw`
      WITH eligible AS (
        ${eligibleMembersSql}
      ),
      stale AS (
        SELECT id
        FROM eligible
        WHERE "lastActivityDate" < ${cutoff}::date
          AND ("statusName" IS DISTINCT FROM 'Inactive')
      )
      UPDATE members m
      SET
        "statusId" = ${statusIds.Inactive},
        "updatedAt" = NOW()
      FROM stale
      WHERE m.id = stale.id
    `,
    prisma.$executeRaw`
      WITH eligible AS (
        ${eligibleMembersSql}
      ),
      fresh AS (
        SELECT id
        FROM eligible
        WHERE "lastActivityDate" >= ${cutoff}::date
          AND ("statusName" IS DISTINCT FROM 'Active')
      )
      UPDATE members m
      SET
        "statusId" = ${statusIds.Active},
        "updatedAt" = NOW()
      FROM fresh
      WHERE m.id = fresh.id
    `,
  ])

  const result = {
    markedInactive: Number(inactiveResult),
    markedActive: Number(activeResult),
    cutoff,
    threshold: label,
    dryRun: false,
  }

  logger.info(result, 'Member status sync completed')
  return result
}

module.exports = {
  parseInactiveAfter,
  syncMemberActiveStatus,
  PROTECTED_STATUSES,
}
