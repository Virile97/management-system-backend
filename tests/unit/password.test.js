import { describe, it, expect } from 'vitest'
const { hashPassword, comparePassword } = require('../../src/shared/utils/password')

describe('password utils', () => {
  it('hashes and verifies a password correctly', async () => {
    const hash = await hashPassword('Password123!')
    expect(hash).not.toBe('Password123!')
    await expect(comparePassword('Password123!', hash)).resolves.toBe(true)
    await expect(comparePassword('WrongPassword', hash)).resolves.toBe(false)
  })
})
