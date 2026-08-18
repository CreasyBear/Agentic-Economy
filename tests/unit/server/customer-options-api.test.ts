import { describe, expect, it, vi } from 'vitest'

import { handleCustomerOptionsPost } from '@/lib/server/customer-options-api'
import { expectQuarantineWriteFrozen, postJsonRequest } from '../../helpers/http'

describe('customer options HTTP API', () => {
  it('freezes option-preparation writes as RFC 9457', async () => {
    const compare = vi.fn()
    const response = await handleCustomerOptionsPost(
      postJsonRequest('/api/requests/request%3A1/options', { revision: 1, idempotencyKey: 'prepare:1' }),
      'request:1',
      { compare },
    )
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(compare).not.toHaveBeenCalled()
  })
})
