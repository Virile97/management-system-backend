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
    it('returns one attendance object per member for the selected day', async () => {
      const date = new Date('2026-08-11')

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
          firstName: 'Emmanuel',
          middleName: null,
          lastName: 'Boateng',
          groups: [{ level: { id: 'l1', name: 'Men' } }],
        },
      ])
      vi.spyOn(attendanceRepository, 'countMembers').mockImplementation(async (filter = {}) =>
        Object.keys(filter).length === 0 ? 3 : 2,
      )
      vi.spyOn(attendanceRepository, 'findAttendancesByMemberIds').mockResolvedValue([
        {
          id: 'a1',
          memberId: 'm1',
          date,
          morningIn: new Date('2026-08-11T08:00:00.000Z'),
          morningOut: new Date('2026-08-11T12:00:00.000Z'),
          afternoonIn: new Date('2026-08-11T13:00:00.000Z'),
          afternoonOut: new Date('2026-08-11T17:00:00.000Z'),
        },
      ])
      vi.spyOn(attendanceRepository, 'findAllAttendancesForDate').mockResolvedValue([
        {
          memberId: 'm1',
          morningIn: new Date(),
          morningOut: new Date(),
          afternoonIn: new Date(),
          afternoonOut: new Date(),
        },
      ])
      vi.spyOn(attendanceRepository, 'countMembersGroupedByLevel').mockResolvedValue([
        { groups: [{ levelId: 'l1' }] },
        { groups: [{ levelId: 'l1' }] },
        { groups: [] },
      ])
      vi.spyOn(attendanceRepository, 'findAllLevels').mockResolvedValue([
        { id: 'l1', name: 'Men' },
        { id: 'l2', name: 'Ladies' },
      ])

      const result = await attendanceService.listAttendance({ date })

      expect(result.date).toEqual(new Date(Date.UTC(2026, 7, 11)))
      expect(result.summary).toMatchObject({
        totalMembers: 3,
        present: 1,
        fullDay: 1,
        absent: 2,
      })
      expect(result.items[0].attendance.status).toBe('full_day')
      expect(result.items[1].attendance.status).toBe('absent')
      expect(result.items[1].attendance.morningIn).toBeNull()
    })
  })
})
