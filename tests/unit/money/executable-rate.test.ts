import { describe, expect, it } from 'vitest'

import {
  createExecutableRatePort,
  quoteExecutableAudToUsdc,
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
})
