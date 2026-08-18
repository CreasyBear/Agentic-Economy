import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestFactsPost } from '@/lib/server/customer-request-facts-api'
import { expectQuarantineWriteFrozen, postJsonRequest } from '../../helpers/http'

describe('customer Request answer HTTP API', () => {
  it('freezes fact writes as RFC 9457 and does not call the application', async () => {
    const provideFacts = vi.fn()
    const valid = await handleCustomerRequestFactsPost(postJsonRequest('/api/requests/request%3A1/facts', {
      idempotencyKey: 'facts:1', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { destination: '6000' },
    }), 'request:1', { provideFacts })
    await expectQuarantineWriteFrozen(valid, 'customerRequest.run')

    const missingKey = await handleCustomerRequestFactsPost(postJsonRequest('/api/requests/request%3A1/facts', {
      idempotencyKey: 'facts:1', expectedRevision: 1, value: '6000',
    }), 'request:1', { provideFacts })
    await expectQuarantineWriteFrozen(missingKey, 'customerRequest.run')

    const sensitive = await handleCustomerRequestFactsPost(postJsonRequest('/api/requests/request%3A1/facts', {
      idempotencyKey: 'facts:sensitive', expectedRevision: 1,
      requirementKey: 'requirement:opaque', value: { password: 'synthetic-password' },
    }), 'request:1', { provideFacts })
    await expectQuarantineWriteFrozen(sensitive, 'customerRequest.run')
    expect(provideFacts).not.toHaveBeenCalled()
  })
})
