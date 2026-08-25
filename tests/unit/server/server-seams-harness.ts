import { afterEach, vi } from 'vitest'
import { createHmac } from 'node:crypto'

export const convexUrl = 'https://happy-animal-123.convex.cloud'
export const publicEnvPrefix = 'VI' + 'TE_'

export const resendWebhookNow = 1_777_000_000_000
export const resendWebhookSvixTimestamp = String(Math.floor(resendWebhookNow / 1000))
export const resendWebhookSvixId = 'msg_resend_evt_123'
export const resendWebhookSecret = `whsec_${Buffer.from('resend-test-secret').toString('base64')}`
export const resendWebhookRawBody = JSON.stringify({
  type: 'email.delivered',
  data: {
    email_id: 'resend_email_123',
    to: 'customer@example.test',
    subject: 'Private subject should not pass through',
  },
})

afterEach(() => {
  vi.unstubAllEnvs()
})

export function signedResendHeaders(secret: string, rawBody: string, svixId: string, svixTimestamp: string): Headers {
  const normalizedSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const key = Buffer.from(normalizedSecret, 'base64')
  const signature = createHmac('sha256', key).update(`${svixId}.${svixTimestamp}.${rawBody}`).digest('base64')
  return new Headers({
    'content-type': 'application/json',
    'svix-id': svixId,
    'svix-timestamp': svixTimestamp,
    'svix-signature': `v1,${signature}`,
  })
}

export function sourceWriteContext() {
  return {
    sourceWriteRequest: {
      method: 'POST',
      initiatorOrigin: 'https://ae.example',
      targetOrigin: 'https://ae.example',
      targetPath: '/inquiries',
      targetQuery: '',
      bodyDigest: 'none',
    },
  }
}

export function dispatchProjection() {
  return {
    dispatchId: 'notification_dispatch:123',
    businessId: 'businesses:1',
    inquiryThreadId: 'inquiry_thread:abc',
    inquiryMessageId: 'inquiry_message:abc',
    recipientRole: 'owner' as const,
    providerFamily: 'resend' as const,
    status: 'queued' as const,
    providerIdempotencyKey: 'ae:notification_dispatch:123',
    payloadHash: 'payload-hash',
    providerMissing: false,
    orchestratorMissing: false,
    retryCount: 0,
    operationKey: 'notification:enqueue:123',
    correlationId: 'correlation:notification:123',
    createdAt: 1,
    updatedAt: 1,
  }
}

export function dispatchSendReadback() {
  return {
    kind: 'ok' as const,
    code: 'notification_dispatch_send_read' as const,
    send: {
      dispatch: dispatchProjection(),
      owner: {
        ownerId: 'owners:1',
        clerkUserId: 'user_sam',
      },
      business: {
        businessId: 'businesses:1',
        slug: 'sam-plumbing',
        name: 'Sam Plumbing',
      },
      inquiry: {
        offeringName: 'Emergency plumbing',
        customerMessageFirstLine: 'Burst pipe under the kitchen sink.',
        isFirstInquiryForBusiness: true,
      },
    },
  }
}

export function novuDispatchSendReadback(overrides: Record<string, unknown> = {}) {
  return {
    ...dispatchSendReadback(),
    send: {
      ...dispatchSendReadback().send,
      dispatch: {
        ...dispatchProjection(),
        providerFamily: 'novu' as const,
        ...overrides,
      },
    },
  }
}
