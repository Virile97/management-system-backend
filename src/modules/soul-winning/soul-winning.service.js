const soulWinningRepository = require('./soul-winning.repository')
const memberRepository = require('../members/member.repository')
const { AppError, ErrorCodes } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { resolvePeriodRange, startOfDay, endOfDay, startOfMonth, startOfYear, endOfYear } = require('../../shared/utils/period-range')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')

function fullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName].filter(Boolean).join(' ')
}

function toRecordResponse(row) {
  return {
    id: row.id,
    date: row.wonAt,
    convert: {
      firstName: row.firstName,
      middleName: row.middleName,
      lastName: row.lastName,
      name: fullName(row),
      contact: row.contact,
      location: row.location,
    },
    contact: row.contact,
    soulWinner: row.winner
      ? {
          id: row.winner.id,
          firstName: row.winner.firstName,
          lastName: row.winner.lastName,
          name: fullName(row.winner),
        }
      : null,
    status: row.status,
    notes: row.notes,
    memberId: row.memberId,
    baptizedAt: row.baptizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function retentionRate(activeMembers, total) {
  if (!total) return 0
  return Math.round((activeMembers / total) * 1000) / 10
}

function resolveGoalYear(query = {}) {
  if (query.year != null && query.year !== '') {
    const year = Number(query.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw AppError.badRequest('year must be a valid calendar year')
    }
    return year
  }
  return new Date().getFullYear()
}

function annualProgressRange(year) {
  const now = new Date()
  const start = startOfYear(new Date(year, 0, 1))
  const end =
    year === now.getFullYear() ? now : endOfYear(new Date(year, 0, 1))
  return { start, end }
}

/**
 * Annual goal only — one target per calendar year, with pace breakdown.
 * Matches UI: per month = target/12, per week = ceil(target/52), per day = 1dp.
 */
function buildAnnualGoalView(goal, { year, currentCount }) {
  if (!goal) return null

  const targetCount = goal.targetCount
  const remaining = Math.max(0, targetCount - currentCount)
  const progressPercent = targetCount
    ? Math.min(100, Math.round((currentCount / targetCount) * 100))
    : 0

  return {
    id: goal.id,
    year,
    title: `Annual Soul Winning Goal — ${year}`,
    targetCount,
    currentCount,
    remaining,
    progressPercent,
    breakdown: {
      perMonth: Math.round(targetCount / 12),
      perWeek: Math.round(targetCount / 52),
      perDay: Math.round(targetCount / 365),
    },
  }
}

async function loadAnnualGoal(year) {
  const progressRange = annualProgressRange(year)
  const [goal, yearSummary] = await Promise.all([
    soulWinningRepository.findAnnualGoal(year),
    soulWinningRepository.summarizeOverview(progressRange),
  ])

  return buildAnnualGoalView(goal, {
    year,
    currentCount: yearSummary.total,
  })
}

function parseInclude(include) {
  const allowed = new Set(['goal', 'stats', 'retention'])
  if (include == null || include === '') {
    return { goal: true, stats: true, retention: true }
  }
  const parts = Array.isArray(include)
    ? include
    : String(include)
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
  const selected = { goal: false, stats: false, retention: false }
  for (const part of parts) {
    if (allowed.has(part)) selected[part] = true
  }
  return selected
}

function buildStatsAndRetention(summary) {
  const total = summary.total
  const activeMembers = summary.activeMembers
  const newConverts = summary.newConverts
  const inactiveMembers = summary.inactiveMembers

  return {
    stats: {
      totalSoulsWon: total,
      newConverts,
      newConvertsPercent: total ? Math.round((newConverts / total) * 1000) / 10 : 0,
      nowActiveMembers: activeMembers,
      activeRetentionPercent: retentionRate(activeMembers, total),
      wentInactive: inactiveMembers,
    },
    retention: {
      active: activeMembers,
      newConvert: newConverts,
      inactive: inactiveMembers,
      activeRetentionPercent: retentionRate(activeMembers, total),
    },
  }
}

async function buildMutationSnapshot(query = {}) {
  const year = resolveGoalYear(query)
  const range = resolvePeriodRange(query)
  const [goal, summary] = await Promise.all([
    loadAnnualGoal(year),
    soulWinningRepository.summarizeOverview(range),
  ])
  const { stats, retention } = buildStatsAndRetention(summary)

  return {
    goal: goal
      ? {
          year: goal.year,
          currentCount: goal.currentCount,
          remaining: goal.remaining,
          progressPercent: goal.progressPercent,
          targetCount: goal.targetCount,
        }
      : null,
    stats,
    retention,
  }
}

async function getOverview(query = {}) {
  const period = query.period ?? 'month'
  const range = resolvePeriodRange(query)
  const year = resolveGoalYear(query)
  const include = parseInclude(query.include)

  const needsPeriodSummary = include.stats || include.retention
  const [summary, goal] = await Promise.all([
    needsPeriodSummary
      ? soulWinningRepository.summarizeOverview(range)
      : Promise.resolve(null),
    include.goal ? loadAnnualGoal(year) : Promise.resolve(undefined),
  ])

  const result = {
    period: { period, from: range.start, to: range.end },
  }

  if (include.goal) result.goal = goal
  if (needsPeriodSummary) {
    const built = buildStatsAndRetention(summary)
    if (include.stats) result.stats = built.stats
    if (include.retention) result.retention = built.retention
  }

  return result
}

async function listRecords(query = {}) {
  const { page, limit, skip } = getPagination(query)
  const range = resolvePeriodRange(query)
  const filters = {
    skip,
    take: limit,
    search: query.search,
    status: query.status,
    // Filter by members.id of the soul winner (same UUID used on create).
    winnerMemberId: query.winnerMemberId,
    start: range.start,
    end: range.end,
    sort: query.sort ?? 'date',
    order: query.order ?? 'desc',
  }

  const [rows, total] = await Promise.all([
    soulWinningRepository.findMany(filters),
    soulWinningRepository.count(filters),
  ])

  return {
    items: rows.map(toRecordResponse),
    meta: buildMeta({ page, limit, total }),
  }
}

async function getRecordById(id) {
  const row = await soulWinningRepository.findById(id)
  if (!row) throw AppError.notFound('Soul win record not found')
  return toRecordResponse(row)
}

async function createRecord(data, actorId, query = {}) {
  const winnerExists = await soulWinningRepository.memberExists(data.winnerMemberId)
  if (!winnerExists) {
    throw new AppError(
      'Soul winner must be an existing member',
      400,
      ErrorCodes.INVALID_WINNER,
    )
  }

  const created = await soulWinningRepository.create({
    firstName: data.firstName.trim(),
    middleName: data.middleName?.trim() || null,
    lastName: data.lastName.trim(),
    contact: data.contact?.trim() || null,
    location: data.location?.trim() || null,
    notes: data.notes?.trim() || null,
    wonAt: data.wonAt ?? startOfDay(new Date()),
    winnerMemberId: data.winnerMemberId,
    recordedBy: actorId,
  })

  logActivity({
    action: 'SOUL_WON',
    message: 'Soul won recorded',
    detail: fullName(created),
    actorId,
    metadata: { soulWinId: created.id, winnerMemberId: created.winnerMemberId },
  }).catch((err) => logger.error({ err }, 'Failed to log SOUL_WON activity'))

  const [row, snapshot] = await Promise.all([
    soulWinningRepository.findById(created.id),
    buildMutationSnapshot(query),
  ])

  return {
    record: toRecordResponse(row),
    snapshot,
  }
}

async function updateRecord(id, data) {
  const existing = await soulWinningRepository.findRawById(id)
  if (!existing) throw AppError.notFound('Soul win record not found')

  if (data.winnerMemberId) {
    const winnerExists = await soulWinningRepository.memberExists(data.winnerMemberId)
    if (!winnerExists) {
      throw new AppError(
        'Soul winner must be an existing member',
        400,
        ErrorCodes.INVALID_WINNER,
      )
    }
  }

  if (existing.memberId && (data.firstName || data.lastName || data.middleName)) {
    // Keep linked member name in sync when editing a baptized convert.
    await memberRepository.updateById(existing.memberId, {
      ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
      ...(data.middleName !== undefined
        ? { middleName: data.middleName?.trim() || null }
        : {}),
      ...(data.contact !== undefined ? { contact: data.contact?.trim() || null } : {}),
      ...(data.location !== undefined ? { address: data.location?.trim() || null } : {}),
    })
  }

  await soulWinningRepository.updateById(id, {
    ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
    ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
    ...(data.middleName !== undefined ? { middleName: data.middleName?.trim() || null } : {}),
    ...(data.contact !== undefined ? { contact: data.contact?.trim() || null } : {}),
    ...(data.location !== undefined ? { location: data.location?.trim() || null } : {}),
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    ...(data.wonAt !== undefined ? { wonAt: data.wonAt } : {}),
    ...(data.winnerMemberId !== undefined ? { winnerMemberId: data.winnerMemberId } : {}),
  })

  const row = await soulWinningRepository.findById(id)
  return toRecordResponse(row)
}

async function baptizeRecord(id, data = {}, actorId, query = {}) {
  const existing = await soulWinningRepository.findRawById(id)
  if (!existing) throw AppError.notFound('Soul win record not found')
  if (existing.memberId) {
    throw new AppError(
      'This convert has already been baptized into membership',
      409,
      ErrorCodes.ALREADY_BAPTIZED,
    )
  }

  const nameConflict = await memberRepository.findByName(existing.firstName, existing.lastName)
  if (nameConflict) {
    throw new AppError(
      'A member with this name already exists',
      409,
      ErrorCodes.MEMBER_NAME_EXISTS,
    )
  }

  const baptizedAt = data.baptizedAt ?? new Date()
  const result = await soulWinningRepository.baptize(id, {
    baptizedAt,
    memberData: {
      firstName: existing.firstName,
      middleName: existing.middleName,
      lastName: existing.lastName,
      contact: existing.contact,
      address: existing.location,
      isBaptized: true,
      baptizedAt,
      addedBy: actorId,
      ...(data.gender ? { gender: data.gender } : {}),
      ...(data.birthDate ? { birthDate: data.birthDate } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.groupIds?.length
        ? {
            groups: {
              create: data.groupIds.map((groupId) => ({
                groupId,
                ...(data.levelId ? { levelId: data.levelId } : {}),
                ...(data.lighthouseGroupId ? { lighthouseGroupId: data.lighthouseGroupId } : {}),
              })),
            },
          }
        : {}),
    },
  })

  if (result.error === 'NOT_FOUND') throw AppError.notFound('Soul win record not found')
  if (result.error === 'ALREADY_BAPTIZED') {
    throw new AppError(
      'This convert has already been baptized into membership',
      409,
      ErrorCodes.ALREADY_BAPTIZED,
    )
  }
  if (result.error === 'ACTIVE_STATUS_MISSING') {
    throw AppError.internal('Active status is missing from the database')
  }

  logActivity({
    action: 'SOUL_BAPTIZED',
    message: 'Convert baptized and added as member',
    detail: fullName(existing),
    actorId,
    metadata: { soulWinId: id, memberId: result.member.id },
  }).catch((err) => logger.error({ err }, 'Failed to log SOUL_BAPTIZED activity'))

  logActivity({
    action: 'MEMBER_REGISTERED',
    message: 'New member registered',
    detail: fullName(result.member),
    actorId,
    metadata: { fromSoulWinId: id },
  }).catch((err) => logger.error({ err }, 'Failed to log MEMBER_REGISTERED from baptism'))

  const [row, snapshot] = await Promise.all([
    soulWinningRepository.findById(id),
    buildMutationSnapshot(query),
  ])

  return {
    record: toRecordResponse(row),
    member: {
      id: result.member.id,
      firstName: result.member.firstName,
      lastName: result.member.lastName,
      status: result.member.status,
      isBaptized: result.member.isBaptized,
      baptizedAt: result.member.baptizedAt,
    },
    snapshot,
  }
}

async function listWinners(query = {}) {
  const range = resolvePeriodRange(query)
  const { page, limit, skip } = getPagination(query)
  const result = await soulWinningRepository.summarizeWinners({
    start: range.start,
    end: range.end,
    search: query.search,
    skip,
    take: limit,
  })

  return {
    period: { period: query.period ?? 'month', from: range.start, to: range.end },
    totalSoulsShared: result.totalSoulsShared,
    items: result.items.map((row) => ({
      id: row.id,
      name: fullName(row),
      firstName: row.firstName,
      lastName: row.lastName,
      ministry: row.ministry,
      servingSince: row.servingSince,
      soulsShared: row.soulsShared,
      nowActive: row.nowActive,
      newConverts: row.newConverts,
      needFollowUp: row.needFollowUp,
    })),
    meta: buildMeta({ page, limit, total: result.total }),
  }
}

function buildDayBuckets(days) {
  const end = startOfDay(new Date())
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  const buckets = []
  const cursor = new Date(start)
  while (cursor <= end) {
    buckets.push({
      key: cursor.toISOString().slice(0, 10),
      date: new Date(cursor),
      label: cursor.toLocaleString('en-US', { weekday: 'short' }),
      soulsWon: 0,
      becameActive: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return { start, end: endOfDay(end), buckets }
}

function buildMonthBuckets(months) {
  const now = new Date()
  const end = endOfDay(now)
  const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1))
  const buckets = []
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({
      key: `${date.getFullYear()}-${date.getMonth()}`,
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: date.toLocaleString('en-US', { month: 'short' }),
      soulsWon: 0,
      becameActive: 0,
    })
  }
  return { start, end, buckets }
}

async function getTrends(query = {}) {
  const leaderboardRange = resolvePeriodRange(query)
  const daily = buildDayBuckets(7)
  const monthly = buildMonthBuckets(6)

  const [dailySeries, monthlySeries, leaderboard] = await Promise.all([
    soulWinningRepository.sumTrendByDay({ start: daily.start, end: daily.end }),
    soulWinningRepository.sumTrendByMonth({ start: monthly.start, end: monthly.end }),
    soulWinningRepository.sumLeaderboard({
      start: leaderboardRange.start,
      end: leaderboardRange.end,
      limit: 10,
    }),
  ])

  const dayMap = new Map(daily.buckets.map((b) => [b.key, b]))
  for (const row of dailySeries.soulsWon) {
    const key = new Date(row.day).toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket) bucket.soulsWon = row.count
  }
  for (const row of dailySeries.becameActive) {
    const key = new Date(row.day).toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket) bucket.becameActive = row.count
  }

  const monthMap = new Map(monthly.buckets.map((b) => [b.key, b]))
  for (const row of monthlySeries.soulsWon) {
    const key = `${row.year}-${row.month - 1}`
    const bucket = monthMap.get(key)
    if (bucket) bucket.soulsWon = row.count
  }
  for (const row of monthlySeries.becameActive) {
    const key = `${row.year}-${row.month - 1}`
    const bucket = monthMap.get(key)
    if (bucket) bucket.becameActive = row.count
  }

  return {
    daily: daily.buckets.map(({ key: _key, date: _date, ...rest }) => rest),
    monthly: monthly.buckets.map(({ key: _key, year: _y, month: _m, ...rest }) => rest),
    leaderboard: leaderboard.map((row) => ({
      id: row.id,
      name: fullName(row),
      count: row.count,
    })),
  }
}

async function getGoal(query = {}) {
  const year = resolveGoalYear(query)
  const goal = await loadAnnualGoal(year)

  return {
    year,
    goal,
  }
}

async function upsertGoal(data, actorId) {
  const year = resolveGoalYear(data)
  const targetCount = Number(data.targetCount)

  if (!Number.isInteger(targetCount) || targetCount < 1) {
    throw AppError.badRequest('targetCount must be a positive integer')
  }

  const saved = await soulWinningRepository.upsertAnnualGoal(year, targetCount, actorId)
  const progressRange = annualProgressRange(year)
  const yearSummary = await soulWinningRepository.summarizeOverview(progressRange)

  return buildAnnualGoalView(saved, {
    year,
    currentCount: yearSummary.total,
  })
}

module.exports = {
  getOverview,
  listRecords,
  getRecordById,
  createRecord,
  updateRecord,
  baptizeRecord,
  listWinners,
  getTrends,
  getGoal,
  upsertGoal,
  // test helpers
  _toRecordResponse: toRecordResponse,
  _retentionRate: retentionRate,
  _buildAnnualGoalView: buildAnnualGoalView,
}
