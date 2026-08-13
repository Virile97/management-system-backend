import { describe, it, expect, vi, afterEach } from 'vitest'

const dashboardRepository = require('../../src/modules/dashboard/dashboard.repository')
const dashboardService = require('../../src/modules/dashboard/dashboard.service')

describe('dashboard.service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    dashboardService._clearStatsCache()
  })

  describe('getStats', () => {
    it('combines member counts and monthly income into a single stats object', async () => {
      vi.spyOn(dashboardRepository, 'countMembers').mockResolvedValue(347)
      vi.spyOn(dashboardRepository, 'countMembersByStatusName').mockImplementation((name) =>
        Promise.resolve(name === 'Active' ? 289 : 41),
      )
      vi.spyOn(dashboardRepository, 'sumTransactionsByTypeName').mockResolvedValue({
        _sum: { amount: '17300' },
      })

      const stats = await dashboardService.getStats()

      expect(stats).toEqual({
        totalMembers: 347,
        activeMembers: 289,
        inactiveMembers: 41,
        monthlyIncome: 17300,
        monthlyIncomeFormatted: '₱17,300',
      })
    })

    it('defaults monthlyIncome to 0 when there are no matching transactions', async () => {
      vi.spyOn(dashboardRepository, 'countMembers').mockResolvedValue(0)
      vi.spyOn(dashboardRepository, 'countMembersByStatusName').mockResolvedValue(0)
      vi.spyOn(dashboardRepository, 'sumTransactionsByTypeName').mockResolvedValue({
        _sum: { amount: null },
      })

      const stats = await dashboardService.getStats()

      expect(stats.monthlyIncome).toBe(0)
      expect(stats.monthlyIncomeFormatted).toBe('₱0')
    })

    it('serves a second call from cache without hitting the repository again', async () => {
      vi.spyOn(dashboardRepository, 'countMembers').mockResolvedValue(5)
      vi.spyOn(dashboardRepository, 'countMembersByStatusName').mockResolvedValue(1)
      vi.spyOn(dashboardRepository, 'sumTransactionsByTypeName').mockResolvedValue({
        _sum: { amount: '100' },
      })

      await dashboardService.getStats()
      await dashboardService.getStats()

      expect(dashboardRepository.countMembers).toHaveBeenCalledTimes(1)
    })
  })

  describe('getMemberBreakdown', () => {
    it('returns the SQL aggregated breakdown shape', async () => {
      vi.spyOn(dashboardRepository, 'summarizeMembersByStatus').mockResolvedValue({
        total: 347,
        breakdown: [
          { status: 'Active', count: 289, percentage: 83.3 },
          { status: 'Deceased', count: 17, percentage: 4.9 },
          { status: 'Inactive', count: 41, percentage: 11.8 },
        ],
      })

      const breakdown = await dashboardService.getMemberBreakdown()

      expect(breakdown).toEqual({
        total: 347,
        breakdown: [
          { status: 'Active', count: 289, percentage: 83.3 },
          { status: 'Deceased', count: 17, percentage: 4.9 },
          { status: 'Inactive', count: 41, percentage: 11.8 },
        ],
      })
    })

    it('returns an empty breakdown when no statuses exist', async () => {
      vi.spyOn(dashboardRepository, 'summarizeMembersByStatus').mockResolvedValue({
        total: 0,
        breakdown: [],
      })

      const breakdown = await dashboardService.getMemberBreakdown()

      expect(breakdown).toEqual({ total: 0, breakdown: [] })
    })
  })

  describe('getFinanceSummary', () => {
    it('buckets income and expense totals by month', async () => {
      const now = new Date()

      vi.spyOn(dashboardRepository, 'sumTransactionsByMonthAndType').mockResolvedValue([
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          type: 'Income',
          amount: 125,
        },
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          type: 'Expense',
          amount: 40,
        },
      ])

      const summary = await dashboardService.getFinanceSummary('3m')

      expect(summary).toHaveLength(3)
      const currentBucket = summary[summary.length - 1]
      expect(currentBucket.income).toBe(125)
      expect(currentBucket.expense).toBe(40)
      expect(currentBucket).not.toHaveProperty('key')
    })

    it('produces zeroed buckets for every month in range when there is no data', async () => {
      vi.spyOn(dashboardRepository, 'sumTransactionsByMonthAndType').mockResolvedValue([])

      const summary = await dashboardService.getFinanceSummary('6m')

      expect(summary).toHaveLength(6)
      for (const bucket of summary) {
        expect(bucket.income).toBe(0)
        expect(bucket.expense).toBe(0)
        expect(bucket).not.toHaveProperty('key')
      }
    })

    it('ignores monthly totals that fall outside the requested range buckets', async () => {
      const now = new Date()

      vi.spyOn(dashboardRepository, 'sumTransactionsByMonthAndType').mockResolvedValue([
        {
          year: now.getFullYear() - 5,
          month: now.getMonth() + 1,
          type: 'Income',
          amount: 999,
        },
      ])

      const summary = await dashboardService.getFinanceSummary('6m')

      const total = summary.reduce((sum, bucket) => sum + bucket.income, 0)
      expect(total).toBe(0)
    })
  })

  describe('getRecentActivity', () => {
    it('maps activity log rows to display items, appending who performed the action', async () => {
      vi.spyOn(dashboardRepository, 'findRecentActivityLogs').mockResolvedValue([
        {
          id: 'a1',
          action: 'MEMBER_REGISTERED',
          message: 'New member registered',
          detail: 'Margaret Osei',
          createdAt: new Date('2026-08-04T08:00:00Z'),
          actor: { id: 'u1', name: 'Admin User', email: 'admin@example.com' },
        },
        {
          id: 'a2',
          action: 'INCOME_RECORDED',
          message: 'Tithe recorded',
          detail: '$2,400 received',
          createdAt: new Date('2026-08-04T05:00:00Z'),
          actor: null,
        },
      ])

      const activity = await dashboardService.getRecentActivity(5)

      expect(activity).toEqual([
        {
          type: 'MEMBER_REGISTERED',
          message: 'New member registered by Admin User',
          detail: 'Margaret Osei',
          timestamp: new Date('2026-08-04T08:00:00Z'),
        },
        {
          type: 'INCOME_RECORDED',
          message: 'Tithe recorded',
          detail: '$2,400 received',
          timestamp: new Date('2026-08-04T05:00:00Z'),
        },
      ])
    })

    it('falls back to the actor email when name is not set', async () => {
      vi.spyOn(dashboardRepository, 'findRecentActivityLogs').mockResolvedValue([
        {
          id: 'a1',
          action: 'MEMBER_REGISTERED',
          message: 'New member registered',
          detail: 'Grace Mensah',
          createdAt: new Date('2026-08-04T08:00:00Z'),
          actor: { id: 'u2', name: null, email: 'staff@example.com' },
        },
      ])

      const activity = await dashboardService.getRecentActivity(5)

      expect(activity[0].message).toBe('New member registered by staff@example.com')
    })

    it('passes the requested limit through to the repository', async () => {
      vi.spyOn(dashboardRepository, 'findRecentActivityLogs').mockResolvedValue([])

      await dashboardService.getRecentActivity(5)

      expect(dashboardRepository.findRecentActivityLogs).toHaveBeenCalledWith(5)
    })

    it('returns an empty array when there is no activity yet', async () => {
      vi.spyOn(dashboardRepository, 'findRecentActivityLogs').mockResolvedValue([])

      const activity = await dashboardService.getRecentActivity(5)

      expect(activity).toEqual([])
    })
  })

  describe('getOverview', () => {
    it('returns one object with all dashboard sections', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 12, 0, 0)))

      vi.spyOn(dashboardRepository, 'countMembers').mockResolvedValue(10)
      vi.spyOn(dashboardRepository, 'countMembersByStatusName').mockImplementation((name) =>
        Promise.resolve(name === 'Active' ? 8 : 2),
      )
      vi.spyOn(dashboardRepository, 'sumTransactionsByTypeName').mockResolvedValue({
        _sum: { amount: '100' },
      })
      vi.spyOn(dashboardRepository, 'summarizeMembersByStatus').mockResolvedValue({
        total: 10,
        breakdown: [{ status: 'Active', count: 8, percentage: 80 }],
      })
      vi.spyOn(dashboardRepository, 'sumTransactionsByMonthAndType').mockResolvedValue([
        { year: 2026, month: 8, type: 'Income', amount: 100 },
      ])
      vi.spyOn(dashboardRepository, 'countPresentMembersByDate').mockResolvedValue([
        { date: new Date(Date.UTC(2026, 7, 11)), present: 9 },
      ])
      vi.spyOn(dashboardRepository, 'findRecentActivityLogs').mockResolvedValue([
        {
          id: 'a1',
          action: 'MEMBER_REGISTERED',
          message: 'New member registered',
          detail: 'Jane',
          createdAt: new Date('2026-08-04T08:00:00Z'),
          actor: null,
        },
      ])

      const overview = await dashboardService.getOverview({
        financeRange: '3m',
        attendanceRange: '2w',
        activityLimit: 3,
      })

      expect(Object.keys(overview).sort()).toEqual(
        [
          'attendanceSummary',
          'financeSummary',
          'memberBreakdown',
          'recentActivity',
          'stats',
        ].sort(),
      )
      expect(overview.stats).toMatchObject({
        totalMembers: 10,
        activeMembers: 8,
        monthlyIncome: 100,
      })
      expect(overview.memberBreakdown.total).toBe(10)
      expect(overview.financeSummary).toHaveLength(3)
      expect(overview.attendanceSummary).toHaveLength(2)
      expect(overview.recentActivity).toHaveLength(1)
      expect(dashboardRepository.findRecentActivityLogs).toHaveBeenCalledWith(3)
      expect(dashboardRepository.sumTransactionsByMonthAndType).toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('getAttendanceSummary', () => {
    it('returns weekly attendance percentages for the requested range', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 12, 0, 0)))

      vi.spyOn(dashboardRepository, 'countMembers').mockResolvedValue(100)
      vi.spyOn(dashboardRepository, 'countPresentMembersByDate').mockResolvedValue([
        { date: new Date(Date.UTC(2026, 7, 11)), present: 90 },
        { date: new Date(Date.UTC(2026, 7, 4)), present: 80 },
      ])

      const summary = await dashboardService.getAttendanceSummary('5w')

      expect(summary).toHaveLength(5)
      expect(summary[0]).toMatchObject({ label: 'Jul 13', percentage: 0 })
      expect(summary[3]).toMatchObject({ label: 'Aug 3', percentage: 80 })
      expect(summary[4]).toMatchObject({ label: 'Aug 10', percentage: 90 })
      expect(summary[4]).not.toHaveProperty('key')
      expect(summary[4]).not.toHaveProperty('_dailyRates')

      vi.useRealTimers()
    })

    it('averages daily rates within a week', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 12, 12, 0, 0)))

      vi.spyOn(dashboardRepository, 'countMembers').mockResolvedValue(100)
      vi.spyOn(dashboardRepository, 'countPresentMembersByDate').mockResolvedValue([
        { date: new Date(Date.UTC(2026, 7, 10)), present: 1 },
        { date: new Date(Date.UTC(2026, 7, 11)), present: 2 },
      ])

      const summary = await dashboardService.getAttendanceSummary('1w')

      // Day1: 1%, Day2: 2% → average 1.5
      expect(summary).toHaveLength(1)
      expect(summary[0].percentage).toBe(1.5)

      vi.useRealTimers()
    })
  })
})
