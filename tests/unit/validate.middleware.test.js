import { describe, it, expect, vi } from 'vitest'
const { z } = require('zod')

const validate = require('../../src/middlewares/validate.middleware')

function createReq({ query = {}, body = {}, params = {} } = {}) {
  return { query, body, params }
}

describe('validate middleware', () => {
  it('writes coerced query values back onto req.query', () => {
    const schema = z.object({
      query: z.object({ from: z.coerce.date() }),
    })
    const req = createReq({ query: { from: '2026-08-03' } })
    const next = vi.fn()

    validate(schema)(req, {}, next)

    expect(next).toHaveBeenCalledWith()
    expect(req.query.from).toBeInstanceOf(Date)
    expect(req.query.from.toISOString()).toBe('2026-08-03T00:00:00.000Z')
  })

  it('writes coerced body values back onto req.body', () => {
    const schema = z.object({
      body: z.object({ age: z.coerce.number() }),
    })
    const req = createReq({ body: { age: '34' } })
    const next = vi.fn()

    validate(schema)(req, {}, next)

    expect(req.body.age).toBe(34)
  })

  it('writes coerced params values back onto req.params', () => {
    const schema = z.object({
      params: z.object({ id: z.string().uuid() }),
    })
    const req = createReq({ params: { id: '368c3fab-066a-4c6d-9a71-b1f3cc5d2472' } })
    const next = vi.fn()

    validate(schema)(req, {}, next)

    expect(req.params.id).toBe('368c3fab-066a-4c6d-9a71-b1f3cc5d2472')
  })

  it('calls next with a validation AppError when the query fails validation', () => {
    const schema = z.object({
      query: z.object({ from: z.coerce.date() }),
    })
    const req = createReq({ query: { from: 'not-a-date' } })
    const next = vi.fn()

    validate(schema)(req, {}, next)

    expect(next).toHaveBeenCalledTimes(1)
    const err = next.mock.calls[0][0]
    expect(err.statusCode).toBe(422)
    expect(err.message).toBe('Validation failed')
    expect(err.details).toHaveProperty('query')
  })

  it('does not mutate req.query when the schema has no query shape', () => {
    const schema = z.object({
      body: z.object({ name: z.string() }),
    })
    const originalQuery = { page: '2' }
    const req = createReq({ query: originalQuery, body: { name: 'ok' } })
    const next = vi.fn()

    validate(schema)(req, {}, next)

    expect(req.query).toBe(originalQuery)
    expect(next).toHaveBeenCalledWith()
  })
})
