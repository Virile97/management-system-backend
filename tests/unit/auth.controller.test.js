import { describe, it, expect, vi, afterEach } from 'vitest'

const authService = require('../../src/modules/auth/auth.service')
const authController = require('../../src/modules/auth/auth.controller')

function createRes() {
  const res = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.clearCookie = vi.fn().mockReturnValue(res)
  return res
}

function createReq(cookies = {}) {
  return { cookies }
}

describe('auth.controller logout', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('responds with 200 and loggedOut: true, clearing the refresh token cookie', async () => {
    vi.spyOn(authService, 'logout').mockResolvedValue(undefined)

    const req = createReq({ refreshToken: 'some-raw-token' })
    const res = createRes()
    const next = vi.fn()

    await authController.logout(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(authService.logout).toHaveBeenCalledWith('some-raw-token')
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.any(Object))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Logged out successfully',
      data: { loggedOut: true },
    })
  })

  it('still succeeds when there is no refresh token cookie', async () => {
    vi.spyOn(authService, 'logout').mockResolvedValue(undefined)

    const req = createReq()
    const res = createRes()
    const next = vi.fn()

    await authController.logout(req, res, next)

    expect(authService.logout).toHaveBeenCalledWith(undefined)
    expect(res.status).toHaveBeenCalledWith(200)
  })
})
