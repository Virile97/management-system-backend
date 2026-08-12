import { describe, it, expect, vi, afterEach } from 'vitest'

const authRepository = require('../../src/modules/auth/auth.repository')
const authService = require('../../src/modules/auth/auth.service')
const passwordUtils = require('../../src/shared/utils/password')
const passwordSetupToken = require('../../src/shared/utils/password-setup-token')
const refreshToken = require('../../src/shared/utils/refresh-token')
const jwtUtils = require('../../src/shared/utils/jwt')

describe('auth.service set-password', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects invalid setup tokens', async () => {
    vi.spyOn(passwordSetupToken, 'findValidPasswordSetupToken').mockResolvedValue(null)

    await expect(authService.verifyPasswordSetupToken('bad')).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('returns ownership details for a valid token', async () => {
    const expiresAt = new Date(Date.now() + 3600_000)
    vi.spyOn(passwordSetupToken, 'findValidPasswordSetupToken').mockResolvedValue({
      id: 't1',
      userId: 'u1',
      expiresAt,
      user: {
        id: 'u1',
        email: 'jane@example.com',
        name: 'Jane',
        role: 'USER',
        password: null,
      },
    })

    await expect(authService.verifyPasswordSetupToken('good')).resolves.toEqual({
      email: 'jane@example.com',
      name: 'Jane',
      role: 'USER',
      expiresAt,
    })
  })

  it('sets password once and issues session tokens', async () => {
    vi.spyOn(passwordSetupToken, 'findValidPasswordSetupToken').mockResolvedValue({
      id: 't1',
      userId: 'u1',
      expiresAt: new Date(Date.now() + 3600_000),
      user: {
        id: 'u1',
        email: 'jane@example.com',
        name: 'Jane',
        role: 'USER',
        password: null,
      },
    })
    vi.spyOn(passwordUtils, 'hashPassword').mockResolvedValue('hashed')
    vi.spyOn(authRepository, 'updatePassword').mockResolvedValue({
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
      role: 'USER',
      password: 'hashed',
    })
    vi.spyOn(passwordSetupToken, 'markPasswordSetupTokenUsed').mockResolvedValue(undefined)
    vi.spyOn(jwtUtils, 'signToken').mockReturnValue('access')
    vi.spyOn(refreshToken, 'issueRefreshToken').mockResolvedValue('refresh')

    const result = await authService.setPassword({ token: 'good', password: 'Password123!' })

    expect(authRepository.updatePassword).toHaveBeenCalledWith('u1', 'hashed')
    expect(passwordSetupToken.markPasswordSetupTokenUsed).toHaveBeenCalledWith('t1')
    expect(result).toMatchObject({
      token: 'access',
      refreshToken: 'refresh',
      user: { id: 'u1', email: 'jane@example.com' },
    })
  })

  it('blocks login when password has not been set', async () => {
    vi.spyOn(authRepository, 'findByEmail').mockResolvedValue({
      id: 'u1',
      email: 'jane@example.com',
      password: null,
    })

    await expect(
      authService.login({ email: 'jane@example.com', password: 'anything' }),
    ).rejects.toMatchObject({ statusCode: 401 })
  })
})
