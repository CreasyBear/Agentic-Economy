import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestFactsPost } from '@/lib/server/customer-request-facts-api'

describe('customer Request answer HTTP API', () => {
  it('provides one opaque requirement answer and optimistic revision to the source application', async () => {
    const provideFacts = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 2, state: 'ready_to_compare',
      summary: 'Ready', nextAction: 'prepare_options', missingFields: [], options: [],
    })
    const response = await handleCustomerRequestFactsPost(request({
      idempotencyKey: 'facts:1', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    }), 'request:1', { provideFacts })
    expect(response.status).toBe(200)
    expect(provideFacts).toHaveBeenCalledWith({
      requestRef: 'request:1', idempotencyKey: 'facts:1', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    })
    const serialized = JSON.stringify(provideFacts.mock.calls[0])
    for (const forbidden of ['agentRef', 'capability', 'binding', 'plan', 'digest']) expect(serialized).not.toContain(forbidden)
  })

  it('rejects an answer without an opaque requirement key before calling the application', async () => {
    const provideFacts = vi.fn()
    const response = await handleCustomerRequestFactsPost(request({
      idempotencyKey: 'facts:1', expectedRevision: 1, value: '6000',
    }), 'request:1', { provideFacts })
    expect(response.status).toBe(400)
    expect(provideFacts).not.toHaveBeenCalled()
  })
})

function request(body: unknown): Request {
  return new Request('https://ae.test/api/requests/request%3A1/facts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
