import { describe, it, expect } from 'vitest'

const { parseInactiveAfter } = require('../../src/jobs/sync-member-status')

describe('parseInactiveAfter', () => {
  const now = new Date(Date.UTC(2026, 7, 13))

  it('parses day suffixes', () => {
    const result = parseInactiveAfter('30d', now)
    expect(result).toMatchObject({ amount: 30, unit: 'days', label: '30d' })
    expect(result.cutoff.toISOString().slice(0, 10)).toBe('2026-07-14')
  })

  it('parses week suffixes', () => {
    const result = parseInactiveAfter('4w', now)
    expect(result).toMatchObject({ amount: 4, unit: 'weeks', label: '4w' })
    expect(result.cutoff.toISOString().slice(0, 10)).toBe('2026-07-16')
  })

  it('defaults bare numbers to days', () => {
    const result = parseInactiveAfter('14', now)
    expect(result).toMatchObject({ amount: 14, unit: 'days', label: '14d' })
  })

  it('accepts long unit words', () => {
    expect(parseInactiveAfter('2 weeks', now).label).toBe('2w')
    expect(parseInactiveAfter('10 days', now).label).toBe('10d')
  })

  it('rejects invalid values', () => {
    expect(() => parseInactiveAfter('abc')).toThrow(/Invalid MEMBER_INACTIVE_AFTER/)
    expect(() => parseInactiveAfter('0d')).toThrow(/positive integer/)
  })
})
