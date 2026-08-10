import { describe, it, expect, vi, afterEach } from 'vitest'

const memberRepository = require('../../src/modules/members/member.repository')
const memberService = require('../../src/modules/members/member.service')

function mockOfferings(transactions, { typeRows = [], total, totalRecords, sum } = {}) {
  const rowCount = transactions.reduce((count, tx) => count + Math.max(tx.items.length, 1), 0)

  vi.spyOn(memberRepository, 'existsById').mockResolvedValue(true)
  vi.spyOn(memberRepository, 'findOfferingsByMemberId').mockResolvedValue(transactions)
  vi.spyOn(memberRepository, 'findOfferingTypesByMemberId').mockResolvedValue(typeRows)
  vi.spyOn(memberRepository, 'countOfferingsByMemberId').mockResolvedValue(
    total ?? transactions.length,
  )
  vi.spyOn(memberRepository, 'countOfferingRowsByMemberId').mockResolvedValue(
    totalRecords ?? rowCount,
  )
  vi.spyOn(memberRepository, 'sumOfferingsByMemberId').mockResolvedValue({
    _sum: { amount: sum ?? null },
  })
}

describe('member.service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getMemberOfferings', () => {
    it('throws not found when the member does not exist', async () => {
      vi.spyOn(memberRepository, 'existsById').mockResolvedValue(false)

      await expect(memberService.getMemberOfferings('m1', {})).rejects.toMatchObject({
        statusCode: 404,
      })
    })

    it('flattens breakdown items into rows', async () => {
      mockOfferings(
        [
          {
            id: 't1',
            description: 'Annual',
            amount: '1500.00',
            createdAt: new Date('2026-08-01'),
            items: [
              { id: 'i1', amount: '900.00', offeringType: { id: 'o1', name: 'First Fruit' } },
              { id: 'i2', amount: '600.00', offeringType: { id: 'o2', name: 'Love' } },
            ],
          },
          {
            id: 't2',
            description: null,
            amount: '500.00',
            createdAt: new Date('2026-07-01'),
            items: [],
          },
        ],
        { sum: '2000.00' },
      )

      const result = await memberService.getMemberOfferings('m1', { period: 'year' })

      expect(result.totalOfferings).toBe(2000)
      expect(result.totalRecords).toBe(3)
      expect(result.items).toHaveLength(3)
      expect(result.items[0]).toMatchObject({
        id: 'i1',
        transactionId: 't1',
        offeringType: { name: 'First Fruit' },
        amount: 900,
        note: 'Annual',
      })
      expect(result.items[2]).toMatchObject({
        id: 't2',
        offeringType: null,
        amount: 500,
        note: null,
      })
    })

    it('returns only the offering types the member has records for', async () => {
      mockOfferings([], {
        typeRows: [
          { offeringType: { id: 'o2', name: 'First Fruit' } },
          { offeringType: { id: 'o1', name: 'Tithes' } },
        ],
      })

      const result = await memberService.getMemberOfferings('m1', { period: 'year' })

      expect(result.types).toEqual([
        { id: 'o2', name: 'First Fruit' },
        { id: 'o1', name: 'Tithes' },
      ])
    })

    it('passes offeringTypeId through to every repository query', async () => {
      mockOfferings([], {
        typeRows: [
          { offeringType: { id: 'o2', name: 'First Fruit' } },
          { offeringType: { id: 'o1', name: 'Tithes' } },
        ],
        sum: '900.00',
      })

      const result = await memberService.getMemberOfferings('m1', {
        period: 'year',
        offeringTypeId: ['o1'],
      })

      for (const method of [
        'findOfferingsByMemberId',
        'countOfferingsByMemberId',
        'countOfferingRowsByMemberId',
        'sumOfferingsByMemberId',
      ]) {
        expect(memberRepository[method]).toHaveBeenCalledWith(
          'm1',
          expect.any(Object),
          ['o1'],
          ...(method === 'findOfferingsByMemberId' ? [expect.any(Object)] : []),
        )
      }
      expect(result.totalOfferings).toBe(900)
      expect(result.types).toHaveLength(2)
    })

    it('pages at the transaction level and reports totals for the whole set', async () => {
      mockOfferings(
        [
          {
            id: 't1',
            description: null,
            amount: '1500.00',
            createdAt: new Date('2026-08-01'),
            items: [
              { id: 'i1', amount: '900.00', offeringType: { id: 'o1', name: 'Tithes' } },
              { id: 'i2', amount: '600.00', offeringType: { id: 'o2', name: 'Love' } },
            ],
          },
        ],
        { total: 250, totalRecords: 310, sum: '480000.00' },
      )

      const result = await memberService.getMemberOfferings('m1', { period: 'all', limit: 1 })

      expect(memberRepository.findOfferingsByMemberId).toHaveBeenCalledWith(
        'm1',
        expect.any(Object),
        undefined,
        { skip: 0, take: 1 },
      )
      expect(result.meta).toEqual({ page: 1, limit: 1, total: 250, totalPages: 250 })
      expect(result.totalOfferings).toBe(480000)
      expect(result.totalRecords).toBe(310)
      // One transaction with a two-way breakdown, so the page holds more rows than `limit`.
      expect(result.items).toHaveLength(2)
    })

    it('applies page and limit as skip/take', async () => {
      mockOfferings([])

      await memberService.getMemberOfferings('m1', { period: 'all', page: 3, limit: 25 })

      expect(memberRepository.findOfferingsByMemberId).toHaveBeenCalledWith(
        'm1',
        expect.any(Object),
        undefined,
        { skip: 50, take: 25 },
      )
    })

    it('resolves the week period into a Sunday-to-Saturday range', async () => {
      mockOfferings([])
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 12, 10, 0, 0))

      const result = await memberService.getMemberOfferings('m1', { period: 'week' })

      expect(result.period.from).toEqual(new Date(2026, 7, 9, 0, 0, 0, 0))
      expect(result.period.to).toEqual(new Date(2026, 7, 15, 23, 59, 59, 999))
      expect(result.totalOfferings).toBe(0)

      vi.useRealTimers()
    })
  })
})
