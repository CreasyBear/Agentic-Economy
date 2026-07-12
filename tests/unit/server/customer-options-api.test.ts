import { describe, expect, it, vi } from 'vitest'

import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'

describe('customer options HTTP API', () => {
  it('asks the application to compare without exposing plans or capabilities', async () => {
    const compare = vi.fn().mockResolvedValue({
      kind: 'options', requestRef: 'request:1', revision: 1,
      options: { inspectionRef: 'options_1', candidates: [], attempts: [] },
    })
    const response = await handleCustomerOptionsPost(request({ revision: 1, idempotencyKey: 'compare:1' }), 'request:1', { compare })
    expect(response.status).toBe(200)
    expect(compare).toHaveBeenCalledWith({ requestRef: 'request:1', revision: 1, idempotencyKey: 'compare:1' })
    expect(JSON.stringify(compare.mock.calls[0])).not.toContain('capability')
    expect(JSON.stringify(compare.mock.calls[0])).not.toContain('plan')
  })

  it('maps in-progress preparation to an explicit retry state', async () => {
    const response = await handleCustomerOptionsPost(request({ revision: 1, idempotencyKey: 'compare:1' }), 'request:1', {
      compare: async () => ({ kind: 'checking', requestRef: 'request:1', revision: 1, nextAction: 'check_again' }),
    })
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({ kind: 'checking', nextAction: 'check_again' })
  })
})

function request(body: unknown): Request {
  return new Request('https://ae.test/api/requests/request%3A1/options', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
