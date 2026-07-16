import { describe, expect, it } from 'vitest'

import { parseHumanRequestObservation } from '../../../tools/dev/customer-request-development-surface-parity'

describe('development Customer Request surface parity', () => {
  it('parses exactly one typed human browser observation', () => {
    expect(parseHumanRequestObservation([
      'Running 1 test using 1 worker',
      'AE_HUMAN_REQUEST_OBSERVATION {"requestRef":"request:one","revision":2,"state":"completed","evidenceState":"completed","resultDigest":"sha256:result","businesses":["Sandbox Route Resolver","Sandbox Route Quoter"],"resumedAfterReload":true}',
      '1 passed',
    ].join('\n'))).toEqual({
      requestRef: 'request:one',
      revision: 2,
      state: 'completed',
      evidenceState: 'completed',
      resultDigest: 'sha256:result',
      businesses: ['Sandbox Route Resolver', 'Sandbox Route Quoter'],
      resumedAfterReload: true,
    })
  })

  it('refuses missing or ambiguous browser observations', () => {
    expect(() => parseHumanRequestObservation('1 passed')).toThrow('customer_request_human_observation_missing')
    expect(() => parseHumanRequestObservation([
      'AE_HUMAN_REQUEST_OBSERVATION {}',
      'AE_HUMAN_REQUEST_OBSERVATION {}',
    ].join('\n'))).toThrow('customer_request_human_observation_missing')
  })

  it('accepts a reloaded human observation for matching partial-result evidence', () => {
    expect(parseHumanRequestObservation(
      'AE_HUMAN_REQUEST_OBSERVATION {"requestRef":"request:partial","revision":1,"state":"outcome_unknown","evidenceState":"outcome_unknown","resultDigest":"sha256:partial","businesses":["Sandbox Route Resolver","Sandbox Route Quoter"],"resumedAfterReload":true}',
    )).toMatchObject({
      requestRef: 'request:partial', state: 'outcome_unknown',
      evidenceState: 'outcome_unknown', resultDigest: 'sha256:partial',
      resumedAfterReload: true,
    })
  })
})
