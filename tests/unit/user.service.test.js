import { describe, it, expect, vi, afterEach } from 'vitest'

const userRepository = require('../../src/modules/users/user.repository')
const userService = require('../../src/modules/users/user.service')
const inviteEmail = require('../../src/modules/users/user-invite.email')
const passwordSetupToken = require('../../src/shared/utils/password-setup-token')

describe('user.service', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createUser', () => {
    it('rejects when email already exists', async () => {
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue({ id: 'u1' })

      await expect(
        userService.createUser({
          name: 'Jane Doe',
          email: 'jane@example.com',
          contact: '+1234567890',
          role: 'FINANCE_ADMIN',
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'An account with this email already exists',
      })
    })

    it('creates a user with blank password and emails a set-password link', async () => {
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null)
      vi.spyOn(userRepository, 'create').mockResolvedValue({
        id: 'u2',
        email: 'jane@example.com',
        password: null,
        name: 'Jane Doe',
        contact: '+1234567890',
        role: 'FINANCE_ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
      vi.spyOn(passwordSetupToken, 'issuePasswordSetupToken').mockResolvedValue({
        rawToken: 'setup-token',
        expiresAt,
      })
      const sendSpy = vi
        .spyOn(inviteEmail, 'sendAccountCreatedEmail')
        .mockResolvedValue({ queued: true })

      const result = await userService.createUser({
        name: 'Jane Doe',
        email: 'Jane@Example.com',
        contact: '+1234567890',
        role: 'FINANCE_ADMIN',
      })

      expect(userRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          password: null,
          name: 'Jane Doe',
          contact: '+1234567890',
          role: 'FINANCE_ADMIN',
        }),
      )
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          role: 'FINANCE_ADMIN',
          setupToken: 'setup-token',
          expiresAt,
        }),
      )
      expect(result).toMatchObject({
        id: 'u2',
        email: 'jane@example.com',
        role: 'FINANCE_ADMIN',
      })
      expect(result.password).toBeUndefined()
    })

    it('still returns the user when invite email sending fails', async () => {
      vi.spyOn(userRepository, 'findByEmail').mockResolvedValue(null)
      vi.spyOn(userRepository, 'create').mockResolvedValue({
        id: 'u3',
        email: 'bob@example.com',
        password: null,
        name: 'Bob',
        contact: '5551112222',
        role: 'USER',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      vi.spyOn(passwordSetupToken, 'issuePasswordSetupToken').mockResolvedValue({
        rawToken: 'token',
        expiresAt: new Date(),
      })
      vi.spyOn(inviteEmail, 'sendAccountCreatedEmail').mockRejectedValue(new Error('SMTP down'))

      const result = await userService.createUser({
        name: 'Bob',
        email: 'bob@example.com',
        contact: '5551112222',
        role: 'USER',
      })

      expect(result.id).toBe('u3')
    })
  })
})
