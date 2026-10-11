import { describe, expect, it } from 'vitest'

import { emailAddressHash } from '../../../convex/lib/principalAccount/notifications/suppression'

describe('emailAddressHash', () => {
  it('is keyed, normalised and fails closed', async () => {
    const plain = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('a@b.test'))), (b) => b.toString(16).padStart(2, '0')).join('')
    const hash = await emailAddressHash('a@b.test', 'k1')
    expect(hash).not.toBe(plain)
    expect(await emailAddressHash('  A@B.Test ', 'k1')).toBe(hash)
    expect(await emailAddressHash('a@b.test', 'k2')).not.toBe(hash)
    await expect(emailAddressHash('a@b.test', '')).rejects.toThrow()
  })
})
