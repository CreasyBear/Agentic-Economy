import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestPost } from '@/lib/server/customer-request-api'
import { expectQuarantineWriteFrozen, postJsonRequest } from '../../helpers/http'

describe('customer Request HTTP API', () => {
  it('freezes writes as RFC 9457 and does not invoke submit', async () => {
    const submit = vi.fn()
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', {
      idempotencyKey: 'command:1', requestRef: 'request:1', agentRef: 'agent:claude', request: 'Find a suitable option',
    }), { submit })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(submit).not.toHaveBeenCalled()
  })

  it('freezes malformed Customer Request POSTs without invoking submit', async () => {
    const submit = vi.fn()
    const response = await handleCustomerRequestPost(postJsonRequest('/api/requests', { request: '' }), { submit })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(submit).not.toHaveBeenCalled()
  })
})
