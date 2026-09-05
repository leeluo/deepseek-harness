import { describe, expect, it } from 'vitest'

describe('lease module loading', () => {
  it.skipIf(process.platform !== 'win32')('does not load the POSIX fs-ext binding on Windows', async () => {
    await expect(import('../src/lease.ts')).resolves.toMatchObject({
      LEASE_FILENAME: 'session.lock',
    })
  })
})
