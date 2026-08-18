import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestAuthorizationPost } from '@/lib/server/customer-request-authorization-api'
import { expectQuarantineWriteFrozen, postJsonRequest } from '../../helpers/http'

describe('customer Request preparation authorization API', () => {
  it('freezes authorization writes as RFC 9457 before the application', async () => {
    const authorize = vi.fn()
    const recorded = await handleCustomerRequestAuthorizationPost(postJsonRequest('/api/requests/request%3A1/authorization', {
      revision: 3, preparationRef: 'action-preparation:1', idempotencyKey: 'authorize:request:1:3',
    }), 'request:1', { authorize })
    await expectQuarantineWriteFrozen(recorded, 'customerRequest.run')

    const unauthenticated = await handleCustomerRequestAuthorizationPost(postJsonRequest('/api/requests/request%3A1/authorization', {
      revision: 1, preparationRef: 'action-preparation:1', idempotencyKey: 'authorize:1',
    }), 'request:1', { authorize: async () => ({ kind: 'refused', reason: 'authentication_required' }) })
    await expectQuarantineWriteFrozen(unauthenticated, 'customerRequest.run')
    expect(authorize).not.toHaveBeenCalled()
  })
})
