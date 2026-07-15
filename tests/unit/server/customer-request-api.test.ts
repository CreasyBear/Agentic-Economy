import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'

describe('customer Request HTTP API', () => {
  it('maps agent-facing input into the authenticated application command and returns customer semantics', async () => {
    const submit = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 1, state: 'ready_to_compare',
      summary: 'Find a suitable option', nextAction: 'prepare_options', missingFields: [], options: [],
    })
    const response = await handleCustomerRequestPost(request({
      idempotencyKey: 'command:1', requestRef: 'request:1', agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit })

    expect(response.status).toBe(200)
    expect(submit).toHaveBeenCalledWith({
      compilationKey: 'command:1', requestId: 'request:1', delegatedAgentId: 'agent:claude',
      customerJob: 'Find a suitable option',
      routing: { networkId: 'ae:public' },
    })
    await expect(response.json()).resolves.toMatchObject({ state: 'ready_to_compare', nextAction: 'prepare_options' })
  })

  it('rejects malformed input before invoking the application', async () => {
    const submit = vi.fn()
    const response = await handleCustomerRequestPost(request({ request: '' }), { submit })
    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
  })

  it('refuses payment-card and account-secret oversharing before model release or Request persistence', async () => {
    const submit = vi.fn()
    const response = await handleCustomerRequestPost(request({
      idempotencyKey: 'command:sensitive', requestRef: 'request:sensitive', agentRef: 'agent:claude',
      request: 'Find the cheapest option. My card is 4242 4242 4242 4242 and password is synthetic-password.',
    }), { submit })

    expect(response.status).toBe(422)
    expect(submit).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toEqual({
      kind: 'refused',
      reason: 'sensitive_information_not_accepted',
      summary: 'Remove payment card and account-secret details before submitting this request.',
      nextAction: 'revise_request',
    })
  })

  it('replays one uncommitted creation response instead of exposing a revision-zero Request', async () => {
    const submit = vi.fn()
      .mockResolvedValueOnce({
        kind: 'request', requestRef: 'request:retry', revision: 0, state: 'needs_attention',
        summary: 'The request changed before it could be recorded. Try again.',
        nextAction: 'retry', missingFields: [], options: [],
      })
      .mockResolvedValueOnce({
        kind: 'request', requestRef: 'request:retry', revision: 1, state: 'needs_information',
        summary: 'Find a suitable option', nextAction: 'provide_information', missingFields: [], options: [],
      })

    const response = await handleCustomerRequestPost(request({
      idempotencyKey: 'command:retry', requestRef: 'request:retry',
      agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit })

    expect(submit).toHaveBeenCalledTimes(2)
    expect(submit.mock.calls[1]).toEqual(submit.mock.calls[0])
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ revision: 1, state: 'needs_information' })
  })

  it('fails unavailable after one replay rather than presenting an uncommitted Request as durable', async () => {
    const uncommitted = {
      kind: 'request' as const, requestRef: 'request:retry', revision: 0,
      state: 'needs_attention' as const,
      summary: 'The request changed before it could be recorded. Try again.',
      nextAction: 'retry' as const, missingFields: [], options: [],
    }
    const submit = vi.fn().mockResolvedValue(uncommitted)

    const response = await handleCustomerRequestPost(request({
      idempotencyKey: 'command:retry', requestRef: 'request:retry',
      agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit })

    expect(submit).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ error: 'request_unavailable' })
  })
})

function request(body: unknown): Request {
  return new Request('https://ae.test/api/requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
