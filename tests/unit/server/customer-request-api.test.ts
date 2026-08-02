import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'
import { postJsonRequest } from '../../helpers/http'

describe('customer Request HTTP API', () => {
  it('maps agent-facing input into the authenticated application command and returns customer semantics', async () => {
    const submit = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 1, state: 'ready_to_compare',
      summary: 'Find a suitable option', nextAction: 'prepare_options', missingFields: [], options: [],
    })
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', {
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
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', { request: '' }), { submit })
    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
  })

  it('refuses payment-card and account-secret oversharing before model release or Request persistence', async () => {
    const submit = vi.fn()
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', {
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

  it('returns the durable retryable Request shell without issuing a hidden duplicate submit', async () => {
    const submit = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:retry', revision: 0, state: 'needs_attention',
      summary: 'AE saved your request but could not interpret it yet. Try again.',
      nextAction: 'retry', missingFields: [], options: [],
    })

    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', {
      idempotencyKey: 'command:retry', requestRef: 'request:retry',
      agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit })

    expect(submit).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      requestRef: 'request:retry',
      revision: 0,
      state: 'needs_attention',
      nextAction: 'retry',
    })
  })
})

