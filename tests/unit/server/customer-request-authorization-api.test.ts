import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestAuthorizationPost } from '@/lib/server/customer-request-authorization-api'
import { postJsonRequest } from '../../helpers/http'

describe('customer Request preparation authorization API', () => {
  it('records explicit permission against one Request revision without protocol input', async () => {
    const authorize = vi.fn().mockResolvedValue({
      kind: 'request', requestRef: 'request:1', revision: 3, state: 'ready_to_compare',
      summary: 'Compare parcel services', nextAction: 'prepare_options', missingFields: [], criteria: [], options: [],
    })
    const response = await handleCustomerRequestAuthorizationPost(postJsonRequest('/api/requests/request%3A1/authorization', {
      revision: 3, preparationRef: 'action-preparation:1', idempotencyKey: 'authorize:request:1:3',
    }), 'request:1', { authorize })

    expect(response.status).toBe(200)
    expect(authorize).toHaveBeenCalledWith({
      requestRef: 'request:1', revision: 3,
      preparationRef: 'action-preparation:1', idempotencyKey: 'authorize:request:1:3',
    })
    expect(JSON.stringify(authorize.mock.calls[0])).not.toMatch(/field|binding|purpose|authority/)
  })

  it('does not convert missing authentication into permission', async () => {
    const response = await handleCustomerRequestAuthorizationPost(postJsonRequest('/api/requests/request%3A1/authorization', {
      revision: 1, preparationRef: 'action-preparation:1', idempotencyKey: 'authorize:1',
    }), 'request:1', { authorize: async () => ({ kind: 'refused', reason: 'authentication_required' }) })
    expect(response.status).toBe(401)
  })
})

