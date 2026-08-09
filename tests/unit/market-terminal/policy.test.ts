import { describe, expect, it } from 'vitest'

import {
  DEFAULT_POLICY,
  applyChanges,
  enforcePolicy,
  fidelityReport,
  refinePolicy,
  runPolicySuite,
  type Policy,
  type PolicyScenario,
  type PolicyTest,
} from '../../../tools/ae/lib/policy'

const keyless: PolicyScenario = {
  capabilityId: 'crypto.price',
  credentialRef: 'none',
  adapterId: 'http-json:v1',
  method: 'GET',
  sourceKind: 'openapi_http',
  endpointUrl: 'https://api.coingecko.com/api/v3/simple/price',
  expectedResultBytes: 2048,
}

describe('policy enforcement (the translate+validate gate)', () => {
  it('admits a keyless https GET', () => {
    expect(enforcePolicy(DEFAULT_POLICY, keyless)).toEqual({ verdict: 'execute', reason: 'none' })
  })

  it('refuses a keyed op (keyless_only)', () => {
    expect(enforcePolicy(DEFAULT_POLICY, { ...keyless, credentialRef: 'env:SOME_KEY' })).toEqual({ verdict: 'refuse', reason: 'keyless_only' })
  })

  it('refuses an observed x402 listing (block_provenance)', () => {
    expect(enforcePolicy(DEFAULT_POLICY, { ...keyless, sourceKind: 'x402' })).toEqual({ verdict: 'refuse', reason: 'block_provenance' })
  })

  it('refuses a non-HTTPS endpoint (https_only SSRF floor)', () => {
    expect(enforcePolicy(DEFAULT_POLICY, { ...keyless, endpointUrl: 'http://api.coingecko.com/x' })).toEqual({ verdict: 'refuse', reason: 'https_only' })
  })

  it('refuses an oversized response (max_result_bytes)', () => {
    expect(enforcePolicy(DEFAULT_POLICY, { ...keyless, expectedResultBytes: 2_000_000 })).toEqual({ verdict: 'refuse', reason: 'max_result_bytes' })
  })

  it('refuses a POST when only GET is allowed', () => {
    expect(enforcePolicy(DEFAULT_POLICY, { ...keyless, method: 'POST' })).toEqual({ verdict: 'refuse', reason: 'allowed_methods' })
  })
})

describe('policy refine (suggestion authority) + review gate (commit authority)', () => {
  // A policy that wrongly admits a keyed op: the governance loop must propose
  // tightening the keyless gate and NOT apply it on its own.
  const relaxed: Policy = { ...DEFAULT_POLICY, keylessOnly: false, allowKeyedRefs: ['env:LEAKED_KEY'] }

  const suite: PolicyTest[] = [
    { name: 'keyless.ok', scenario: keyless, expected: 'execute', failureClass: 'rule' },
    { name: 'leaked.keyed.must.refuse', scenario: { ...keyless, credentialRef: 'env:LEAKED_KEY' }, expected: 'refuse', failureClass: 'rule' },
  ]

  it('flags the failure as INVALID', () => {
    const findings = runPolicySuite(relaxed, suite)
    const leaked = findings.find((f) => f.name === 'leaked.keyed.must.refuse')
    expect(leaked?.finding).toBe('INVALID')
    expect(findings.find((f) => f.name === 'keyless.ok')?.finding).toBe('VALID')
  })

  it('proposes a rule edit but does NOT apply it (engine has no commit authority)', () => {
    const proposal = refinePolicy(relaxed, suite)
    expect(proposal.changes.length).toBeGreaterThan(0)
    expect(proposal.changes[0]!.kind).toBe('edit_rule')
    expect(proposal.changes[0]!.rule).toBe('keyless_only')
    // The relaxed policy must still be unchanged until the human accepts.
    expect(relaxed.keylessOnly).toBe(false)
  })

  it('applyChanges is the only mutator behind the review gate', () => {
    const proposal = refinePolicy(relaxed, suite)
    expect(proposal.changes[0]).toBeDefined()
    const accepted = applyChanges(relaxed, proposal)
    expect(accepted.keylessOnly).toBe(true)
    expect(accepted.allowKeyedRefs).toEqual([])
    // Applying the accepted policy flips the failing test to VALID.
    const after = runPolicySuite(accepted, suite)
    expect(after.find((f) => f.name === 'leaked.keyed.must.refuse')?.finding).toBe('VALID')
  })
})

describe('policy fidelity report', () => {
  it('scores coverage and accuracy against the ground-truth catalog', () => {
    const report = fidelityReport(DEFAULT_POLICY, [keyless, { ...keyless, credentialRef: 'env:K' }])
    // coverage: 1 of 2 facts admitted (the keyed one stays out)
    expect(report.coverage).toBeCloseTo(0.5)
    // accuracy: all admitted facts are genuine keyless-http-json
    expect(report.accuracy).toBeCloseTo(1)
    expect(report.perRuleGrounding.length).toBeGreaterThanOrEqual(6)
  })
})
