/**
 * Path C loop proof (SPEC #49): act receipt + authority stamp + delivery trail.
 * Pure evaluator — no HTTP.
 *
 * Delivery trail requires NotificationDispatchStatus via dispatch readback.
 * InquiryNotificationStatus on the act receipt is not a delivery-trail substitute.
 */

import {
  InquiryNotificationStatusValues,
  type InquiryNotificationStatus,
} from '@/modules/inquiries/public'
import {
  NotificationDispatchStatusValues,
  type NotificationDispatchStatus,
} from '@/modules/notification-outbox/public'

export type ActReceiptProof = {
  threadId: string
  businessId: string
  serviceId: string
  notificationId: string
  notificationStatus: string
  accessKey: string
}

/** Delivery trail is only proven through notification dispatch readback. */
export type DeliveryTrailProof = {
  kind: 'dispatch_readback'
  dispatchId: string
  status: NotificationDispatchStatus
  attemptCount: number
}

export type AgenticLoopProofInput = {
  /** False when the run could not attempt a signed+admitted write (env missing). */
  signingAvailable: boolean
  /** True only after inquiry.submit returned inquiry_submitted | inquiry_replayed. */
  admittedWriteSucceeded: boolean
  actReceipt?: ActReceiptProof | undefined
  authorityStampPresent: boolean
  deliveryTrail?: DeliveryTrailProof | undefined
}

export type AgenticLoopProofResult = {
  status: 'pass' | 'fail' | 'skip'
  reason: string
  evidence: readonly string[]
}

export function evaluateAgenticLoopProof(input: AgenticLoopProofInput): AgenticLoopProofResult {
  const evidence: string[] = []

  if (!input.signingAvailable) {
    return {
      status: 'skip',
      reason:
        'Signing/admission unavailable; loop proof skips instead of passing on an incomplete write.',
      evidence: ['signingAvailable=false'],
    }
  }

  if (!input.admittedWriteSucceeded) {
    return {
      status: 'fail',
      reason: 'Admitted inquiry.submit did not succeed; cannot prove the agentic loop.',
      evidence: ['admittedWriteSucceeded=false'],
    }
  }
  evidence.push('admittedWriteSucceeded=true')

  const act = validateActReceipt(input.actReceipt)
  if (act.kind === 'invalid') {
    return {
      status: 'fail',
      reason: act.reason,
      evidence: [...evidence, ...act.evidence, `authorityStampPresent=${input.authorityStampPresent}`],
    }
  }
  evidence.push(...act.evidence)

  if (!input.authorityStampPresent) {
    return {
      status: 'fail',
      reason:
        'Authority stamp missing on success. x-ae-authority-receipt is required and is not a substitute for the act receipt.',
      evidence: [...evidence, 'authorityStampPresent=false'],
    }
  }
  evidence.push('authorityStampPresent=true')

  const delivery = validateDeliveryTrail(input.deliveryTrail)
  if (delivery.kind === 'invalid') {
    return {
      status: 'fail',
      reason: delivery.reason,
      evidence: [...evidence, ...delivery.evidence],
    }
  }
  evidence.push(...delivery.evidence)

  return {
    status: 'pass',
    reason:
      'Act receipt, authority stamp, and dispatch readback delivery trail all proven. Authority stamp is separate from the act receipt.',
    evidence,
  }
}

export function parseActReceiptFromInquirySubmitBody(body: unknown): ActReceiptProof | undefined {
  if (body === null || typeof body !== 'object') {
    return undefined
  }
  if (!('receipt' in body)) {
    return undefined
  }
  const receipt = body.receipt
  if (receipt === null || typeof receipt !== 'object') {
    return undefined
  }
  const record = receipt as Record<string, unknown>
  const threadId = stringField(record, 'threadId')
  const businessId = stringField(record, 'businessId')
  const serviceId = stringField(record, 'serviceId')
  const notificationId = stringField(record, 'notificationId')
  const notificationStatus = stringField(record, 'notificationStatus')
  const accessKey = stringField(record, 'accessKey')
  if (
    threadId === undefined ||
    businessId === undefined ||
    serviceId === undefined ||
    notificationId === undefined ||
    notificationStatus === undefined ||
    accessKey === undefined
  ) {
    return undefined
  }
  return { threadId, businessId, serviceId, notificationId, notificationStatus, accessKey }
}

export function parseDeliveryTrailFromDispatchReadback(input: {
  dispatchId: string
  status: unknown
  attemptCount: number
}): DeliveryTrailProof | undefined {
  if (!isNotificationDispatchStatus(input.status)) {
    return undefined
  }
  if (input.dispatchId.trim().length === 0) {
    return undefined
  }
  return {
    kind: 'dispatch_readback',
    dispatchId: input.dispatchId,
    status: input.status,
    attemptCount: input.attemptCount,
  }
}

function validateActReceipt(
  receipt: ActReceiptProof | undefined,
): { kind: 'ok'; evidence: string[] } | { kind: 'invalid'; reason: string; evidence: string[] } {
  if (receipt === undefined) {
    return {
      kind: 'invalid',
      reason:
        'Act receipt missing. The inquiry success body receipt is the message proof; the authority stamp alone is not enough.',
      evidence: ['actReceipt=missing'],
    }
  }

  const required: Array<keyof ActReceiptProof> = [
    'threadId',
    'businessId',
    'serviceId',
    'notificationId',
    'notificationStatus',
    'accessKey',
  ]
  const missing = required.filter((key) => {
    const value = receipt[key]
    return typeof value !== 'string' || value.trim().length === 0
  })
  if (missing.length > 0) {
    return {
      kind: 'invalid',
      reason: `Act receipt incomplete; missing ${missing.join(', ')}.`,
      evidence: [`actReceipt.missing=${missing.join(',')}`],
    }
  }

  if (!isInquiryNotificationStatus(receipt.notificationStatus)) {
    return {
      kind: 'invalid',
      reason: `act receipt notificationStatus '${receipt.notificationStatus}' is not an InquiryNotificationStatus.`,
      evidence: [`actReceipt.notificationStatus=${receipt.notificationStatus}`],
    }
  }

  return {
    kind: 'ok',
    evidence: [
      `actReceipt.threadId=${receipt.threadId}`,
      `actReceipt.businessId=${receipt.businessId}`,
      `actReceipt.notificationId=${receipt.notificationId}`,
      `actReceipt.notificationStatus=${receipt.notificationStatus}`,
    ],
  }
}

function validateDeliveryTrail(
  trail: DeliveryTrailProof | undefined,
): { kind: 'ok'; evidence: string[] } | { kind: 'invalid'; reason: string; evidence: string[] } {
  if (trail === undefined) {
    return {
      kind: 'invalid',
      reason:
        'Delivery trail not proven. Path C requires NotificationDispatchStatus via readNotificationDispatchReadback; InquiryNotificationStatus on the act receipt is not sufficient.',
      evidence: ['deliveryTrail=missing'],
    }
  }

  if (trail.dispatchId.trim().length === 0) {
    return {
      kind: 'invalid',
      reason: 'Dispatch readback missing dispatchId.',
      evidence: ['deliveryTrail.dispatchId=missing'],
    }
  }
  if (!isNotificationDispatchStatus(trail.status)) {
    return {
      kind: 'invalid',
      reason: `dispatch status '${trail.status}' is not a NotificationDispatchStatus.`,
      evidence: [`deliveryTrail.status=${trail.status}`],
    }
  }
  return {
    kind: 'ok',
    evidence: [
      `deliveryTrail.kind=dispatch_readback`,
      `deliveryTrail.dispatchId=${trail.dispatchId}`,
      `deliveryTrail.status=${trail.status}`,
      `deliveryTrail.attemptCount=${trail.attemptCount}`,
    ],
  }
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function isInquiryNotificationStatus(value: string): value is InquiryNotificationStatus {
  return (InquiryNotificationStatusValues as readonly string[]).includes(value)
}

function isNotificationDispatchStatus(value: unknown): value is NotificationDispatchStatus {
  return typeof value === 'string' && (NotificationDispatchStatusValues as readonly string[]).includes(value)
}
