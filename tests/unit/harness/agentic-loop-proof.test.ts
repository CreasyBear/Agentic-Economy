import { describe, expect, it } from 'vitest'

import {
  evaluateAgenticLoopProof,
  parseActReceiptFromInquirySubmitBody,
  parseDeliveryTrailFromDispatchReadback,
  type ActReceiptProof,
} from '@/modules/harness/agentic-loop-proof'

const fullReceipt: ActReceiptProof = {
  threadId: 'inquiry_thread:1',
  businessId: 'business:plumbing-demo',
  serviceId: 'service:business:plumbing-demo:emergency-plumbing',
  notificationId: 'inquiry_notification:1',
  notificationStatus: 'held',
  accessKey: 'access:test',
}

const dispatchTrail = {
  kind: 'dispatch_readback' as const,
  dispatchId: 'notification_dispatch:1',
  status: 'queued' as const,
  attemptCount: 0,
}

describe('evaluateAgenticLoopProof (path C)', () => {
  it('skips when signing is unavailable instead of passing', () => {
    const result = evaluateAgenticLoopProof({
      signingAvailable: false,
      admittedWriteSucceeded: false,
      authorityStampPresent: true,
      actReceipt: fullReceipt,
      deliveryTrail: dispatchTrail,
    })
    expect(result.status).toBe('skip')
  })

  it('fails when only the authority stamp is present', () => {
    const result = evaluateAgenticLoopProof({
      signingAvailable: true,
      admittedWriteSucceeded: true,
      authorityStampPresent: true,
      actReceipt: undefined,
      deliveryTrail: undefined,
    })
    expect(result.status).toBe('fail')
    expect(result.reason).toMatch(/Act receipt missing/i)
  })

  it('fails when act receipt and stamp exist but dispatch readback is missing', () => {
    const result = evaluateAgenticLoopProof({
      signingAvailable: true,
      admittedWriteSucceeded: true,
      authorityStampPresent: true,
      actReceipt: fullReceipt,
      deliveryTrail: undefined,
    })
    expect(result.status).toBe('fail')
    expect(result.reason).toMatch(/readNotificationDispatchReadback/i)
  })

  it('fails when authority stamp is missing', () => {
    const result = evaluateAgenticLoopProof({
      signingAvailable: true,
      admittedWriteSucceeded: true,
      authorityStampPresent: false,
      actReceipt: fullReceipt,
      deliveryTrail: dispatchTrail,
    })
    expect(result.status).toBe('fail')
    expect(result.reason).toMatch(/Authority stamp missing/i)
  })

  it('passes only with act receipt, authority stamp, and dispatch readback', () => {
    const result = evaluateAgenticLoopProof({
      signingAvailable: true,
      admittedWriteSucceeded: true,
      authorityStampPresent: true,
      actReceipt: fullReceipt,
      deliveryTrail: dispatchTrail,
    })
    expect(result.status).toBe('pass')
    expect(result.evidence).toContain('deliveryTrail.kind=dispatch_readback')
  })

  it('parses act receipt from inquiry.submit success body', () => {
    const parsed = parseActReceiptFromInquirySubmitBody({
      kind: 'ok',
      code: 'inquiry_submitted',
      receipt: fullReceipt,
    })
    expect(parsed).toEqual(fullReceipt)
  })

  it('parses delivery trail only for NotificationDispatchStatus', () => {
    expect(
      parseDeliveryTrailFromDispatchReadback({
        dispatchId: 'notification_dispatch:1',
        status: 'queued',
        attemptCount: 0,
      }),
    ).toEqual(dispatchTrail)
    expect(
      parseDeliveryTrailFromDispatchReadback({
        dispatchId: 'notification_dispatch:1',
        status: 'held',
        attemptCount: 0,
      }),
    ).toBeUndefined()
  })
})
