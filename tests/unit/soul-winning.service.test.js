import { describe, it, expect, vi, afterEach } from 'vitest'

const soulWinningRepository = require('../../src/modules/soul-winning/soul-winning.repository')
const memberRepository = require('../../src/modules/members/member.repository')
const soulWinningService = require('../../src/modules/soul-winning/soul-winning.service')

describe('soul-winning.service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('response mapping', () => {
    it('shapes a New Convert record for the UI', () => {
      const record = soulWinningService._toRecordResponse({
        id: 'sw1',
        firstName: 'Ama',
        middleName: null,
        lastName: 'Kufuor',
        contact: '0244123456',
        location: 'Madina, Accra',
        age: 24,
        event: 'Campus Outreach',
        notes: 'Met at community outreach',
        wonAt: new Date('2026-08-04'),
        baptizedAt: null,
        status: 'New Convert',
        memberId: null,
        winners: [
          { id: 'm1', firstName: 'Kofi', lastName: 'Agyeman' },
          { id: 'm2', firstName: 'Abena', lastName: 'Mensah' },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      expect(record.status).toBe('New Convert')
      expect(record.convert.name).toBe('Ama Kufuor')
      expect(record.convert.age).toBe(24)
      expect(record.age).toBe(24)
      expect(record.event).toBe('Campus Outreach')
      expect(record.soulWinners).toHaveLength(2)
      expect(record.soulWinner.name).toBe('Kofi Agyeman')
      expect(record.memberId).toBeNull()
    })

    it('computes retention percent', () => {
      expect(soulWinningService._retentionRate(2, 5)).toBe(40)
      expect(soulWinningService._retentionRate(0, 0)).toBe(0)
    })
  })

  describe('getOverview', () => {
    it('returns KPIs, retention bar counts, and annual goal with pace breakdown', async () => {
      vi.spyOn(soulWinningRepository, 'summarizeOverview')
        .mockResolvedValueOnce({
          total: 5,
          newConverts: 3,
          activeMembers: 2,
          inactiveMembers: 0,
        })
        .mockResolvedValueOnce({
          total: 47,
          newConverts: 0,
          activeMembers: 0,
          inactiveMembers: 0,
        })
      vi.spyOn(soulWinningRepository, 'findAnnualGoal').mockResolvedValue({
        id: 'g1',
        targetCount: 120,
      })

      const overview = await soulWinningService.getOverview({ period: 'month', year: 2026 })

      expect(overview.year).toBe(2026)
      expect(overview.stats).toMatchObject({
        totalSoulsWon: 5,
        newConverts: 3,
        newConvertsPercent: 60,
        nowActiveMembers: 2,
        baptized: 2,
        baptismPercent: 40,
        activeRetentionPercent: 100,
        wentInactive: 0,
      })
      expect(overview.retention).toEqual({
        baptism: {
          title: 'Souls Won vs. Baptism',
          basis: 'baptism',
          soulsWon: 5,
          baptized: 2,
          awaitingBaptism: 3,
          baptismPercent: 40,
        },
        active: {
          title: 'Baptism vs. Active Retention',
          basis: 'active',
          baptized: 2,
          active: 2,
          inactive: 0,
          activeRetentionPercent: 100,
        },
      })
      expect(overview.goal).toMatchObject({
        year: 2026,
        title: 'Annual Soul Winning Goal — 2026',
        targetCount: 120,
        currentCount: 47,
        remaining: 73,
        progressPercent: 39,
        breakdown: { perMonth: 10, perWeek: 2, perDay: 0 },
      })
    })

    it('returns a year stub when no goal exists (no cross-year fallback)', async () => {
      vi.spyOn(soulWinningRepository, 'summarizeOverview')
        .mockResolvedValueOnce({
          total: 2,
          newConverts: 1,
          activeMembers: 1,
          inactiveMembers: 0,
        })
        .mockResolvedValueOnce({
          total: 11,
          newConverts: 0,
          activeMembers: 0,
          inactiveMembers: 0,
        })
      vi.spyOn(soulWinningRepository, 'findAnnualGoal').mockResolvedValue(null)

      const overview = await soulWinningService.getOverview({
        period: 'custom',
        year: 2025,
      })

      expect(soulWinningRepository.findAnnualGoal).toHaveBeenCalledWith(2025)
      expect(overview.year).toBe(2025)
      expect(overview.goal).toEqual({
        year: 2025,
        title: 'Annual Soul Winning Goal — 2025',
        targetCount: null,
        currentCount: 11,
        remaining: null,
        progressPercent: 0,
        breakdown: null,
      })
    })
  })

  describe('annual goal breakdown', () => {
    it('splits yearly target into month / week / day pace', () => {
      const goal = soulWinningService._buildAnnualGoalView(
        { id: 'g1', targetCount: 120 },
        { year: 2026, currentCount: 47 },
      )

      expect(goal.breakdown).toEqual({ perMonth: 10, perWeek: 2, perDay: 0 })
      expect(goal.remaining).toBe(73)
    })

    it('builds an add-goal stub when no target exists for the year', () => {
      const goal = soulWinningService._buildAnnualGoalView(null, {
        year: 2025,
        currentCount: 11,
      })

      expect(goal).toEqual({
        year: 2025,
        title: 'Annual Soul Winning Goal — 2025',
        targetCount: null,
        currentCount: 11,
        remaining: null,
        progressPercent: 0,
        breakdown: null,
      })
    })
  })

  describe('getTrends monthly period filter', () => {
    function mockTrendsRepos() {
      vi.spyOn(soulWinningRepository, 'sumTrendByDay').mockResolvedValue({
        soulsWon: [],
        becameActive: [],
      })
      vi.spyOn(soulWinningRepository, 'sumBaptismRetentionByDay').mockResolvedValue([])
      vi.spyOn(soulWinningRepository, 'sumBaptismRetentionByMonth').mockResolvedValue([])
      vi.spyOn(soulWinningRepository, 'summarizeBaptismRetention').mockResolvedValue({
        baptized: 0,
        active: 0,
        inactive: 0,
      })
      vi.spyOn(soulWinningRepository, 'sumLeaderboard').mockResolvedValue([])
    }

    it('builds 12 month buckets for the requested year', () => {
      const buckets = soulWinningService._buildYearMonthBuckets(2025)
      expect(buckets).toHaveLength(12)
      expect(buckets[0]).toMatchObject({ label: 'Jan', month: 1, year: 2025 })
      expect(buckets[11]).toMatchObject({ label: 'Dec', month: 12, year: 2025 })
    })

    it('intersects custom range with calendar year', () => {
      const yearRange = {
        start: new Date(2025, 0, 1),
        end: new Date(2025, 11, 31, 23, 59, 59, 999),
      }
      const custom = {
        start: new Date(2025, 2, 1),
        end: new Date(2025, 4, 31, 23, 59, 59, 999),
      }
      const hit = soulWinningService._intersectDateRanges(yearRange, custom)
      expect(hit.empty).toBe(false)
      expect(hit.start.getMonth()).toBe(2)
      expect(hit.end.getMonth()).toBe(4)

      const miss = soulWinningService._intersectDateRanges(yearRange, {
        start: new Date(2026, 0, 1),
        end: new Date(2026, 11, 31),
      })
      expect(miss.empty).toBe(true)
    })

    it('returns full-year monthly series filtered by custom Mar–May 2025', async () => {
      mockTrendsRepos()
      const sumTrendByMonth = vi
        .spyOn(soulWinningRepository, 'sumTrendByMonth')
        .mockResolvedValue({
          soulsWon: [
            { year: 2025, month: 3, count: 2 },
            { year: 2025, month: 4, count: 1 },
          ],
          becameActive: [{ year: 2025, month: 3, count: 1 }],
        })
      vi.spyOn(soulWinningRepository, 'sumBaptismRetentionByMonth').mockResolvedValue([
        { year: 2025, month: 3, baptized: 1, active: 1, inactive: 0 },
      ])

      const trends = await soulWinningService.getTrends({
        period: 'custom',
        from: new Date('2025-03-01'),
        to: new Date('2025-05-31'),
        year: 2025,
      })

      expect(trends.year).toBe(2025)
      expect(trends.monthly).toHaveLength(12)
      expect(sumTrendByMonth).toHaveBeenCalledWith(
        expect.objectContaining({
          start: expect.any(Date),
          end: expect.any(Date),
        }),
      )
      const call = sumTrendByMonth.mock.calls[0][0]
      expect(call.start.getFullYear()).toBe(2025)
      expect(call.start.getMonth()).toBe(2)
      expect(call.end.getMonth()).toBe(4)

      expect(trends.monthly[2]).toMatchObject({
        label: 'Mar',
        month: 3,
        year: 2025,
        professionsOfFaith: 2,
        baptism: 1,
        activeRetention: 1,
        wentInactive: 0,
      })
      expect(trends.monthly[3]).toMatchObject({
        month: 4,
        professionsOfFaith: 1,
        baptism: 0,
        activeRetention: 0,
        wentInactive: 0,
      })
      expect(trends.monthly[0]).toMatchObject({
        month: 1,
        professionsOfFaith: 0,
        baptism: 0,
        activeRetention: 0,
        wentInactive: 0,
      })
      expect(trends.monthly[11]).toMatchObject({
        month: 12,
        professionsOfFaith: 0,
        baptism: 0,
      })
    })

    it('skips monthly query when year and period do not overlap', async () => {
      mockTrendsRepos()
      const sumTrendByMonth = vi.spyOn(soulWinningRepository, 'sumTrendByMonth')

      const trends = await soulWinningService.getTrends({
        period: 'custom',
        from: new Date('2026-01-01'),
        to: new Date('2026-12-31'),
        year: 2024,
      })

      expect(sumTrendByMonth).not.toHaveBeenCalled()
      expect(trends.monthly).toHaveLength(12)
      expect(
        trends.monthly.every(
          (m) =>
            m.professionsOfFaith === 0 &&
            m.baptism === 0 &&
            m.activeRetention === 0 &&
            m.wentInactive === 0,
        ),
      ).toBe(true)
    })
  })

  describe('createRecord', () => {
    it('rejects a winner that is not a member', async () => {
      vi.spyOn(soulWinningRepository, 'membersExist').mockResolvedValue(false)

      await expect(
        soulWinningService.createRecord(
          { firstName: 'Ama', lastName: 'Kufuor', winnerMemberIds: ['m1'] },
          'u1',
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_WINNER' })
    })
  })

  describe('baptizeRecord', () => {
    it('rejects when already baptized', async () => {
      vi.spyOn(soulWinningRepository, 'findRawById').mockResolvedValue({
        id: 'sw1',
        memberId: 'm9',
        firstName: 'Ama',
        lastName: 'Kufuor',
      })

      await expect(soulWinningService.baptizeRecord('sw1', {}, 'u1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_BAPTIZED',
      })
    })

    it('rejects when a member with the same name already exists', async () => {
      vi.spyOn(soulWinningRepository, 'findRawById').mockResolvedValue({
        id: 'sw1',
        memberId: null,
        firstName: 'Ama',
        lastName: 'Kufuor',
      })
      vi.spyOn(memberRepository, 'findByName').mockResolvedValue({ id: 'existing' })

      await expect(soulWinningService.baptizeRecord('sw1', {}, 'u1')).rejects.toMatchObject({
        statusCode: 409,
        code: 'MEMBER_NAME_EXISTS',
      })
    })

    it('returns linked member and snapshot after successful baptism', async () => {
      vi.spyOn(soulWinningRepository, 'findRawById').mockResolvedValue({
        id: 'sw1',
        memberId: null,
        firstName: 'Ama',
        middleName: null,
        lastName: 'Kufuor',
        contact: '0244',
        location: 'Madina',
      })
      vi.spyOn(memberRepository, 'findByName').mockResolvedValue(null)
      vi.spyOn(soulWinningRepository, 'baptize').mockResolvedValue({
        soulWin: { id: 'sw1', memberId: 'm2' },
        member: {
          id: 'm2',
          firstName: 'Ama',
          lastName: 'Kufuor',
          isBaptized: true,
          baptizedAt: new Date('2026-08-14'),
          status: { id: 's1', name: 'Active' },
        },
      })
      vi.spyOn(soulWinningRepository, 'findById').mockResolvedValue({
        id: 'sw1',
        firstName: 'Ama',
        middleName: null,
        lastName: 'Kufuor',
        contact: '0244',
        location: 'Madina',
        age: 24,
        event: 'Campus Outreach',
        notes: null,
        wonAt: new Date('2026-08-04'),
        baptizedAt: new Date('2026-08-14'),
        status: 'Active Member',
        memberId: 'm2',
        winners: [{ id: 'm1', firstName: 'Kofi', lastName: 'Agyeman' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      vi.spyOn(soulWinningRepository, 'findAnnualGoal').mockResolvedValue({
        id: 'g1',
        targetCount: 120,
      })
      vi.spyOn(soulWinningRepository, 'summarizeOverview').mockResolvedValue({
        total: 5,
        newConverts: 2,
        activeMembers: 3,
        inactiveMembers: 0,
      })

      const result = await soulWinningService.baptizeRecord('sw1', {}, 'u1')

      expect(result.record.status).toBe('Active Member')
      expect(result.member.id).toBe('m2')
      expect(result.member.status.name).toBe('Active')
      expect(result.snapshot.stats.totalSoulsWon).toBe(5)
      expect(result.snapshot.goal.targetCount).toBe(120)
    })
  })
})
