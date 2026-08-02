import { describe, expect, it } from 'vitest'

import {
  readNovuTransactionMessages,
  resolveClerkOwnerDeliveryAddress,
  sendOwnerInquiryResendEmail,
  triggerOwnerInquiryNovuWorkflow,
} from '@/lib/server/notification-provider'

describe('notification provider network boundaries', () => {
  it('applies redirect refusal and abort timeout plumbing to Clerk, Resend, and Novu calls', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      if (calls.length === 1) {
        return new Response(JSON.stringify({
          id: 'user_sam',
          primary_email_address_id: 'email_primary',
          email_addresses: [{ id: 'email_primary', email_address: 'owner@example.test' }],
        }))
      }
      if (calls.length === 2) {
        return new Response(JSON.stringify({ id: 'resend_email_123' }))
      }
      if (calls.length === 3) {
        return new Response(JSON.stringify({
          acknowledged: true,
          transactionId: 'ae:notification_dispatch:123',
        }))
      }
      return new Response(JSON.stringify({ totalCount: 0, hasMore: false, data: [] }))
    }

    await expect(resolveClerkOwnerDeliveryAddress({
      clerkUserId: 'user_sam',
      secretKey: 'clerk_test',
      apiBaseUrl: 'https://clerk.example.test/v1',
      fetch,
    })).resolves.toMatchObject({ email: 'owner@example.test' })

    await expect(sendOwnerInquiryResendEmail({
      config: {
        apiKey: 'resend_test',
        from: 'Agentic Economy <hello@example.test>',
        apiBaseUrl: 'https://resend.example.test',
      },
      ownerEmail: 'owner@example.test',
      dispatch: {
        dispatchId: 'notification_dispatch:123',
        providerIdempotencyKey: 'ae:notification_dispatch:123',
        inquiryThreadId: 'inquiry_thread:abc',
      },
      fetch,
    })).resolves.toMatchObject({ resendMessageId: 'resend_email_123' })

    await expect(triggerOwnerInquiryNovuWorkflow({
      config: {
        secretKey: 'novu_test',
        ownerInquiryWorkflowId: 'owner-inquiry',
        apiBaseUrl: 'https://novu.example.test',
      },
      subscriberId: 'owner:user_sam',
      dispatch: {
        dispatchId: 'notification_dispatch:123',
        providerIdempotencyKey: 'ae:notification_dispatch:123',
        inquiryThreadId: 'inquiry_thread:abc',
      },
      fetch,
    })).resolves.toMatchObject({ novuTransactionId: 'ae:notification_dispatch:123' })

    await expect(readNovuTransactionMessages({
      config: {
        secretKey: 'novu_test',
        ownerInquiryWorkflowId: 'owner-inquiry',
        apiBaseUrl: 'https://novu.example.test',
      },
      transactionId: 'ae:notification_dispatch:123',
      fetch,
    })).resolves.toMatchObject({ transactionId: 'ae:notification_dispatch:123' })

    expect(calls).toHaveLength(4)
    for (const call of calls) {
      expect(call.init.redirect).toBe('error')
      expect(call.init.signal).toBeInstanceOf(AbortSignal)
    }
  })

  it('refuses an oversized provider response before parsing it', async () => {
    await expect(sendOwnerInquiryResendEmail({
      config: {
        apiKey: 'resend_test',
        from: 'Agentic Economy <hello@example.test>',
        apiBaseUrl: 'https://resend.example.test',
      },
      ownerEmail: 'owner@example.test',
      dispatch: {
        dispatchId: 'notification_dispatch:123',
        providerIdempotencyKey: 'ae:notification_dispatch:123',
        inquiryThreadId: 'inquiry_thread:abc',
      },
      fetch: async () => new Response('', {
        headers: { 'content-length': String(64 * 1024 + 1) },
      }),
    })).rejects.toMatchObject({ code: 'invalid_resend_send_payload' })
  })
})
