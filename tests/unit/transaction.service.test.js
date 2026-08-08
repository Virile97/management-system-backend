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

  describe('getByCategory', () => {
    it('sums amounts per category, sorted by total descending', async () => {
      vi.spyOn(transactionRepository, 'sumGroupedByCategory').mockResolvedValue([
        { amount: '400', category: { id: 'c1', name: 'Utilities' } },
        { amount: '2000', category: { id: 'c2', name: 'Tithe' } },
        { amount: '400', category: { id: 'c2', name: 'Tithe' } },
      ])

      const breakdown = await transactionService.getByCategory()

      expect(breakdown).toEqual([
        { category: 'Tithe', total: 2400 },
        { category: 'Utilities', total: 400 },
      ])
    })

    it('groups transactions with no category under Uncategorized', async () => {
      vi.spyOn(transactionRepository, 'sumGroupedByCategory').mockResolvedValue([
        { amount: '100', category: null },
      ])

      const breakdown = await transactionService.getByCategory()

      expect(breakdown).toEqual([{ category: 'Uncategorized', total: 100 }])
    })
  })

  describe('getMonthlyTrend', () => {
    it('buckets income and expense transactions by month', async () => {
      const now = new Date()
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 15)

      vi.spyOn(transactionRepository, 'findAllForTrend').mockResolvedValue([
        { amount: '100', createdAt: thisMonth, type: { name: 'Income' } },
        { amount: '40', createdAt: thisMonth, type: { name: 'Expense' } },
      ])

      const trend = await transactionService.getMonthlyTrend('3m')

      expect(trend).toHaveLength(3)
      const currentBucket = trend[trend.length - 1]
      expect(currentBucket.income).toBe(100)
      expect(currentBucket.expense).toBe(40)
      expect(currentBucket).not.toHaveProperty('key')
    })
  })
})
