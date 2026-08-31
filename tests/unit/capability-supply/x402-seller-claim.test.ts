import { describe, expect, it } from 'vitest'

import {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
  x402SellerClaimMessage,
} from '@/modules/capability-supply/public'

const claim = {
  businessId: 'business:one',
  endpointUrl: 'https://seller.example/operation',
  method: 'POST' as const,
  observationDigest: 'sha256:observation',
  payTo: '0x1111111111111111111111111111111111111111',
  expiresAt: 1_600_000,
}

describe('x402 seller payee claim', () => {
  it('binds the signature message to the supplier, exact endpoint, observation, payee, and expiry', () => {
    const message = x402SellerClaimMessage(claim)

    expect(message).toContain('Supplier: business:one')
    expect(message).toContain('Endpoint: https://seller.example/operation')
    expect(message).toContain('Observation: sha256:observation')
    expect(message).toContain('Payee: 0x1111111111111111111111111111111111111111')
    expect(message).toContain('does not authorize a payment or transaction')
    expect(x402SellerClaimDigest(claim)).not.toBe(x402SellerClaimDigest({
      ...claim,
      endpointUrl: 'https://seller.example/other',
    }))
  })

  it('accepts only a live bounded claim window', () => {
    expect(validX402SellerClaimTime(1_600_000, 1_000_000)).toBe(true)
    expect(validX402SellerClaimTime(999_999, 1_000_000)).toBe(false)
    expect(validX402SellerClaimTime(1_900_001, 1_000_000)).toBe(false)
  })
})
