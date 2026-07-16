import { describe, expect, it } from 'vitest'

import { compareAgentJourneys } from '@/modules/customer-request/agent-journey-comparison'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const direct = {
  kind: 'frozen_direct_agent_baseline' as const,
  jobDigest: canonicalDigest('Find the cheapest labelled sandbox option.'),
  predeclaredGain: 'recoverable_progress',
  comparisonEligibility: { state: 'eligible' as const },
  completion: { state: 'completed' as const },
  integrationBurden: { originsProvided: 2, discoveryCalls: 2, invocationCalls: 2, schemaMappings: 1 },
  turns: { total: 4 }, elapsedMs: 40,
  hardConstraintAccuracy: { state: 'satisfied' as const },
  totalCostAccuracy: { state: 'exact' as const, total: { currency: 'AUD', amountMinor: 1_000 } },
  recovery: { state: 'unsupported' as const }, resultUsability: { state: 'usable' as const },
  invocations: [{ business: 'Sandbox Resolver' }, { business: 'Sandbox Quoter' }],
  claimBoundary: 'labelled_sandbox_direct_baseline_not_real_supply_or_customer_value' as const,
}

const ae = {
  kind: 'cold_external_agent_journey' as const, sandbox: true as const,
  input: { request: 'Find the cheapest labelled sandbox option.' },
  final: {
    state: 'completed' as const, runState: 'completed' as const, evidenceState: 'completed' as const,
    resumedState: 'completed' as const, selectedBusinesses: ['Sandbox Resolver', 'Sandbox Quoter'],
  },
  measurements: {
    integrationBurden: { requestCalls: 8, clarifications: 1 }, turns: { total: 8 }, elapsedMs: 80,
    hardConstraintAccuracy: { state: 'satisfied' as const },
    totalCostAccuracy: { state: 'exact' as const, total: { currency: 'AUD', amountMinor: 1_000 } },
    recovery: { state: 'durable' as const, resumed: true, postures: ['retry_safe' as const] },
    resultUsability: { state: 'usable' as const },
    replaySafety: { executionStart: 'same_request_monotonic_progress' as const },
  },
  claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value' as const,
}

describe('agent journey comparison', () => {
  it('passes the predeclared recovery gain only when both journeys clear zero-tolerance gates', () => {
    expect(compareAgentJourneys({ direct, ae })).toEqual(expect.objectContaining({
      verdict: 'pass_for_declared_class', predeclaredGain: 'recoverable_progress', failures: [],
      measurements: expect.objectContaining({
        completion: { direct: 'completed', ae: 'completed' },
        totalCostAccuracy: { direct: 'exact', ae: 'exact', totalsMatch: true },
        recovery: { direct: 'unsupported', ae: 'durable', aeResumed: true },
        replaySafety: { aeExecutionStart: 'same_request_monotonic_progress' },
      }),
      claimBoundary: 'labelled_sandbox_comparison_not_independently_operated_supply_fulfilment_or_customer_value',
    }))
  })

  it('fails closed when the direct baseline is comparison-ineligible', () => {
    const proof = compareAgentJourneys({
      direct: { ...direct, comparisonEligibility: { state: 'ineligible' as const } }, ae,
    })
    expect(proof.verdict).toBe('fail_for_declared_class')
    expect(proof.failures).toContain('direct_baseline_ineligible')
  })

  it('does not award recovery when any completion, constraint, cost, or usability gate fails', () => {
    const proof = compareAgentJourneys({
      direct: { ...direct, resultUsability: { state: 'partial' as const } },
      ae: { ...ae, measurements: { ...ae.measurements, totalCostAccuracy: { state: 'unavailable' as const } } },
    })
    expect(proof.verdict).toBe('fail_for_declared_class')
    expect(proof.failures).toEqual(expect.arrayContaining(['direct_result_unusable', 'ae_total_cost_not_exact']))
  })

  it('fails the zero-tolerance gate when the effect-start command was not replay-proven', () => {
    const proof = compareAgentJourneys({
      direct,
      ae: {
        ...ae,
        measurements: {
          ...ae.measurements,
          replaySafety: { executionStart: 'not_proven' as const },
        },
      },
    })
    expect(proof.verdict).toBe('fail_for_declared_class')
    expect(proof.failures).toContain('ae_execution_start_replay_not_proven')
  })

  it('fails closed for an unrecognized predeclared gain', () => {
    const proof = compareAgentJourneys({ direct: { ...direct, predeclaredGain: 'faster' }, ae })
    expect(proof.verdict).toBe('fail_for_declared_class')
    expect(proof.failures).toContain('predeclared_gain_unsupported')
  })

  it('fails closed when the job or provider set differs between paths', () => {
    const proof = compareAgentJourneys({
      direct,
      ae: { ...ae, input: { request: 'A different job.' }, final: { ...ae.final, selectedBusinesses: ['Sandbox Quoter'] } },
    })
    expect(proof.failures).toEqual(expect.arrayContaining(['request_mismatch', 'provider_set_mismatch']))
  })
})
