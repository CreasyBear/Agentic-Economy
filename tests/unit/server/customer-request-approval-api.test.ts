import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestApprovalPost } from '@/lib/server/customer-request-approval-api'

describe('customer Request Approval Grant API', () => {
  it('accepts only a Prepared Action identity and narrower customer authority', async () => {
    const approve = vi.fn().mockResolvedValue({
      kind: 'approved', requestRef: 'request:1', revision: 3,
      approvalRef: 'approval-grant:v2:one', preparedActionRef: 'prepared-action:v2:one',
      spend: { currency: 'AUD', maximumAmountMinor: 1_100 }, expiresAt: 50_000,
      recovery: { unknownOutcome: 'reconcile_only', automaticRetry: false },
    })
    const response = await handleCustomerRequestApprovalPost(request({
      revision: 3,
      preparedActionRef: 'prepared-action:v2:one',
      maximumSpendMinor: 1_100,
      expiresAt: 50_000,
      idempotencyKey: 'approve:request:1:3',
    }), 'request:1', { approve })

    expect(response.status).toBe(200)
    expect(approve).toHaveBeenCalledWith({
      requestRef: 'request:1', revision: 3,
      preparedActionRef: 'prepared-action:v2:one', maximumSpendMinor: 1_100,
      expiresAt: 50_000, idempotencyKey: 'approve:request:1:3',
    })
    expect(JSON.stringify(approve.mock.calls[0])).not.toMatch(/contract|offering|binding|effect|evidence|provider|currency|recovery/)
  })

  it('rejects caller-supplied authority and never forwards it to the application', async () => {
    const approve = vi.fn()
    const response = await handleCustomerRequestApprovalPost(request({
      revision: 3, preparedActionRef: 'prepared-action:v2:one', maximumSpendMinor: 1_100,
      expiresAt: 50_000, idempotencyKey: 'approve:request:1:3',
      contractRef: { capabilityId: 'caller-controlled' },
    }), 'request:1', { approve })

    expect(response.status).toBe(400)
    expect(approve).not.toHaveBeenCalled()
  })

  it('does not convert missing owner authentication into approval', async () => {
    const response = await handleCustomerRequestApprovalPost(request({
      revision: 1, preparedActionRef: 'prepared-action:v2:one', maximumSpendMinor: 900,
      expiresAt: 50_000, idempotencyKey: 'approve:1',
    }), 'request:1', {
      approve: async () => ({ kind: 'refused', reason: 'authentication_required' }),
    })
    expect(response.status).toBe(401)
  })
})

function request(body: unknown): Request {
  return new Request('https://ae.test/api/requests/request%3A1/approval', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
