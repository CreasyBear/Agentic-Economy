import { describe, expect, it } from 'vitest'

import { parseHumanRequestObservation } from '../../../tools/dev/customer-request-development-surface-parity'

describe('development Customer Request surface parity', () => {
  it('parses exactly one typed human browser observation', () => {
    expect(parseHumanRequestObservation([
      'Running 1 test using 1 worker',
      'AE_HUMAN_REQUEST_OBSERVATION {"requestRef":"request:one","revision":2,"state":"completed","evidenceState":"completed","resultDigest":"sha256:result","resumedAfterReload":true}',
      '1 passed',
    ].join('\n'))).toEqual({
      requestRef: 'request:one',
      revision: 2,
      state: 'completed',
      evidenceState: 'completed',
      resultDigest: 'sha256:result',
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
})
