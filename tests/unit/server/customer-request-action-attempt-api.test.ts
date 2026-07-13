import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestActionAttemptPost } from '@/lib/server/customer-request-action-attempt-api'

describe('customer Request Action Attempt API', () => {
  it('forwards only bounded customer admission identifiers', async () => {
    const admit = vi.fn().mockResolvedValue({
      kind: 'accepted', requestRef: 'request:one', revision: 1,
      actionAttemptRef: 'action-attempt:v2:one', state: 'admitted', expiresAt: 9_000,
      recovery: { unknownOutcome: 'reconcile_only', automaticRetry: false },
    })
    const response = await handleCustomerRequestActionAttemptPost(new Request('https://ae.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        revision: 1, approvalGrantRef: 'approval-grant:v2:one', idempotencyKey: 'admit:one',
      }),
    }), 'request:one', { admit })

    expect(response.status).toBe(202)
    expect(admit).toHaveBeenCalledWith({
      requestRef: 'request:one', revision: 1,
      approvalGrantRef: 'approval-grant:v2:one', idempotencyKey: 'admit:one',
    })
  })

  it('rejects caller-built attempt, grant, reservation and protocol material', async () => {
    for (const injected of ['actionAttempt', 'providerReleaseGrant', 'disclosureGrant', 'spendReservation', 'bindingId']) {
      const response = await handleCustomerRequestActionAttemptPost(new Request('https://ae.test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: 1, approvalGrantRef: 'approval-grant:v2:one', idempotencyKey: 'admit:one',
          [injected]: {},
        }),
      }), 'request:one')
      expect(response.status, injected).toBe(400)
    }
  })
})
