import { describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { toolProcureResultSchema } from '@/modules/capability-execution/procure'
import { expireStoredProcureResultContent, projectStoredProcureResult, storedToolProcureResultSchema } from '@/modules/capability-execution/convex'

const legacy = {
  schemaVersion: 'tool.procure:v1', idempotencyKey: 'original-purchase-key',
  quoteRef: 'quote:original', callRef: 'call:original', toolRef: 'tool:original',
  kind: 'remedied', status: 'remedied', refundedAmountAud: 'A$0.01', netChargeAud: 'A$0.00',
  diagnostic: { whatHappened: 'private', financialImpact: 'private', nextStep: 'private' },
  audit: { adjudicator: 'call-service-settlement', confidence: 1, remedyLatencyMs: 0, totalLatencyMs: 40 },
} as const

describe('procurement historical money storage boundary', () => {
  it('reads historical remedy money only in storage and projects the retained outcome without exact inference', () => {
    const originalJson = JSON.stringify(legacy)
    const originalHash = canonicalDigest(legacy)
    expect(toolProcureResultSchema.safeParse(legacy).success).toBe(false)
    const stored = storedToolProcureResultSchema.parse(legacy)
    const projected = projectStoredProcureResult(stored)
    expect(projected).toMatchObject({ status: 'remedied', quoteRef: legacy.quoteRef,
      callRef: legacy.callRef, idempotencyKey: legacy.idempotencyKey, money: { kind: 'historical_display_only' } })
    expect(projected).not.toHaveProperty('refundedAmountAud')
    expect(projected).not.toHaveProperty('netChargeAud')
    expect(toolProcureResultSchema.parse(projected)).toEqual(projected)
    expect(JSON.stringify(legacy)).toBe(originalJson)
    expect(canonicalDigest(legacy)).toBe(originalHash)
  })

  it('expires historical diagnostic content while retaining its own money shape and purchase references', () => {
    const expired = expireStoredProcureResultContent(storedToolProcureResultSchema.parse(legacy), 3000)
    expect(expired).toMatchObject({ status: 'remedied', refundedAmountAud: legacy.refundedAmountAud,
      netChargeAud: legacy.netChargeAud, quoteRef: legacy.quoteRef, callRef: legacy.callRef })
    expect(JSON.stringify(expired)).not.toContain('private')
    expect(projectStoredProcureResult(expired)).toMatchObject({ money: { kind: 'historical_display_only' } })
  })

  it('rejects exact money attached to a historical-display-only marker', () => {
    const projected = projectStoredProcureResult(legacy)
    expect(toolProcureResultSchema.safeParse({ ...projected,
      money: { kind: 'historical_display_only', price: { currency: 'AUD', units: '10000', exponent: 6 } } }).success).toBe(false)
  })
})
