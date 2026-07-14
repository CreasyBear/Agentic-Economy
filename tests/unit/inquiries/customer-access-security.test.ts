import { describe, expect, it } from 'vitest'

import { brandNonEmpty } from '@/modules/common/ids'
import {
  accessIdFromInquiryCustomerAccessKey,
  issueInquiryCustomerAccess,
  verifyInquiryCustomerAccess,
  type InquiryCustomerAccessKeyring,
} from '@/modules/inquiries/public'

const now = 1_900_000_000_000
const threadId = brandNonEmpty('inquiry_thread:customer-access', 'InquiryThreadId')
const otherThreadId = brandNonEmpty('inquiry_thread:customer-access-other', 'InquiryThreadId')
const keyring: InquiryCustomerAccessKeyring = {
  keyId: 'test-inquiry-access-v1',
  secret: 'test-inquiry-access-secret-0123456789abcdef',
}

describe('inquiry customer access grants', () => {
  it('persists only a scoped verifier while issuing a signed transient bearer token', () => {
    const issued = issueInquiryCustomerAccess({ threadId, now, keyring })

    expect(issued.accessKey).toMatch(/^iak1\.[a-f0-9]{64}\.[a-f0-9]{64}$/)
    expect(issued.grant).toMatchObject({
      accessId: accessIdFromInquiryCustomerAccessKey(issued.accessKey),
      threadId,
      scope: 'customer_record',
      version: 'inquiry-customer-access:v1',
      keyId: keyring.keyId,
      status: 'active',
      verifier: expect.stringMatching(/^hmac-sha256:[a-f0-9]{64}$/),
    })
    expect(JSON.stringify(issued.grant)).not.toContain(issued.accessKey)
    expect(verifyInquiryCustomerAccess({
      grant: issued.grant,
      accessKey: issued.accessKey,
      requestedThreadId: threadId,
      now,
      keyring,
    })).toBe(true)
  })

  it('rejects cross-thread, expired, revoked, tampered, and wrong-key access', () => {
    const issued = issueInquiryCustomerAccess({ threadId, now, keyring, ttlMs: 1_000 })
    const wrongKeyring: InquiryCustomerAccessKeyring = {
      keyId: keyring.keyId,
      secret: 'different-inquiry-access-secret-0123456789abcdef',
    }
    const tamperedAccessKey = `${issued.accessKey.slice(0, -1)}${issued.accessKey.endsWith('0') ? '1' : '0'}`

    expect(verifyInquiryCustomerAccess({
      grant: issued.grant,
      accessKey: issued.accessKey,
      requestedThreadId: otherThreadId,
      now,
      keyring,
    })).toBe(false)
    expect(verifyInquiryCustomerAccess({
      grant: issued.grant,
      accessKey: issued.accessKey,
      requestedThreadId: threadId,
      now: now + 1_000,
      keyring,
    })).toBe(false)
    expect(verifyInquiryCustomerAccess({
      grant: { ...issued.grant, status: 'revoked', revokedAt: now + 1 },
      accessKey: issued.accessKey,
      requestedThreadId: threadId,
      now,
      keyring,
    })).toBe(false)
    expect(verifyInquiryCustomerAccess({
      grant: issued.grant,
      accessKey: tamperedAccessKey,
      requestedThreadId: threadId,
      now,
      keyring,
    })).toBe(false)
    expect(verifyInquiryCustomerAccess({
      grant: issued.grant,
      accessKey: issued.accessKey,
      requestedThreadId: threadId,
      now,
      keyring: wrongKeyring,
    })).toBe(false)
  })
})
