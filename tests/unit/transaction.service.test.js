import { describe, it, expect, vi, afterEach } from 'vitest'

const transactionRepository = require('../../src/modules/transactions/transaction.repository')
const transactionService = require('../../src/modules/transactions/transaction.service')

describe('transaction.service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('listTransactions', () => {
    it('passes from/to date filters through to the repository', async () => {
      vi.spyOn(transactionRepository, 'findMany').mockResolvedValue([])
      vi.spyOn(transactionRepository, 'count').mockResolvedValue(0)

      const from = new Date('2026-08-03')
      const to = new Date('2026-08-04')

      await transactionService.listTransactions({ from, to })

      expect(transactionRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ from, to }),
      )
      expect(transactionRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({ from, to }),
      )
    })

    it('works when from/to are omitted', async () => {
      vi.spyOn(transactionRepository, 'findMany').mockResolvedValue([])
      vi.spyOn(transactionRepository, 'count').mockResolvedValue(0)

      await transactionService.listTransactions({})

      expect(transactionRepository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ from: undefined, to: undefined }),
      )
    })

    it('drops redundant FK ids and keeps the nested objects in each item', async () => {
      vi.spyOn(transactionRepository, 'findMany').mockResolvedValue([
        {
          id: 't1',
          typeId: 'type-1',
          categoryId: 'cat-1',
          recordedBy: 'user-1',
          amount: '2400',
          description: 'Tithe',
          type: { id: 'type-1', name: 'Income' },
          category: { id: 'cat-1', name: 'Tithe' },
          recordedByUser: { id: 'user-1', name: 'Admin User' },
        },
      ])
      vi.spyOn(transactionRepository, 'count').mockResolvedValue(1)

      const { items } = await transactionService.listTransactions({})

      expect(items[0]).not.toHaveProperty('typeId')
      expect(items[0]).not.toHaveProperty('categoryId')
      expect(items[0]).not.toHaveProperty('recordedBy')
      expect(items[0].type).toEqual({ id: 'type-1', name: 'Income' })
    })
  })

  describe('getStats', () => {
    it('computes net balance from income minus expenses', async () => {
      vi.spyOn(transactionRepository, 'sumAmountByTypeName').mockImplementation((typeName) =>
        Promise.resolve({ _sum: { amount: typeName === 'Income' ? '21400' : '7770' } }),
      )

      const stats = await transactionService.getStats()

      expect(stats).toEqual({ totalIncome: 21400, totalExpenses: 7770, netBalance: 13630 })
    })

    it('defaults to 0 when there are no transactions of a type', async () => {
      vi.spyOn(transactionRepository, 'sumAmountByTypeName').mockResolvedValue({
        _sum: { amount: null },
      })

      const stats = await transactionService.getStats()

      expect(stats).toEqual({ totalIncome: 0, totalExpenses: 0, netBalance: 0 })
    })
  })

  describe('getByOfferingType', () => {
    it('returns SQL aggregated offering totals', async () => {
      vi.spyOn(transactionRepository, 'sumByOfferingType').mockResolvedValue([
        { offeringType: 'Tithes', total: 2400 },
        { offeringType: 'Love', total: 400 },
      ])

      const breakdown = await transactionService.getByOfferingType()

      expect(breakdown).toEqual([
        { offeringType: 'Tithes', total: 2400 },
        { offeringType: 'Love', total: 400 },
      ])
    })

    it('passes the offeringTypeId filter through to the repository', async () => {
      vi.spyOn(transactionRepository, 'sumByOfferingType').mockResolvedValue([
        { offeringType: 'Love', total: 400 },
      ])

      await transactionService.getByOfferingType({ offeringTypeId: ['o1', 'o2'] })

      expect(transactionRepository.sumByOfferingType).toHaveBeenCalledWith(expect.any(Object), [
        'o1',
        'o2',
      ])
    })
  })

  describe('updateTransaction', () => {
    it('throws not found when the transaction does not exist', async () => {
      vi.spyOn(transactionRepository, 'findById').mockResolvedValue(null)

      await expect(
        transactionService.updateTransaction('missing', { description: 'note' }),
      ).rejects.toMatchObject({ statusCode: 404 })
    })

    it('derives amount from breakdown and replaces line items', async () => {
      vi.spyOn(transactionRepository, 'findById').mockResolvedValue({ id: 't1' })
      vi.spyOn(transactionRepository, 'updateById').mockResolvedValue({
        id: 't1',
        typeId: 'type-1',
        categoryId: 'cat-1',
        recordedBy: 'user-1',
        amount: '1500',
        description: 'Updated',
        type: { id: 'type-1', name: 'Income' },
        category: { id: 'cat-1', name: 'Offering' },
        recordedByUser: { id: 'user-1', name: 'Admin' },
        items: [
          { offeringType: { id: 'o1', name: 'Tithes' }, amount: '900' },
          { offeringType: { id: 'o2', name: 'Love' }, amount: '600' },
        ],
      })

      const result = await transactionService.updateTransaction('t1', {
        description: 'Updated',
        breakdown: [
          { offeringTypeId: 'o1', amount: 900 },
          { offeringTypeId: 'o2', amount: 600 },
        ],
      })

      expect(transactionRepository.updateById).toHaveBeenCalledWith('t1', {
        description: 'Updated',
        amount: 1500,
        breakdown: [
          { offeringTypeId: 'o1', amount: 900 },
          { offeringTypeId: 'o2', amount: 600 },
        ],
      })
      expect(result.amount).toBe(1500)
      expect(result.breakdown).toEqual([
        { offeringType: { id: 'o1', name: 'Tithes' }, amount: 900 },
        { offeringType: { id: 'o2', name: 'Love' }, amount: 600 },
      ])
    })

    it('passes a flat amount through without inventing a breakdown', async () => {
      vi.spyOn(transactionRepository, 'findById').mockResolvedValue({ id: 't1' })
      vi.spyOn(transactionRepository, 'updateById').mockResolvedValue({
        id: 't1',
        typeId: 'type-1',
        categoryId: null,
        recordedBy: 'user-1',
        amount: '500',
        description: null,
        type: { id: 'type-1', name: 'Expense' },
        category: null,
        recordedByUser: { id: 'user-1', name: 'Admin' },
        items: [],
      })

      await transactionService.updateTransaction('t1', { amount: 500 })

      expect(transactionRepository.updateById).toHaveBeenCalledWith('t1', { amount: 500 })
    })
  })

  describe('getMonthlyTrend', () => {
    it('buckets by day when period is month', async () => {
      const now = new Date()

      vi.spyOn(transactionRepository, 'sumTrendGrouped').mockResolvedValue([
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          type: 'Income',
          amount: 100,
        },
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          day: now.getDate(),
          type: 'Expense',
          amount: 40,
        },
      ])

      const trend = await transactionService.getMonthlyTrend({ period: 'month' })

      const todayBucket = trend[now.getDate() - 1]
      expect(todayBucket.income).toBe(100)
      expect(todayBucket.expense).toBe(40)
      expect(todayBucket).not.toHaveProperty('key')
      expect(transactionRepository.sumTrendGrouped).toHaveBeenCalledWith(
        expect.objectContaining({ grain: 'day' }),
      )
    })

    it('buckets by month when period is year', async () => {
      const now = new Date()

      vi.spyOn(transactionRepository, 'sumTrendGrouped').mockResolvedValue([
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          type: 'Income',
          amount: 100,
        },
        {
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          type: 'Expense',
          amount: 40,
        },
      ])

      const trend = await transactionService.getMonthlyTrend({ period: 'year' })

      expect(trend).toHaveLength(now.getMonth() + 1)
      const currentBucket = trend[trend.length - 1]
      expect(currentBucket.income).toBe(100)
      expect(currentBucket.expense).toBe(40)
      expect(currentBucket).not.toHaveProperty('key')
      expect(transactionRepository.sumTrendGrouped).toHaveBeenCalledWith(
        expect.objectContaining({ grain: 'month' }),
      )
    })
  })
})
