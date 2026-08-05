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
    it('merges member and transaction activity sorted by most recent first', async () => {
      vi.spyOn(dashboardRepository, 'findRecentMembers').mockResolvedValue([
        {
          id: 'm1',
          firstName: 'Margaret',
          lastName: 'Osei',
          createdAt: new Date('2026-08-04T08:00:00Z'),
        },
      ])
      vi.spyOn(dashboardRepository, 'findRecentTransactions').mockResolvedValue([
        {
          id: 't1',
          amount: '2400',
          createdAt: new Date('2026-08-04T05:00:00Z'),
          type: { name: 'Income' },
          category: { name: 'Tithe' },
        },
      ])

      const activity = await dashboardService.getRecentActivity(5)

      expect(activity).toHaveLength(2)
      expect(activity[0]).toMatchObject({ type: 'MEMBER_REGISTERED', detail: 'Margaret Osei' })
      expect(activity[1]).toMatchObject({
        type: 'INCOME_RECORDED',
        message: 'Tithe recorded',
        detail: 2400,
      })
    })

    it('truncates the merged feed to the requested limit', async () => {
      const makeMember = (i) => ({
        id: `m${i}`,
        firstName: `Member${i}`,
        lastName: '',
        createdAt: new Date(2026, 0, i + 1),
      })

      vi.spyOn(dashboardRepository, 'findRecentMembers').mockResolvedValue([
        makeMember(1),
        makeMember(2),
        makeMember(3),
      ])
      vi.spyOn(dashboardRepository, 'findRecentTransactions').mockResolvedValue([])

      const activity = await dashboardService.getRecentActivity(2)

      expect(activity).toHaveLength(2)
    })

    it('falls back to a generic message when the transaction has no category', async () => {
      vi.spyOn(dashboardRepository, 'findRecentMembers').mockResolvedValue([])
      vi.spyOn(dashboardRepository, 'findRecentTransactions').mockResolvedValue([
        {
          id: 't1',
          amount: '50',
          createdAt: new Date(),
          type: { name: 'Expense' },
          category: null,
        },
      ])

      const activity = await dashboardService.getRecentActivity(5)

      expect(activity[0]).toMatchObject({
        type: 'EXPENSE_RECORDED',
        message: 'Transaction recorded',
      })
    })
  })
})
