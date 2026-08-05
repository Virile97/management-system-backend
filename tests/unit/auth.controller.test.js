import { describe, it, expect, vi } from 'vitest'

const authController = require('../../src/modules/auth/auth.controller')

function createRes() {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('auth.controller logout', () => {
  it('responds with 200 and loggedOut: true', async () => {
    const req = {}
    const res = createRes()
    const next = vi.fn()

    await authController.logout(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Logged out successfully',
      data: { loggedOut: true },
    })
  })
})
