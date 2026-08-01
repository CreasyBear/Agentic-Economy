import { describe, expect, it } from 'vitest'

import { decodePrivateRecordFragment } from '@/lib/observability/private-route-safety'
import { customerInquiryRecordLink } from '@/lib/server/notification-provider'

/**
 * The emailed link is the customer's only way back into a reply from a fresh
 * session. It shipped built by hand as `#record?access=…` while the decoder
 * accepts only `#record&access=…`, so every recipient without a cached session
 * key landed on "record not available".
 */
describe('customer inquiry record link', () => {
  it('round-trips through the private record decoder', () => {
    const link = customerInquiryRecordLink('https://ae.example', 'thread_1', 'access-key-1')
    expect(link).toBeDefined()

    const hash = new URL(link as string).hash
    expect(decodePrivateRecordFragment(hash)).toBe('access-key-1')
  })

  it('points at the record route for the named thread', () => {
    const link = customerInquiryRecordLink('https://ae.example', 'thread/1', 'key')
    expect(new URL(link as string).pathname).toBe('/t/thread%2F1')
  })

  it('withholds a link when the base url or access token is missing', () => {
    expect(customerInquiryRecordLink(undefined, 'thread_1', 'key')).toBeUndefined()
    expect(customerInquiryRecordLink('  ', 'thread_1', 'key')).toBeUndefined()
    expect(customerInquiryRecordLink('https://ae.example', 'thread_1', '  ')).toBeUndefined()
  })
})
