import { describe, expect, it, vi } from 'vitest'

import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { postJsonRequest } from '../../helpers/http'

describe('customer options HTTP API', () => {
  it('asks the application to compare without exposing plans or capabilities', async () => {
    const compare = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 1, state: 'options_ready',
      summary: 'Options are ready', nextAction: 'inspect_options', missingFields: [], options: [],
    })
    const response = await handleCustomerOptionsPost(postJsonRequest('/api/requests/request%3A1/options', { revision: 1, idempotencyKey: 'prepare:1' }), 'request:1', { compare })
    expect(response.status).toBe(200)
    expect(compare).toHaveBeenCalledWith({ requestRef: 'request:1', revision: 1, idempotencyKey: 'prepare:1' })
    expect(JSON.stringify(compare.mock.calls[0])).not.toContain('capability')
    expect(JSON.stringify(compare.mock.calls[0])).not.toContain('plan')
  })

  it('maps in-progress preparation to an explicit retry state', async () => {
    const response = await handleCustomerOptionsPost(postJsonRequest('/api/requests/request%3A1/options', { revision: 1, idempotencyKey: 'prepare:1' }), 'request:1', {
      compare: async () => ({
        kind: 'request', requestRef: 'request:1', revision: 1, state: 'preparing_options',
        summary: 'Checking businesses', nextAction: 'wait', missingFields: [], options: [],
      }),
    })
    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({ state: 'preparing_options', nextAction: 'wait' })
  })
})

