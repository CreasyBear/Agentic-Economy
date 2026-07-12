import { describe, expect, it } from 'vitest'

import { canonicalAuthorityDigest } from '@/modules/routing-kernel/public'

describe('routing authority digest', () => {
  it('uses the SHA-256 known vector over canonical JSON', () => {
    expect(canonicalAuthorityDigest('abc')).toBe(
      'sha256:6cc43f858fbb763301637b5af970e2a46b46f461f27e5a0f41e009c59b827b25',
    )
  })

  it('is independent of object insertion order and changes on a material mutation', () => {
    const first = canonicalAuthorityDigest({ quoteId: 'quote:1', amountMinor: 125 })
    const reordered = canonicalAuthorityDigest({ amountMinor: 125, quoteId: 'quote:1' })
    const mutated = canonicalAuthorityDigest({ quoteId: 'quote:1', amountMinor: 126 })

    expect(first).toBe(reordered)
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(mutated).not.toBe(first)
  })
})
