import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))

import {
  closeCurrentOwnerInquiryServer,
  markCurrentOwnerInquiryReadServer,
  replyCurrentOwnerInquiryServer,
  submitPublicInquiryServer,
} from '@/modules/inquiries/inquiry.functions'
import { QUARANTINE_WRITES_FROZEN_CODE } from '@/modules/product-frontier/quarantine-write-admission'

describe('quarantine write server-fn doors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('freezes public inquiry submit and owner inbox writes without HTTP 410', async () => {
    const submit = await (submitPublicInquiryServer as unknown as () => Promise<unknown>)()
    const reply = await (replyCurrentOwnerInquiryServer as unknown as () => Promise<unknown>)()
    const markRead = await (markCurrentOwnerInquiryReadServer as unknown as () => Promise<unknown>)()
    const close = await (closeCurrentOwnerInquiryServer as unknown as () => Promise<unknown>)()

    for (const result of [submit, reply, markRead, close]) {
      expect(result).toMatchObject({
        kind: 'error',
        code: QUARANTINE_WRITES_FROZEN_CODE,
        retryable: false,
      })
    }
  })
})
