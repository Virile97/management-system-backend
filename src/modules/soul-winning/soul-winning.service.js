const soulWinningRepository = require('./soul-winning.repository')
const memberRepository = require('../members/member.repository')
const { AppError, ErrorCodes } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { resolvePeriodRange, startOfDay, endOfDay, startOfYear, endOfYear } = require('../../shared/utils/period-range')
const { logActivity } = require('../../shared/utils/activity-log')
const logger = require('../../config/logger')

function fullName({ firstName, middleName, lastName }) {
  return [firstName, middleName, lastName].filter(Boolean).join(' ')
}

function toRecordResponse(row) {
  const winners = (row.winners ?? []).map((w) => ({
    id: w.id,
    firstName: w.firstName,
    lastName: w.lastName,
    name: fullName(w),
  }))
  const primary = winners[0] ?? null

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
      age: row.age ?? null,
    },
    contact: row.contact,
    age: row.age ?? null,
    event: row.event ?? null,
    // Preferred: all co-winners in sort order.
    soulWinners: winners,
    // First winner kept for older UI clients.
    soulWinner: primary,
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

/**
 * Full calendar-year bounds for annual goal progress.
 * Independent of period tabs (today/week/month) — always Jan 1 … Dec 31 of `year`.
 */
function annualProgressRange(year) {
  return {
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1)),
  }
}

/**
 * Annual goal for one calendar year only — never falls back to another year.
 * Missing goal → stub with currentCount so UI can show “Add Goal” + year progress.
 */
function buildAnnualGoalView(goal, { year, currentCount }) {
  if (!goal) {
    return {
      year,
      title: `Annual Soul Winning Goal — ${year}`,
      targetCount: null,
      currentCount,
      remaining: null,
      progressPercent: 0,
      breakdown: null,
    }
  }

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
  const baptized = activeMembers + inactiveMembers
  const baptismPercent = retentionRate(baptized, total)
  const activeRetentionPercent = retentionRate(activeMembers, baptized)

  return {
    stats: {
      totalSoulsWon: total,
      newConverts,
      newConvertsPercent: total ? Math.round((newConverts / total) * 1000) / 10 : 0,
      nowActiveMembers: activeMembers,
      baptized,
      baptismPercent,
      activeRetentionPercent,
      wentInactive: inactiveMembers,
    },
    retention: {
      // UI card 1: professions of faith (souls won) → baptism.
      baptism: {
        title: 'Souls Won vs. Baptism',
        basis: 'baptism',
        soulsWon: total,
        baptized,
        awaitingBaptism: newConverts,
        baptismPercent,
      },
      // UI card 2: among baptized → still Active vs Inactive.
      active: {
        title: 'Baptism vs. Active Retention',
        basis: 'active',
        baptized,
        active: activeMembers,
        inactive: inactiveMembers,
        activeRetentionPercent,
      },
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
    // Same year as overview context (FE sends year derived from period tabs).
    goal: {
      year: goal.year,
      title: goal.title,
      currentCount: goal.currentCount,
      remaining: goal.remaining,
      progressPercent: goal.progressPercent,
      targetCount: goal.targetCount,
      breakdown: goal.breakdown,
    },
    stats,
    retention,
  }
}

async function getOverview(query = {}) {
  const period = query.period ?? 'month'
  const range = resolvePeriodRange(query)
  // Goal year comes from FE period tabs (presets → current year; custom → range year).
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
    year,
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
    // Filter by members.id of any soul winner on the record.
    winnerMemberId: query.winnerMemberId,
    event: query.event,
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
  const winnerMemberIds = [...new Set(data.winnerMemberIds ?? [])]
  const winnersOk = await soulWinningRepository.membersExist(winnerMemberIds)
  if (!winnersOk) {
    throw new AppError(
      'Every soul winner must be an existing member',
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
    age: data.age == null ? null : Number(data.age),
    event: data.event?.trim() || null,
    notes: data.notes?.trim() || null,
    wonAt: data.wonAt ?? startOfDay(new Date()),
    winnerMemberIds,
    recordedBy: actorId,
  })

  logActivity({
    action: 'SOUL_WON',
    message: 'Soul won recorded',
    detail: fullName(created),
    actorId,
    metadata: { soulWinId: created.id, winnerMemberIds },
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

  let winnerMemberIds
  if (data.winnerMemberIds) {
    winnerMemberIds = [...new Set(data.winnerMemberIds)]
    const winnersOk = await soulWinningRepository.membersExist(winnerMemberIds)
    if (!winnersOk) {
      throw new AppError(
        'Every soul winner must be an existing member',
        400,
        ErrorCodes.INVALID_WINNER,
      )
    }
  }

  if (existing.memberId && (data.firstName || data.lastName || data.middleName || data.age !== undefined)) {
    // Keep linked member name/age in sync when editing a baptized convert.
    await memberRepository.updateById(existing.memberId, {
      ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
      ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
      ...(data.middleName !== undefined
        ? { middleName: data.middleName?.trim() || null }
        : {}),
      ...(data.contact !== undefined ? { contact: data.contact?.trim() || null } : {}),
      ...(data.location !== undefined ? { address: data.location?.trim() || null } : {}),
      ...(data.age !== undefined ? { age: data.age == null ? null : Number(data.age) } : {}),
    })
  }

  await soulWinningRepository.updateById(id, {
    ...(data.firstName !== undefined ? { firstName: data.firstName.trim() } : {}),
    ...(data.lastName !== undefined ? { lastName: data.lastName.trim() } : {}),
    ...(data.middleName !== undefined ? { middleName: data.middleName?.trim() || null } : {}),
    ...(data.contact !== undefined ? { contact: data.contact?.trim() || null } : {}),
    ...(data.location !== undefined ? { location: data.location?.trim() || null } : {}),
    ...(data.age !== undefined ? { age: data.age == null ? null : Number(data.age) } : {}),
    ...(data.event !== undefined ? { event: data.event?.trim() || null } : {}),
    ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
    ...(data.wonAt !== undefined ? { wonAt: data.wonAt } : {}),
    ...(winnerMemberIds ? { winnerMemberIds } : {}),
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
      age: existing.age ?? null,
      isBaptized: true,
      baptizedAt,
      addedBy: actorId,
      levelId: data.levelId,
      ...(data.gender ? { gender: data.gender } : {}),
      ...(data.birthDate ? { birthDate: data.birthDate } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.lighthouseGroupId ? { lighthouseGroupId: data.lighthouseGroupId } : {}),
      ...(data.groupIds?.length
        ? { groups: { create: data.groupIds.map((groupId) => ({ groupId })) } }
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
      ministries: row.ministries,
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
      professionsOfFaith: 0,
      baptism: 0,
      activeRetention: 0,
      wentInactive: 0,
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  return { start, end: endOfDay(end), buckets }
}

/** Exactly 12 month points for a calendar year (Jan–Dec). */
function buildYearMonthBuckets(year) {
  const buckets = []
  for (let month = 1; month <= 12; month += 1) {
    const date = new Date(year, month - 1, 1)
    buckets.push({
      key: `${year}-${month - 1}`,
      year,
      month,
      label: date.toLocaleString('en-US', { month: 'short' }),
      professionsOfFaith: 0,
      baptism: 0,
      activeRetention: 0,
      wentInactive: 0,
    })
  }
  return buckets
}

function resolveTrendsYear(query = {}) {
  if (query.year != null && query.year !== '') {
    const year = Number(query.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw AppError.badRequest('year must be a valid calendar year')
    }
    return year
  }
  if (query.period === 'custom' && query.from) {
    const from = query.from instanceof Date ? query.from : new Date(query.from)
    if (!Number.isNaN(from.getTime())) return from.getFullYear()
  }
  return new Date().getFullYear()
}

/** Intersect two { start, end } ranges (null = unbounded). */
function intersectDateRanges(a = {}, b = {}) {
  const starts = [a.start, b.start].filter((d) => d != null)
  const ends = [a.end, b.end].filter((d) => d != null)
  const start = starts.length
    ? new Date(Math.max(...starts.map((d) => d.getTime())))
    : null
  const end = ends.length
    ? new Date(Math.min(...ends.map((d) => d.getTime())))
    : null

  if (start && end && start.getTime() > end.getTime()) {
    return { start: null, end: null, empty: true }
  }
  return { start, end, empty: false }
}

function fillBaptismRetentionBuckets(buckets, series, { byDay }) {
  const map = new Map(buckets.map((b) => [b.key, b]))

  for (const row of series) {
    const key = byDay
      ? new Date(row.day).toISOString().slice(0, 10)
      : `${row.year}-${row.month - 1}`
    const bucket = map.get(key)
    if (!bucket) continue

    bucket.baptized = row.baptized
    bucket.active = row.active
    bucket.inactive = row.inactive
    bucket.activeRetentionPercent = retentionRate(row.active, row.baptized)
  }

  return buckets.map(({ key: _key, date: _date, ...rest }) => ({
    ...rest,
    baptized: rest.baptized ?? 0,
    active: rest.active ?? 0,
    inactive: rest.inactive ?? 0,
    activeRetentionPercent: rest.activeRetentionPercent ?? 0,
  }))
}

async function getTrends(query = {}) {
  const year = resolveTrendsYear(query)
  const periodRange = resolvePeriodRange(query)
  const yearRange = {
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1)),
  }
  // Monthly = calendar year series ∩ active period window (not rolling last-6).
  const monthlyWindow = intersectDateRanges(yearRange, periodRange)
  const daily = buildDayBuckets(7)
  const monthlyBuckets = buildYearMonthBuckets(year)

  const emptyMonthSeries = { soulsWon: [], becameActive: [] }

  const [
    dailySeries,
    monthlySeries,
    baptismDaily,
    baptismMonthly,
    baptismSummary,
    leaderboard,
    byEvent,
  ] = await Promise.all([
    soulWinningRepository.sumTrendByDay({ start: daily.start, end: daily.end }),
    monthlyWindow.empty
      ? Promise.resolve(emptyMonthSeries)
      : soulWinningRepository.sumTrendByMonth({
          start: monthlyWindow.start,
          end: monthlyWindow.end,
        }),
    soulWinningRepository.sumBaptismRetentionByDay({ start: daily.start, end: daily.end }),
    monthlyWindow.empty
      ? Promise.resolve([])
      : soulWinningRepository.sumBaptismRetentionByMonth({
          start: monthlyWindow.start,
          end: monthlyWindow.end,
        }),
    soulWinningRepository.summarizeBaptismRetention(periodRange),
    soulWinningRepository.sumLeaderboard({
      start: periodRange.start,
      end: periodRange.end,
      limit: 10,
    }),
    soulWinningRepository.sumByEvent({
      start: periodRange.start,
      end: periodRange.end,
      limit: 8,
    }),
  ])

  const dayMap = new Map(daily.buckets.map((b) => [b.key, b]))
  for (const row of dailySeries.soulsWon) {
    const key = new Date(row.day).toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket) bucket.professionsOfFaith = row.count
  }
  for (const row of dailySeries.becameActive) {
    const key = new Date(row.day).toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (bucket) bucket.baptism = row.count
  }
  for (const row of baptismDaily) {
    const key = new Date(row.day).toISOString().slice(0, 10)
    const bucket = dayMap.get(key)
    if (!bucket) continue
    // Prefer retention join counts for baptism split (active vs inactive).
    bucket.baptism = row.baptized
    bucket.activeRetention = row.active
    bucket.wentInactive = row.inactive
  }

  const monthMap = new Map(monthlyBuckets.map((b) => [b.key, b]))
  for (const row of monthlySeries.soulsWon) {
    const key = `${row.year}-${row.month - 1}`
    const bucket = monthMap.get(key)
    if (bucket) bucket.professionsOfFaith = row.count
  }
  for (const row of monthlySeries.becameActive) {
    const key = `${row.year}-${row.month - 1}`
    const bucket = monthMap.get(key)
    if (bucket) bucket.baptism = row.count
  }
  for (const row of baptismMonthly) {
    const key = `${row.year}-${row.month - 1}`
    const bucket = monthMap.get(key)
    if (!bucket) continue
    bucket.baptism = row.baptized
    bucket.activeRetention = row.active
    bucket.wentInactive = row.inactive
  }

  const baptismDailyBuckets = daily.buckets.map((b) => ({
    key: b.key,
    date: b.date,
    label: b.label,
  }))
  const baptismMonthlyBuckets = monthlyBuckets.map((b) => ({
    key: b.key,
    year: b.year,
    month: b.month,
    label: b.label,
  }))

  return {
    year,
    daily: daily.buckets.map(({ key: _key, date: _date, ...rest }) => rest),
    monthly: monthlyBuckets.map(({ key: _key, ...rest }) => rest),
    byEvent,
    baptismRetention: {
      title: 'Baptism vs. Active Retention',
      summary: {
        baptized: baptismSummary.baptized,
        active: baptismSummary.active,
        inactive: baptismSummary.inactive,
        activeRetentionPercent: retentionRate(
          baptismSummary.active,
          baptismSummary.baptized,
        ),
      },
      daily: fillBaptismRetentionBuckets(baptismDailyBuckets, baptismDaily, { byDay: true }),
      monthly: fillBaptismRetentionBuckets(baptismMonthlyBuckets, baptismMonthly, {
        byDay: false,
      }),
    },
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
  _buildYearMonthBuckets: buildYearMonthBuckets,
  _intersectDateRanges: intersectDateRanges,
  _resolveTrendsYear: resolveTrendsYear,
}
