import { describe, expect, it } from 'vitest'

import {
  createExecutableRatePort,
  quoteExecutableAudToUsdc,
  quoteManagedX402BuyerAud,
  splitInclusiveAudTax,
  validateExecutableRateEvidence,
} from '../../../src/modules/money/internal/executable-rate'

describe('executable AUD to USDC pricing evidence', () => {
  it('returns deterministic, expiring sandbox evidence and rounds the required USDC up', async () => {
    const port = createExecutableRatePort({
      environment: 'sandbox',
      now: () => 1_800_000_000_000,
    })

    await expect(port.quote({
      sourceAmount: { currency: 'AUD', exponent: 6, units: '1000001' },
    })).resolves.toEqual(expect.objectContaining({
      kind: 'quoted',
      evidence: expect.objectContaining({
        version: 'ae.executable-rate:v1',
        environment: 'sandbox',
        source: 'sandbox_deterministic',
        sourceAmount: { currency: 'AUD', exponent: 6, units: '1000001' },
        targetAmount: { currency: 'USDC', exponent: 6, units: '650001' },
        observedAt: 1_800_000_000_000,
        expiresAt: 1_800_000_300_000,
      }),
    }))
  })

  it('refuses production before I/O until an approved executable adapter exists', async () => {
    const port = createExecutableRatePort({
      environment: 'production',
      now: () => 1_800_000_000_000,
    })

    await expect(port.quote({
      sourceAmount: { currency: 'AUD', exponent: 6, units: '1000000' },
    })).resolves.toEqual({
      kind: 'refused',
      code: 'pricing_setup_required',
      retryable: false,
    })
  })

  it('binds the evidence digest to every executable term', () => {
    const quoted = quoteExecutableAudToUsdc({
      environment: 'sandbox',
      sourceAmount: { currency: 'AUD', exponent: 6, units: '5000000' },
      observedAt: 1_800_000_000_000,
    })
    if (quoted.kind !== 'quoted') throw new Error('sandbox quote missing')

    expect(validateExecutableRateEvidence(quoted.evidence, 1_800_000_001_000)).toBe(true)
    expect(validateExecutableRateEvidence({
      ...quoted.evidence,
      targetAmount: { ...quoted.evidence.targetAmount, units: '1' },
    }, 1_800_000_001_000)).toBe(false)
    expect(validateExecutableRateEvidence(quoted.evidence, quoted.evidence.expiresAt)).toBe(false)
  })

  it('quotes the minimum AUD units that still cover the exact upstream USDC requirement', () => {
    for (let requiredUnits = 1n; requiredUnits <= 10_000n; requiredUnits += 1n) {
      const quoted = quoteManagedX402BuyerAud({
        environment: 'sandbox',
        requiredUsdcAtomicUnits: requiredUnits.toString(),
        observedAt: 1_800_000_000_000,
      })
      if (quoted.kind !== 'quoted') throw new Error(`quote refused for ${requiredUnits}`)

      const buyerUnits = BigInt(quoted.evidence.sourceAmount.units)
      const providerUnits = BigInt(quoted.evidence.targetAmount.units)
      expect(providerUnits).toBeGreaterThanOrEqual(requiredUnits)
      if (buyerUnits > 1n) {
        const providerUnitsForOneLess = ((buyerUnits - 1n) * 65n + 99n) / 100n
        expect(providerUnitsForOneLess).toBeLessThan(requiredUnits)
      }
    }
  })

  it('splits inclusive GST without losing or creating an AUD unit', () => {
    for (let totalUnits = 1n; totalUnits <= 10_000n; totalUnits += 1n) {
      const split = splitInclusiveAudTax(totalUnits.toString(), 1_000)
      const expectedTaxUnits = (2n * totalUnits * 1_000n + 11_000n) / 22_000n
      if (expectedTaxUnits === 0n) {
        expect(split).toBeUndefined()
        continue
      }
      if (split === undefined) throw new Error(`GST split missing for ${totalUnits}`)
      expect(BigInt(split.taxUnits)).toBe(expectedTaxUnits)
      expect(BigInt(split.revenueUnits) + BigInt(split.taxUnits)).toBe(totalUnits)
    }
  })
})
