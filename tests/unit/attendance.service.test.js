import { describe, it, expect, vi, afterEach } from 'vitest'

const attendanceRepository = require('../../src/modules/attendance/attendance.repository')
const attendanceService = require('../../src/modules/attendance/attendance.service')

describe('attendance.service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('deriveStatus', () => {
    it('returns full_day when both sessions have times', () => {
      expect(
        attendanceService.deriveStatus({
          morningIn: new Date(),
          afternoonIn: new Date(),
        }),
      ).toBe('full_day')
    })

    it('returns morning_only when only morning is set', () => {
      expect(attendanceService.deriveStatus({ morningIn: new Date() })).toBe('morning_only')
    })

    it('returns absent when no times are set', () => {
      expect(attendanceService.deriveStatus(null)).toBe('absent')
      expect(attendanceService.deriveStatus({})).toBe('absent')
    })
  })

  describe('upsertAttendance', () => {
    it('throws not found when the member does not exist', async () => {
      vi.spyOn(attendanceRepository, 'memberExists').mockResolvedValue(null)

      await expect(
        attendanceService.upsertAttendance(
          'm1',
          { date: new Date('2026-08-11'), morningIn: new Date() },
          'actor-1',
        ),
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it('upserts only the times sent and returns derived status', async () => {
      const date = new Date('2026-08-11')
      const morningIn = new Date('2026-08-11T08:02:00.000Z')

      vi.spyOn(attendanceRepository, 'memberExists').mockResolvedValue({ id: 'm1' })
      vi.spyOn(attendanceRepository, 'upsertByMemberAndDate').mockResolvedValue({
        id: 'a1',
        memberId: 'm1',
        date,
        morningIn,
        morningOut: null,
        afternoonIn: null,
        afternoonOut: null,
      })

      const result = await attendanceService.upsertAttendance(
        'm1',
        { date, morningIn },
        'actor-1',
      )

      expect(attendanceRepository.upsertByMemberAndDate).toHaveBeenCalledWith({
        memberId: 'm1',
        date,
        morningIn,
        morningOut: undefined,
        afternoonIn: undefined,
        afternoonOut: undefined,
        recordedBy: 'actor-1',
      })
      expect(result.status).toBe('morning_only')
      expect(result.morningOut).toBeNull()
    })
  })

  describe('listAttendance', () => {
    it('uses default name order when no search/level filter is applied', async () => {
      const from = new Date('2026-08-12')
      const to = new Date('2026-08-12')

      vi.spyOn(attendanceRepository, 'findMembers').mockResolvedValue([
        {
          id: 'm2',
          firstName: 'Emmanuel',
          middleName: null,
          lastName: 'Boateng',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
        {
          id: 'm1',
          firstName: 'Pastor',
          middleName: null,
          lastName: 'Admin',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
      ])
      const prioritizeSpy = vi.spyOn(
        attendanceRepository,
        'findMembersPrioritizedByAttendance',
      )
      vi.spyOn(attendanceRepository, 'countMembers').mockImplementation(async (filter = {}) =>
        Object.keys(filter).length === 0 ? 3 : 2,
      )
      vi.spyOn(attendanceRepository, 'findAttendancesByMemberIds').mockResolvedValue([
        {
          id: 'a1',
          memberId: 'm1',
          date: from,
          morningIn: new Date('2026-08-12T08:00:00.000Z'),
          morningOut: new Date('2026-08-12T12:00:00.000Z'),
          afternoonIn: new Date('2026-08-12T13:00:00.000Z'),
          afternoonOut: new Date('2026-08-12T17:00:00.000Z'),
        },
      ])
      vi.spyOn(attendanceRepository, 'summarizeAttendanceInRange').mockResolvedValue({
        fullDay: 1,
        morningOnly: 0,
        afternoonOnly: 0,
        partialMixed: 0,
      })
      vi.spyOn(attendanceRepository, 'countMembersByLevel').mockResolvedValue([
        { id: 'l1', name: 'Men', count: 2 },
        { id: 'l2', name: 'Ladies', count: 0 },
      ])

      const result = await attendanceService.listAttendance({ from, to })

      expect(attendanceRepository.findMembers).toHaveBeenCalled()
      expect(prioritizeSpy).not.toHaveBeenCalled()
      expect(attendanceRepository.summarizeAttendanceInRange).toHaveBeenCalled()
      expect(result.items).toHaveLength(2)
      expect(result.items[0].member.id).toBe('m2')
      expect(result.items[1].member.id).toBe('m1')
      expect(result.summary).toMatchObject({
        totalMembers: 3,
        present: 1,
        fullDay: 1,
        absent: 2,
      })
      expect(result.levels[0]).toEqual({ id: null, name: 'All Members', count: 3 })
      expect(result.levels[1]).toEqual({ id: 'l1', name: 'Men', count: 2 })
      expect(result.meta.total).toBe(2)
    })

    it('prioritizes present members when a search or level filter is applied', async () => {
      const from = new Date('2026-08-12')
      const to = new Date('2026-08-12')

      vi.spyOn(attendanceRepository, 'findMembersPrioritizedByAttendance').mockResolvedValue([
        {
          id: 'm1',
          firstName: 'Pastor',
          middleName: null,
          lastName: 'Admin',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
        {
          id: 'm2',
          firstName: 'Emmanuel',
          middleName: null,
          lastName: 'Boateng',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
      ])
      vi.spyOn(attendanceRepository, 'countMembers').mockResolvedValue(2)
      vi.spyOn(attendanceRepository, 'findAttendancesByMemberIds').mockResolvedValue([
        {
          id: 'a1',
          memberId: 'm1',
          date: from,
          morningIn: new Date('2026-08-12T08:00:00.000Z'),
          morningOut: new Date('2026-08-12T12:00:00.000Z'),
          afternoonIn: new Date('2026-08-12T13:00:00.000Z'),
          afternoonOut: new Date('2026-08-12T17:00:00.000Z'),
        },
      ])
      vi.spyOn(attendanceRepository, 'summarizeAttendanceInRange').mockResolvedValue({
        fullDay: 1,
        morningOnly: 0,
        afternoonOnly: 0,
        partialMixed: 0,
      })
      vi.spyOn(attendanceRepository, 'countMembersByLevel').mockResolvedValue([])

      const result = await attendanceService.listAttendance({
        from,
        to,
        level: 'l1',
      })

      expect(attendanceRepository.findMembersPrioritizedByAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'l1',
          from: new Date(Date.UTC(2026, 7, 12)),
          to: new Date(Date.UTC(2026, 7, 12)),
        }),
      )
      expect(result.items[0].attendance.status).toBe('full_day')
      expect(result.items[1].attendance.status).toBe('absent')
    })

    it('keeps the same list response contract for single-day results', async () => {
      const from = new Date('2026-08-12')
      const to = new Date('2026-08-12')

      vi.spyOn(attendanceRepository, 'findMembers').mockResolvedValue([
        {
          id: 'm1',
          firstName: 'Pastor',
          middleName: null,
          lastName: 'Admin',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
        {
          id: 'm2',
          firstName: 'Absent',
          middleName: null,
          lastName: 'Member',
          groups: [],
        },
      ])
      vi.spyOn(attendanceRepository, 'countMembers').mockResolvedValue(2)
      vi.spyOn(attendanceRepository, 'findAttendancesByMemberIds').mockResolvedValue([
        {
          id: 'a1',
          memberId: 'm1',
          date: from,
          morningIn: new Date('2026-08-12T08:00:00.000Z'),
          morningOut: null,
          afternoonIn: null,
          afternoonOut: null,
        },
      ])
      vi.spyOn(attendanceRepository, 'summarizeAttendanceInRange').mockResolvedValue({
        fullDay: 0,
        morningOnly: 1,
        afternoonOnly: 0,
        partialMixed: 0,
      })
      vi.spyOn(attendanceRepository, 'countMembersByLevel').mockResolvedValue([
        { id: 'l1', name: 'Men', count: 1 },
      ])

      const result = await attendanceService.listAttendance({ from, to })

      expect(Object.keys(result).sort()).toEqual(
        ['items', 'levels', 'meta', 'period', 'summary'].sort(),
      )
      expect(result.period).toEqual({
        from: new Date(Date.UTC(2026, 7, 12)),
        to: new Date(Date.UTC(2026, 7, 12)),
      })
      expect(result.summary).toEqual({
        totalMembers: 2,
        present: 1,
        attendanceRate: 50,
        fullDay: 0,
        partial: 1,
        morningOnly: 1,
        afternoonOnly: 0,
        absent: 1,
      })
      expect(result.levels).toEqual([
        { id: null, name: 'All Members', count: 2 },
        { id: 'l1', name: 'Men', count: 1 },
      ])
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 2,
        totalPages: 1,
      })
      expect(result.items[0]).toEqual({
        member: {
          id: 'm1',
          firstName: 'Pastor',
          middleName: null,
          lastName: 'Admin',
          name: 'Pastor Admin',
          level: { id: 'l1', name: 'Men' },
        },
        attendance: {
          id: 'a1',
          date: from,
          morningIn: new Date('2026-08-12T08:00:00.000Z'),
          morningOut: null,
          afternoonIn: null,
          afternoonOut: null,
          status: 'morning_only',
        },
      })
      expect(result.items[1]).toEqual({
        member: {
          id: 'm2',
          firstName: 'Absent',
          middleName: null,
          lastName: 'Member',
          name: 'Absent Member',
          level: null,
        },
        attendance: {
          id: null,
          date: null,
          morningIn: null,
          morningOut: null,
          afternoonIn: null,
          afternoonOut: null,
          status: 'absent',
        },
      })
      expect(result.items[0].attendances).toBeUndefined()
    })

    it('returns attendances arrays for a multi-day range', async () => {
      const from = new Date('2026-08-11')
      const to = new Date('2026-08-12')

      vi.spyOn(attendanceRepository, 'findMembers').mockResolvedValue([
        {
          id: 'm1',
          firstName: 'Pastor',
          middleName: null,
          lastName: 'Admin',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
      ])
      vi.spyOn(attendanceRepository, 'countMembers').mockResolvedValue(1)
      vi.spyOn(attendanceRepository, 'findAttendancesByMemberIds').mockResolvedValue([
        {
          id: 'a1',
          memberId: 'm1',
          date: from,
          morningIn: new Date('2026-08-11T08:00:00.000Z'),
          morningOut: null,
          afternoonIn: null,
          afternoonOut: null,
        },
        {
          id: 'a2',
          memberId: 'm1',
          date: to,
          morningIn: new Date('2026-08-12T08:00:00.000Z'),
          morningOut: null,
          afternoonIn: new Date('2026-08-12T13:00:00.000Z'),
          afternoonOut: null,
        },
      ])
      vi.spyOn(attendanceRepository, 'summarizeAttendanceInRange').mockResolvedValue({
        fullDay: 1,
        morningOnly: 0,
        afternoonOnly: 0,
        partialMixed: 0,
      })
      vi.spyOn(attendanceRepository, 'countMembersByLevel').mockResolvedValue([
        { id: 'l1', name: 'Men', count: 1 },
      ])

      const result = await attendanceService.listAttendance({ from, to })

      expect(result.items[0].attendances).toHaveLength(2)
      expect(result.items[0].attendance).toBeUndefined()
      expect(result.summary.fullDay).toBe(1)
    })
  })
})
