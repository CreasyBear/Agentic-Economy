import { describe, expect, it } from 'vitest'

import { economicRailForCall } from '@/modules/capability-supply/server'

describe('payment lane admission', () => {
  it('selects one brokered market rail in sandbox and production', () => {
    expect(economicRailForCall({ isX402: true })).toBe('brokered_x402')
    expect(economicRailForCall({ isX402: false })).toBe('ae_internal')
  })
})
