import { describe, expect, it, vi } from 'vitest'

import { handleCustomerRequestGet } from '@/lib/server/customer-request-inspect-api'
import { expectQuarantineWriteFrozen } from '../../helpers/http'

describe('customer Request inspect HTTP API', () => {
  it('tombstones resume GET as RFC 9457 410 without Convex inspect', async () => {
    const inspect = vi.fn()
    const response = await handleCustomerRequestGet('request:1', { inspect })
    await expectQuarantineWriteFrozen(response, 'customerRequest.run')
    expect(inspect).not.toHaveBeenCalled()
  })
})
