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
    it('computes total and per-status percentages', async () => {
      vi.spyOn(dashboardRepository, 'countMembersGroupedByStatus').mockResolvedValue([
        { name: 'Active', _count: { members: 289 } },
        { name: 'Inactive', _count: { members: 41 } },
        { name: 'Deceased', _count: { members: 17 } },
      ])

      const breakdown = await dashboardService.getMemberBreakdown()

      expect(breakdown.total).toBe(347)
      expect(breakdown.breakdown).toEqual([
        { status: 'Active', count: 289, percentage: 83.3 },
        { status: 'Inactive', count: 41, percentage: 11.8 },
        { status: 'Deceased', count: 17, percentage: 4.9 },
      ])
    })

    it('includes statuses with zero members instead of omitting them', async () => {
      vi.spyOn(dashboardRepository, 'countMembersGroupedByStatus').mockResolvedValue([
        { name: 'Active', _count: { members: 0 } },
        { name: 'Inactive', _count: { members: 0 } },
        { name: 'Deceased', _count: { members: 0 } },
      ])

      const breakdown = await dashboardService.getMemberBreakdown()

      expect(breakdown.total).toBe(0)
      expect(breakdown.breakdown).toHaveLength(3)
      for (const entry of breakdown.breakdown) {
        expect(entry.count).toBe(0)
        expect(entry.percentage).toBe(0)
      }
    })

    it('returns an empty breakdown when no statuses exist', async () => {
      vi.spyOn(dashboardRepository, 'countMembersGroupedByStatus').mockResolvedValue([])

      const breakdown = await dashboardService.getMemberBreakdown()

      expect(breakdown).toEqual({ total: 0, breakdown: [] })
    })
  })

  describe('getFinanceSummary', () => {
    it('buckets income and expense transactions by month', async () => {
      const now = new Date()
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15)

      vi.spyOn(dashboardRepository, 'sumTransactionsGroupedByTypeInRange').mockResolvedValue([
        { amount: '100', createdAt: thisMonth, type: { name: 'Income' } },
        { amount: '40', createdAt: thisMonth, type: { name: 'Expense' } },
        { amount: '25', createdAt: thisMonth, type: { name: 'Income' } },
      ])

      const summary = await dashboardService.getFinanceSummary('3m')

      expect(summary).toHaveLength(3)
      const currentBucket = summary[summary.length - 1]
      expect(currentBucket.income).toBe(125)
      expect(currentBucket.expense).toBe(40)
    })

    it('produces zeroed buckets for every month in range when there is no data', async () => {
      vi.spyOn(dashboardRepository, 'sumTransactionsGroupedByTypeInRange').mockResolvedValue([])

      const summary = await dashboardService.getFinanceSummary('6m')

      expect(summary).toHaveLength(6)
      for (const bucket of summary) {
        expect(bucket.income).toBe(0)
        expect(bucket.expense).toBe(0)
        expect(bucket).not.toHaveProperty('key')
      }
    })

    it('ignores transactions that fall outside the requested range', async () => {
      const now = new Date()
      const farPast = new Date(now.getFullYear() - 5, now.getMonth(), 1)

      vi.spyOn(dashboardRepository, 'sumTransactionsGroupedByTypeInRange').mockResolvedValue([
        { amount: '999', createdAt: farPast, type: { name: 'Income' } },
      ])

      const summary = await dashboardService.getFinanceSummary('6m')

      const total = summary.reduce((sum, bucket) => sum + bucket.income, 0)
      expect(total).toBe(0)
    })
  })

  describe('getRecentActivity', () => {
    it('maps activity log rows to display items in the order returned', async () => {
      vi.spyOn(dashboardRepository, 'findRecentActivityLogs').mockResolvedValue([
        {
          id: 'a1',
          action: 'MEMBER_REGISTERED',
          message: 'New member registered',
          detail: 'Margaret Osei',
          createdAt: new Date('2026-08-04T08:00:00Z'),
        },
        {
          id: 'a2',
          action: 'INCOME_RECORDED',
          message: 'Tithe recorded',
          detail: '$2,400 received',
          createdAt: new Date('2026-08-04T05:00:00Z'),
        },
      ])

      const activity = await dashboardService.getRecentActivity(5)

      expect(activity).toEqual([
        {
          type: 'MEMBER_REGISTERED',
          message: 'New member registered',
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
})
