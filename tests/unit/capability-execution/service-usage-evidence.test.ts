import { describe, expect, it } from 'vitest'
import { measurementSupport, supportDigest, projectServiceUsageEvidence } from '@/modules/capability-execution/service-usage-evidence'
describe('measurement support contract', () => {
  it('excludes refund and settlement fields from support identity', () => {
    const before = { state: 'completed' as const, result: { kind: 'completed' as const, evidenceHash: `sha256:${'a'.repeat(64)}`, receipt: { state: 'settled', refundState: 'not_applicable' } } }
    const after = { ...before, result: { ...before.result, receipt: { state: 'refunded', refundState: 'completed' } } }
    expect(supportDigest(measurementSupport(before))).toBe(supportDigest(measurementSupport(after)))
  })
  it('redacts arbitrary evidence and validates original clocks and revision chains', () => {
    const secret = 'sk-SENTINEL-SUPPORT', support = measurementSupport({ state: 'completed', result: { kind: 'completed', evidenceHash: secret } })
    expect(JSON.stringify(support)).not.toContain(secret)
    const origin = { usageRef: 'usage:one', callRef: 'call:one', occurredAt: 10, observedAt: 20, sourceDigest: supportDigest(support), revisions: [], asOfObservedAt: 30, asOfEffectiveAt: 30 }
    expect(() => projectServiceUsageEvidence({ ...origin, observedAt: 9 })).toThrow('measurement_origin_invalid')
    expect(() => projectServiceUsageEvidence({ ...origin, revisions: [{ revisionRef: 'forged', previousRevisionRef: origin.usageRef, revision: 1, sourceDigest: origin.sourceDigest, support, quantityUnits: '1', effectiveAt: 20, observedAt: 20 }] })).toThrow('measurement_lineage_invalid')
  })
})
