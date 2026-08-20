const attendanceRepository = require('./attendance.repository')
const {
  deriveStatus,
  toAttendanceDay,
  groupAttendancesByMemberId,
  toAttendanceItem,
} = require('./attendance.mapper')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')
const { createMemoCache } = require('../../shared/utils/memo-cache')

const ROSTER_COUNTS_CACHE_TTL_MS = 60_000
const allMemberCountCache = createMemoCache(ROSTER_COUNTS_CACHE_TTL_MS)
const levelCountsCache = createMemoCache(ROSTER_COUNTS_CACHE_TTL_MS)

function buildSummary(totalMembers, counts) {
  const fullDay = counts.fullDay ?? 0
  const morningOnly = counts.morningOnly ?? 0
  const afternoonOnly = counts.afternoonOnly ?? 0
  const partialMixed = counts.partialMixed ?? 0

  const present = fullDay + morningOnly + afternoonOnly + partialMixed
  const absent = Math.max(totalMembers - present, 0)
  const partial = morningOnly + afternoonOnly + partialMixed
  const attendanceRate = totalMembers
    ? Math.round((present / totalMembers) * 1000) / 10
    : 0

  return {
    totalMembers,
    present,
    attendanceRate,
    fullDay,
    partial,
    morningOnly,
    afternoonOnly,
    absent,
  }
}

async function listAttendance(query) {
  const { page, limit, skip } = getPagination(query)
  const { from, to, search, level } = query
  const fromDay = attendanceRepository.toDateOnly(from)
  const toDay = attendanceRepository.toDateOnly(to)
  const singleDay = fromDay.getTime() === toDay.getTime()
  // Present-first only when a list filter is applied (search/level). Default order is name.
  const prioritizeAttendance = Boolean(search || level)

  const [members, total, allMemberCount, summaryCounts, levelCounts] = await Promise.all([
    prioritizeAttendance
      ? attendanceRepository.findMembersPrioritizedByAttendance({
          skip,
          limit,
          search,
          level,
          from: fromDay,
          to: toDay,
        })
      : attendanceRepository.findMembers({ skip, limit, search, level }),
    attendanceRepository.countMembers({ search, level }),
    allMemberCountCache(() => attendanceRepository.countMembers({})),
    attendanceRepository.summarizeAttendanceInRange(fromDay, toDay),
    levelCountsCache(() => attendanceRepository.countMembersByLevel()),
  ])

  const pageAttendances = members.length
    ? await attendanceRepository.findAttendancesByMemberIds(
        members.map((m) => m.id),
        fromDay,
        toDay,
      )
    : []

  const attendancesByMemberId = groupAttendancesByMemberId(pageAttendances)

  return {
    period: { from: fromDay, to: toDay },
    summary: buildSummary(allMemberCount, summaryCounts),
    levels: [
      { id: null, name: 'All Members', count: allMemberCount },
      ...levelCounts.map((row) => ({
        id: row.id,
        name: row.name,
        count: row.count,
      })),
    ],
    items: members.map((member) =>
      toAttendanceItem(member, attendancesByMemberId.get(member.id) ?? [], { singleDay }),
    ),
    meta: buildMeta({ page, limit, total }),
  }
}

async function upsertAttendance(memberId, data, actorId) {
  const member = await attendanceRepository.memberExists(memberId)
  if (!member) {
    throw AppError.notFound('Member not found')
  }
  if (member.status?.name === attendanceRepository.DECEASED_STATUS_NAME) {
    throw AppError.conflict('Cannot record attendance for a deceased member')
  }

  const attendance = await attendanceRepository.upsertByMemberAndDate({
    memberId,
    date: data.date,
    morningIn: data.morningIn,
    morningOut: data.morningOut,
    afternoonIn: data.afternoonIn,
    afternoonOut: data.afternoonOut,
    recordedBy: actorId,
  })

  return {
    ...toAttendanceDay(attendance),
    memberId: attendance.memberId,
  }
}

function clearRosterCountsCache() {
  allMemberCountCache.clear()
  levelCountsCache.clear()
}

module.exports = {
  listAttendance,
  upsertAttendance,
  deriveStatus,
  _clearRosterCountsCache: clearRosterCountsCache,
}
