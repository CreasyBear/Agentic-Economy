import { describe, expect, it } from 'vitest'

import { compareCustomerRequestSurfaces } from '@/modules/customer-request/cross-surface-parity'

const human = {
  requestRef: 'request:shared',
  revision: 4,
  state: 'completed' as const,
  evidenceState: 'completed' as const,
  resultDigest: 'sha256:shared',
  businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
  resumedAfterReload: true,
}

const agent = {
  requestRef: 'request:shared',
  revision: 4,
  state: 'completed' as const,
  evidenceState: 'completed' as const,
  resultDigest: 'sha256:shared',
  businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
}

describe('Customer Request cross-surface parity', () => {
  it('passes only when human and agent resume the same completed revision and result', () => {
    expect(compareCustomerRequestSurfaces({ human, agent })).toEqual({
      kind: 'customer_request_cross_surface_parity',
      verdict: 'pass',
      failures: [],
      requestRef: 'request:shared',
      revision: 4,
      state: 'completed',
      evidenceState: 'completed',
      resultDigest: 'sha256:shared',
      businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
      humanResumedAfterReload: true,
    })
  })

  it.each([
    ['request', { ...agent, requestRef: 'request:different' }, 'request_mismatch'],
    ['revision', { ...agent, revision: 5 }, 'revision_mismatch'],
    ['state', { ...agent, state: 'outcome_unknown' as const }, 'state_mismatch'],
    ['evidence', { ...agent, evidenceState: 'outcome_unknown' as const }, 'evidence_state_mismatch'],
    ['result', { ...agent, resultDigest: 'sha256:different' }, 'result_mismatch'],
    ['businesses', { ...agent, businesses: ['Sandbox Route Resolver'] }, 'businesses_mismatch'],
  ])('fails closed for a %s mismatch', (_label, changedAgent, failure) => {
    const proof = compareCustomerRequestSurfaces({ human, agent: changedAgent })
    expect(proof.verdict).toBe('fail')
    expect(proof.failures).toContain(failure)
  })

  it('fails when the human surface did not prove reload recovery', () => {
    const proof = compareCustomerRequestSurfaces({
      human: { ...human, resumedAfterReload: false },
      agent,
    })
    expect(proof.failures).toContain('human_reload_resume_not_proven')
  })
})
