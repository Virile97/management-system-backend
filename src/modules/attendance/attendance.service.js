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

function toAttendanceDay(attendance) {
  return {
    id: attendance?.id ?? null,
    date: attendance?.date ?? null,
    morningIn: attendance?.morningIn ?? null,
    morningOut: attendance?.morningOut ?? null,
    afternoonIn: attendance?.afternoonIn ?? null,
    afternoonOut: attendance?.afternoonOut ?? null,
    status: deriveStatus(attendance),
  }
}

function toAttendanceItem(member, attendances, { singleDay }) {
  const level = member.groups[0]?.level ?? null
  const base = {
    member: {
      id: member.id,
      firstName: member.firstName,
      middleName: member.middleName,
      lastName: member.lastName,
      name: toMemberName(member),
      level,
    },
  }

  // Same-day range keeps the per-day grid shape (`attendance`).
  // Multi-day ranges return every day in range under `attendances`.
  if (singleDay) {
    return { ...base, attendance: toAttendanceDay(attendances[0]) }
  }

  return { ...base, attendances: attendances.map(toAttendanceDay) }
}

// Rolls a member's days in the range into one summary bucket so the cards
// still count people, not member-days.
function deriveMemberRangeStatus(attendances) {
  if (!attendances.length) return 'absent'

  const statuses = attendances.map(deriveStatus).filter((status) => status !== 'absent')
  if (statuses.length === 0) return 'absent'
  if (statuses.includes('full_day')) return 'full_day'
  if (statuses.includes('morning_only') && statuses.includes('afternoon_only')) return 'partial'
  if (statuses.every((status) => status === 'morning_only')) return 'morning_only'
  if (statuses.every((status) => status === 'afternoon_only')) return 'afternoon_only'
  return 'partial'
}

function buildSummary(totalMembers, attendances, { singleDay }) {
  if (singleDay) {
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

  const byMember = new Map()
  for (const row of attendances) {
    const list = byMember.get(row.memberId) ?? []
    list.push(row)
    byMember.set(row.memberId, list)
  }

  let fullDay = 0
  let morningOnly = 0
  let afternoonOnly = 0
  let mixedPartial = 0

  for (const rows of byMember.values()) {
    const status = deriveMemberRangeStatus(rows)
    if (status === 'full_day') fullDay += 1
    else if (status === 'morning_only') morningOnly += 1
    else if (status === 'afternoon_only') afternoonOnly += 1
    else if (status === 'partial') mixedPartial += 1
  }

  const present = fullDay + morningOnly + afternoonOnly + mixedPartial
  const absent = Math.max(totalMembers - present, 0)
  const partial = morningOnly + afternoonOnly + mixedPartial
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

  const [members, total, allMemberCount, attendancesForSummary, levelRows, levels] =
    await Promise.all([
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
      attendanceRepository.countMembers({}),
      attendanceRepository.findAllAttendancesInRange(fromDay, toDay),
      attendanceRepository.countMembersGroupedByLevel(),
      attendanceRepository.findAllLevels(),
    ])

  const pageAttendances = members.length
    ? await attendanceRepository.findAttendancesByMemberIds(
        members.map((m) => m.id),
        fromDay,
        toDay,
      )
    : []

  const attendancesByMemberId = new Map()
  for (const row of pageAttendances) {
    const list = attendancesByMemberId.get(row.memberId) ?? []
    list.push(row)
    attendancesByMemberId.set(row.memberId, list)
  }

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
    period: { from: fromDay, to: toDay },
    summary: buildSummary(allMemberCount, attendancesForSummary, { singleDay }),
    levels: [{ id: null, name: 'All Members', count: allMemberCount }, ...levelCounts],
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
