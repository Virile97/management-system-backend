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
        notes: 'Met at community outreach',
        wonAt: new Date('2026-08-04'),
        baptizedAt: null,
        status: 'New Convert',
        memberId: null,
        winner: { id: 'm1', firstName: 'Kofi', lastName: 'Agyeman' },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      expect(record.status).toBe('New Convert')
      expect(record.convert.name).toBe('Ama Kufuor')
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

      expect(overview.stats).toMatchObject({
        totalSoulsWon: 5,
        newConverts: 3,
        newConvertsPercent: 60,
        nowActiveMembers: 2,
        activeRetentionPercent: 40,
        wentInactive: 0,
      })
      expect(overview.retention).toEqual({
        active: 2,
        newConvert: 3,
        inactive: 0,
        activeRetentionPercent: 40,
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
  })

  describe('createRecord', () => {
    it('rejects a winner that is not a member', async () => {
      vi.spyOn(soulWinningRepository, 'memberExists').mockResolvedValue(false)

      await expect(
        soulWinningService.createRecord(
          { firstName: 'Ama', lastName: 'Kufuor', winnerMemberId: 'm1' },
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
        notes: null,
        wonAt: new Date('2026-08-04'),
        baptizedAt: new Date('2026-08-14'),
        status: 'Active Member',
        memberId: 'm2',
        winner: { id: 'm1', firstName: 'Kofi', lastName: 'Agyeman' },
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
