import { describe, expect, it } from 'vitest'

import { listingIdentityDigest } from '../../../convex/lib/market/directoryIndex/listingDigest'
import type { DirectoryEntry } from '../../../convex/lib/market/directoryIndex/contracts'

const PAYEE_A = '0x1111111111111111111111111111111111111111'
const PAYEE_B = '0x2222222222222222222222222222222222222222'

function entry(payTo?: string, calls30d?: number): DirectoryEntry {
  return {
    resource: 'https://api.example.com/weather',
    title: 'Weather',
    description: 'Weather',
    protocol: 'http',
    provider: 'api.example.com',
    metadataJson: '{}',
    ...(calls30d === undefined ? {} : { activity: { calls30d } }),
    prices: [{
      network: 'eip155:8453',
      scheme: 'exact',
      amount: '0.003000 USDC',
      asset: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      ...(payTo === undefined ? {} : { payTo }),
    }],
  }
}

describe('listingIdentityDigest', () => {
  it('changes when only payTo changes and ignores Bazaar call counts', () => {
    const first = listingIdentityDigest(entry(PAYEE_A, 1), 'weather')
    expect(listingIdentityDigest(entry(PAYEE_B, 1), 'weather')).not.toBe(first)
    expect(listingIdentityDigest(entry(PAYEE_A, 99), 'weather')).toBe(first)
    expect(listingIdentityDigest(entry(undefined, 1), 'weather')).not.toBe(first)
  })
})
