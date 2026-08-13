/**
 * Shared attendance DTO helpers used by attendance list + member detail.
 */

function hasMorning(attendance) {
  return Boolean(attendance?.morningIn || attendance?.morningOut)
}

function hasAfternoon(attendance) {
  return Boolean(attendance?.afternoonIn || attendance?.afternoonOut)
}

function deriveStatus(attendance) {
  if (attendance?.status) return attendance.status

  const morning = hasMorning(attendance)
  const afternoon = hasAfternoon(attendance)

  if (morning && afternoon) return 'full_day'
  if (morning) return 'morning_only'
  if (afternoon) return 'afternoon_only'
  return 'absent'
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

function groupAttendancesByMemberId(rows) {
  const byMemberId = new Map()

  for (const row of rows) {
    const list = byMemberId.get(row.memberId)
    if (list) {
      list.push(row)
    } else {
      byMemberId.set(row.memberId, [row])
    }
  }

  return byMemberId
}

function toMemberName(member) {
  return [member.firstName, member.middleName, member.lastName].filter(Boolean).join(' ')
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

  if (singleDay) {
    return { ...base, attendance: toAttendanceDay(attendances[0]) }
  }

  return { ...base, attendances: attendances.map(toAttendanceDay) }
}

module.exports = {
  deriveStatus,
  toAttendanceDay,
  groupAttendancesByMemberId,
  toAttendanceItem,
}
