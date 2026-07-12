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
      customerJob: 'Find a suitable option', knownFacts: {},
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
})

function request(body: unknown): Request {
  return new Request('https://ae.test/api/requests', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
