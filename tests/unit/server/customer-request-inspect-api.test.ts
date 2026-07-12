import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestGet } from '@/lib/server/customer-request-inspect-api'

describe('customer Request inspect HTTP API', () => {
  it('resumes from one opaque Request reference', async () => {
    const inspect = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 2, state: 'preparing_options',
      summary: 'Checking businesses', nextAction: 'wait', missingFields: [], options: [],
    })
    const response = await handleCustomerRequestGet('request:1', { inspect })
    expect(response.status).toBe(202)
    expect(inspect).toHaveBeenCalledWith({ requestRef: 'request:1' })
    await expect(response.json()).resolves.toMatchObject({ state: 'preparing_options', nextAction: 'wait' })
  })

  it('does not distinguish a foreign Request from a missing Request', async () => {
    const response = await handleCustomerRequestGet('request:unknown', {
      inspect: async () => ({ kind: 'refused', reason: 'request_not_found' }),
    })
    expect(response.status).toBe(404)
  })
})
