import { describe, expect, it } from 'vitest'

import {
  createMemoryCapabilityLiquidityPort,
  recordCapabilityCallObservation,
  recordCapabilityDepthObservation,
  type LiquidityZeroReason,
} from '@/modules/capability-supply/public'

const base = {
  businessId: 'business:one', offeringRef: 'offering:one', publicationRef: 'publication:one', taskDigest: 'sha256:task', observedAt: 1_000, evidenceRefs: ['test:observation'], environment: 'development' as const,
}

describe('supply liquidity events', () => {
  it('writes one fill and one first-success duration, including replay deduplication', async () => {
    const port = createMemoryCapabilityLiquidityPort()
    const input = { ...base, outcome: 'filled' as const, taskStartedAt: 700, successfulAt: 1_000 }
    await recordCapabilityCallObservation(input, port)
    await recordCapabilityCallObservation(input, port)
    expect(port.events).toHaveLength(2)
    expect(port.events.find((event) => event.eventKind === 'supply_liquidity_first_success_observed')?.durationMs).toBe(300)
  })

  it('records every closed zero reason', async () => {
    const reasons: readonly LiquidityZeroReason[] = ['no_routeable_supply', 'readiness_unavailable', 'provider_refused', 'credential_unavailable', 'price_unavailable', 'insufficient_credit', 'input_invalid', 'outcome_unknown']
    const port = createMemoryCapabilityLiquidityPort()
    for (const [index, zeroReason] of reasons.entries()) await recordCapabilityCallObservation({ ...base, taskDigest: `sha256:task-${index}`, observedAt: base.observedAt + index, outcome: 'zero', zeroReason }, port)
    expect(port.events.filter((event) => event.eventKind === 'supply_liquidity_fill_observed').map((event) => event.zeroReason)).toEqual(reasons)
  })

  it('records bounded per-task depth and supplies a zero reason', async () => {
    const port = createMemoryCapabilityLiquidityPort()
    const event = await recordCapabilityDepthObservation({ ...base, eligibleDepth: 0 }, port)
    expect(event.eventKind).toBe('supply_liquidity_depth_observed')
    expect(event.eligibleDepth).toBe(0)
    expect(event.zeroReason).toBe('no_routeable_supply')
    await expect(recordCapabilityDepthObservation({ ...base, eligibleDepth: -1 }, port)).rejects.toThrow('eligible_depth_invalid')
  })
})
