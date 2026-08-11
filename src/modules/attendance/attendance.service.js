const attendanceRepository = require('./attendance.repository')
const { AppError } = require('../../shared/errors')
const { getPagination, buildMeta } = require('../../shared/utils')

function hasMorning(attendance) {
  return Boolean(attendance?.morningIn || attendance?.morningOut)
}

function hasAfternoon(attendance) {
  return Boolean(attendance?.afternoonIn || attendance?.afternoonOut)
}

// Derived from which of the four timestamps are set — matches the Status
// column in the design (Full day / Morning only / Afternoon only / Absent).
function deriveStatus(attendance) {
  const morning = hasMorning(attendance)
  const afternoon = hasAfternoon(attendance)

  if (morning && afternoon) return 'full_day'
  if (morning) return 'morning_only'
  if (afternoon) return 'afternoon_only'
  return 'absent'
}

function toMemberName(member) {
  return [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' ')
}

function toAttendanceItem(member, attendance) {
  const level = member.groups[0]?.level ?? null

  return {
    member: {
      id: member.id,
      firstName: member.firstName,
      middleName: member.middleName,
      lastName: member.lastName,
      name: toMemberName(member),
      level,
    },
    // One day only — no record means empty/reset fields for that date.
    attendance: {
      id: attendance?.id ?? null,
      date: attendance?.date ?? null,
      morningIn: attendance?.morningIn ?? null,
      morningOut: attendance?.morningOut ?? null,
      afternoonIn: attendance?.afternoonIn ?? null,
      afternoonOut: attendance?.afternoonOut ?? null,
      status: deriveStatus(attendance),
    },
  }
}

function buildSummary(totalMembers, attendances) {
  let fullDay = 0
  let morningOnly = 0
  let afternoonOnly = 0

  for (const row of attendances) {
    const status = deriveStatus(row)
    if (status === 'full_day') fullDay += 1
    else if (status === 'morning_only') morningOnly += 1
    else if (status === 'afternoon_only') afternoonOnly += 1
  }

  const present = fullDay + morningOnly + afternoonOnly
  const absent = Math.max(totalMembers - present, 0)
  const partial = morningOnly + afternoonOnly
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
  const { date, search, level } = query

  const [members, total, allMemberCount, attendancesForSummary, levelRows, levels] =
    await Promise.all([
      attendanceRepository.findMembers({ skip, limit, search, level }),
      attendanceRepository.countMembers({ search, level }),
      attendanceRepository.countMembers({}),
      attendanceRepository.findAllAttendancesForDate(date),
      attendanceRepository.countMembersGroupedByLevel(),
      attendanceRepository.findAllLevels(),
    ])

  const pageAttendances = await attendanceRepository.findAttendancesByMemberIds(
    members.map((m) => m.id),
    date,
  )
  const attendanceByMemberId = new Map(pageAttendances.map((row) => [row.memberId, row]))

  const levelCountMap = new Map()
  for (const member of levelRows) {
    const levelId = member.groups[0]?.levelId
    if (!levelId) continue
    levelCountMap.set(levelId, (levelCountMap.get(levelId) ?? 0) + 1)
  }
  const levelCounts = levels.map((l) => ({
    id: l.id,
    name: l.name,
    count: levelCountMap.get(l.id) ?? 0,
  }))

  return {
    date: attendanceRepository.toDateOnly(date),
    summary: buildSummary(allMemberCount, attendancesForSummary),
    levels: [{ id: null, name: 'All Members', count: allMemberCount }, ...levelCounts],
    items: members.map((member) =>
      toAttendanceItem(member, attendanceByMemberId.get(member.id)),
    ),
    meta: buildMeta({ page, limit, total }),
  }
}

async function upsertAttendance(memberId, data, actorId) {
  const member = await attendanceRepository.memberExists(memberId)
  if (!member) {
    throw AppError.notFound('Member not found')
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
    id: attendance.id,
    memberId: attendance.memberId,
    date: attendance.date,
    morningIn: attendance.morningIn,
    morningOut: attendance.morningOut,
    afternoonIn: attendance.afternoonIn,
    afternoonOut: attendance.afternoonOut,
    status: deriveStatus(attendance),
  }
}

module.exports = {
  listAttendance,
  upsertAttendance,
  deriveStatus,
}
