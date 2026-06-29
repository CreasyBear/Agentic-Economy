import { describe, expect, it } from 'vitest'
import { getFunctionName } from 'convex/server'
import { createHmac } from 'node:crypto'

import {
  ConvexSourceError,
  callSourceMutation,
  createAuthenticatedConvexClient,
  readRequiredConvexAuthToken,
  readRequiredConvexUrl,
  sourceConvexApi,
  sourceConvexFunctions,
  sourceMutation,
} from '@/lib/server/convex-source'
import {
  readInquiryOperatorReconstructionThroughSource,
  readCurrentOwnerInboxThroughSource,
  readCurrentOwnerInquiryThreadThroughSource,
  markCurrentOwnerInquiryReadThroughSource,
  replyCurrentOwnerInquiryThroughSource,
} from '@/modules/inquiries/inquiry.functions'
import {
  BillingProviderError,
  readAutumnClientConfig,
  verifyAutumnWebhook,
} from '@/lib/server/billing-provider'
import {
  NotificationProviderError,
  readClerkSecretKey,
  readNovuClientConfig,
  readNovuTransactionMessages,
  readNotificationOutboxSystemKey,
  readResendClientConfig,
  readResendWebhookSecret,
  resolveClerkOwnerDeliveryAddress,
  sendOwnerInquiryResendEmail,
  triggerOwnerInquiryNovuWorkflow,
  verifyResendWebhook,
} from '@/lib/server/notification-provider'
import { handleBillingWebhookRequest } from '@/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook'
import { handleNovuDispatchRequest } from '@/routes/api.notification.novu-dispatch'
import { handleResendDispatchRequest } from '@/routes/api.notification.resend-dispatch'
import { handleResendWebhookRequest } from '@/routes/api.notification.resend-webhook'

const convexUrl = 'https://happy-animal-123.convex.cloud'
const publicEnvPrefix = 'VI' + 'TE_'

describe('server Convex source seam', () => {
  it('requires a Convex URL from server env', () => {
    expect(() => readRequiredConvexUrl({})).toThrow(ConvexSourceError)
    expect(() => readRequiredConvexUrl({})).toThrow(expect.objectContaining({ code: 'missing_convex_url', status: 500 }))
  })

  it('uses the existing public Convex URL only as a non-secret fallback', () => {
    expect(readRequiredConvexUrl({ VITE_CONVEX_URL: ` ${convexUrl} ` })).toBe(convexUrl)
  })

  it('requires an authenticated Clerk session and Convex token', async () => {
    await expect(
      readRequiredConvexAuthToken({ isAuthenticated: false, getToken: async () => null })
    ).rejects.toMatchObject({ code: 'missing_auth', status: 401 })

    await expect(
      readRequiredConvexAuthToken({ isAuthenticated: true, getToken: async () => ' ' })
    ).rejects.toMatchObject({ code: 'missing_auth', status: 401 })
  })

  it('creates a fresh credentialed Convex client for each owner request', async () => {
    const authObject = { isAuthenticated: true, getToken: async () => 'owner.jwt' }

    const first = await createAuthenticatedConvexClient({ env: { CONVEX_URL: convexUrl }, authObject })
    const second = await createAuthenticatedConvexClient({ env: { CONVEX_URL: convexUrl }, authObject })

    expect(first).not.toBe(second)
    expect(first.url).toBe(convexUrl)
    expect(second.url).toBe(convexUrl)
  })

  it('offers a reusable authenticated mutation caller for server functions', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ status: 'success', value: 'stored' }))
    }

    await expect(
      callSourceMutation(
        sourceMutation<{ value: string }, string>('test:mutation'),
        { value: 'publish' },
        {
          env: { CONVEX_URL: convexUrl },
          authObject: { isAuthenticated: true, getToken: async () => 'owner.jwt' },
          fetch,
        }
      )
    ).resolves.toBe('stored')

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${convexUrl}/api/mutation`)
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer owner.jwt' })
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      path: 'test:mutation',
      args: [{ value: 'publish' }],
    })
  })

  it('keeps source-owned function references available without generated Convex API output', () => {
    expect(sourceConvexApi).toBeTruthy()
    expect(getFunctionName(sourceConvexFunctions.catalog.publishBusinessCatalog)).toBe('catalog:publishBusinessCatalog')
  })

  it('serves deterministic owner inquiry readbacks only for local Clerk-bypass evidence', async () => {
    const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const inbox = await readCurrentOwnerInboxThroughSource()
      expect(inbox).toMatchObject({ kind: 'ok', inbox: { empty: false } })
      if (inbox.kind !== 'ok') {
        throw new Error('Expected local e2e owner inbox readback.')
      }

      const firstInquiry = inbox.inbox.inquiries[0]
      expect(firstInquiry).toMatchObject({
        businessName: 'Demo Plumbing',
        serviceName: 'Emergency plumbing',
        status: 'replied',
      })

      const detail = await readCurrentOwnerInquiryThreadThroughSource(firstInquiry?.threadId ?? '')
      expect(detail).toMatchObject({ kind: 'ok' })
      if (detail.kind !== 'ok') {
        throw new Error('Expected local e2e owner thread detail.')
      }

      expect(detail.detail.messages).toHaveLength(2)
      expect(detail.delivery.notifications.map((notification) => notification.status).sort()).toEqual(['failed', 'queued'])

      await expect(
        markCurrentOwnerInquiryReadThroughSource({
          threadId: detail.detail.inquiry.threadId,
          expectedVersion: detail.detail.inquiry.version,
        })
      ).resolves.toMatchObject({ kind: 'ok', code: 'inquiry_read_marked' })

      await expect(
        replyCurrentOwnerInquiryThroughSource({
          threadId: detail.detail.inquiry.threadId,
          expectedVersion: detail.detail.inquiry.version,
          body: 'A second local owner reply for keyboard evidence.',
        })
      ).resolves.toMatchObject({ kind: 'ok', code: 'inquiry_replied' })
      expect(JSON.stringify([inbox, detail])).not.toContain('customer@example.test')

      const operator = await readInquiryOperatorReconstructionThroughSource({
        threadId: detail.detail.inquiry.threadId,
      })
      expect(operator).toMatchObject({
        kind: 'allowed',
        summary: { threads: 1, messages: 2, notifications: 2, dispatches: expect.any(Number) },
        rows: [
          expect.objectContaining({
            threadId: detail.detail.inquiry.threadId,
            sourceHash: expect.any(String),
            operatorNextAction: expect.any(String),
            messageRefs: expect.arrayContaining([expect.objectContaining({ bodyHash: expect.any(String) })]),
            auditRefs: expect.arrayContaining([expect.objectContaining({ eventType: 'inquiry.submitted' })]),
            funnelRefs: expect.arrayContaining([expect.objectContaining({ eventType: 'inquiry_submitted' })]),
            operationRefs: expect.arrayContaining([expect.objectContaining({ resultCode: 'inquiry_submitted' })]),
          }),
        ],
      })
      expect(JSON.stringify(operator)).not.toContain('customer@example.test')
      expect(JSON.stringify(operator)).not.toContain('Water is leaking under the kitchen sink')
      expect(JSON.stringify(operator)).not.toContain('Thanks, I have the message')
    } finally {
      if (previousBypass === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
      }
    }
  })

  it('returns denied operator inquiry reconstruction with no private rows when source auth is absent', async () => {
    const previousBypass = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E

    try {
      const readback = await readInquiryOperatorReconstructionThroughSource()
      expect(readback).toMatchObject({
        kind: 'denied',
        httpStatus: 401,
        reason: 'missing_membership',
        publicMessage: 'Admin inquiry reconstruction requires active source-owned membership.',
        rows: [],
      })
      expect(JSON.stringify(readback)).not.toContain('customer@example.test')
      expect(JSON.stringify(readback)).not.toContain('Pipe burst')
      expect(JSON.stringify(readback)).not.toContain('owner@example.test')
    } finally {
      if (previousBypass === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousBypass
      }
    }
  })
})

describe('server billing provider seam', () => {
  it('requires the Autumn secret key from server env', () => {
    expect(() => readAutumnClientConfig({})).toThrow(BillingProviderError)
    expect(() => readAutumnClientConfig({})).toThrow(expect.objectContaining({ code: 'missing_autumn_key', status: 500 }))
  })

  it('reads only server-side Autumn provider config', () => {
    expect(
      readAutumnClientConfig({
        AUTUMN_SECRET_KEY: ' autumn_sk ',
        AUTUMN_API_BASE_URL: ' https://sandbox.useautumn.com/ ',
        AUTUMN_API_VERSION: ' 2.3.1 ',
        [`${publicEnvPrefix}AUTUMN_SECRET_KEY`]: 'must-not-be-read',
      })
    ).toEqual({
      secretKey: 'autumn_sk',
      apiBaseUrl: 'https://sandbox.useautumn.com/',
      apiVersion: '2.3.1',
    })
  })

  it('refuses Autumn callbacks until source has a real verifier', async () => {
    await expect(
      verifyAutumnWebhook({ rawBody: '{"id":"evt_1"}', headers: new Headers(), secret: 'whsec' })
    ).rejects.toMatchObject({ code: 'unverified_webhook', status: 401 })
  })

  it('returns a typed refusal from the webhook route for unverified raw-body callbacks', async () => {
    const response = await handleBillingWebhookRequest(
      new Request('https://agentic.test/api/billing/webhook', {
        method: 'POST',
        body: '{"id":"evt_1"}',
        headers: { 'content-type': 'application/json' },
      })
    )

    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'unverified_webhook',
      retryable: false,
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('server notification provider seam', () => {
  const now = 1_777_000_000_000
  const svixTimestamp = String(Math.floor(now / 1000))
  const svixId = 'msg_resend_evt_123'
  const secret = `whsec_${Buffer.from('resend-test-secret').toString('base64')}`
  const rawBody = JSON.stringify({
    type: 'email.delivered',
    data: {
      email_id: 'resend_email_123',
      to: 'customer@example.test',
      subject: 'Private subject should not pass through',
    },
  })

  it('requires server-only notification provider secrets', () => {
    expect(() => readClerkSecretKey({})).toThrow(NotificationProviderError)
    expect(() => readClerkSecretKey({})).toThrow(expect.objectContaining({ code: 'missing_clerk_secret', status: 500 }))
    expect(() => readResendClientConfig({ RESEND_FROM: 'Agentic <hello@example.test>' })).toThrow(NotificationProviderError)
    expect(() => readResendClientConfig({ RESEND_FROM: 'Agentic <hello@example.test>' })).toThrow(
      expect.objectContaining({ code: 'missing_resend_api_key', status: 500 })
    )
    expect(() => readResendClientConfig({ RESEND_API_KEY: 're_123' })).toThrow(NotificationProviderError)
    expect(() => readResendClientConfig({ RESEND_API_KEY: 're_123' })).toThrow(
      expect.objectContaining({ code: 'missing_resend_from', status: 500 })
    )
    expect(() => readResendWebhookSecret({})).toThrow(NotificationProviderError)
    expect(() => readResendWebhookSecret({})).toThrow(expect.objectContaining({ code: 'missing_resend_webhook_secret', status: 500 }))
    expect(() => readNovuClientConfig({ NOVU_WORKFLOW_INQUIRY_OWNER: 'owner-inquiry' })).toThrow(NotificationProviderError)
    expect(() => readNovuClientConfig({ NOVU_WORKFLOW_INQUIRY_OWNER: 'owner-inquiry' })).toThrow(
      expect.objectContaining({ code: 'missing_novu_secret_key', status: 500 })
    )
    expect(() => readNovuClientConfig({ NOVU_SECRET_KEY: 'novu_secret' })).toThrow(NotificationProviderError)
    expect(() => readNovuClientConfig({ NOVU_SECRET_KEY: 'novu_secret' })).toThrow(
      expect.objectContaining({ code: 'missing_novu_workflow', status: 500 })
    )
    expect(() => readNotificationOutboxSystemKey({})).toThrow(NotificationProviderError)
    expect(() => readNotificationOutboxSystemKey({})).toThrow(expect.objectContaining({ code: 'missing_notification_outbox_secret', status: 500 }))
  })

  it('reads only server-side Clerk, Resend, and Novu delivery config', () => {
    expect(
      readClerkSecretKey({
        CLERK_SECRET_KEY: ' sk_live ',
        [`${publicEnvPrefix}CLERK_SECRET_KEY`]: 'must-not-be-read',
      })
    ).toBe('sk_live')
    expect(
      readResendClientConfig({
        RESEND_API_KEY: ' re_live ',
        RESEND_FROM: ' Agentic Economy <hello@example.test> ',
        RESEND_API_BASE_URL: ' https://resend.example.test/ ',
        [`${publicEnvPrefix}RESEND_API_KEY`]: 'must-not-be-read',
      })
    ).toEqual({
      apiKey: 're_live',
      from: 'Agentic Economy <hello@example.test>',
      apiBaseUrl: 'https://resend.example.test/',
    })
    expect(
      readNovuClientConfig({
        NOVU_SECRET_KEY: ' novu_live ',
        NOVU_WORKFLOW_INQUIRY_OWNER: ' owner-inquiry ',
        NOVU_WORKFLOW_INQUIRY_CUSTOMER: ' customer-inquiry ',
        NOVU_API_BASE_URL: ' https://novu.example.test/ ',
        [`${publicEnvPrefix}NOVU_SECRET_KEY`]: 'must-not-be-read',
      })
    ).toEqual({
      secretKey: 'novu_live',
      ownerInquiryWorkflowId: 'owner-inquiry',
      customerInquiryWorkflowId: 'customer-inquiry',
      apiBaseUrl: 'https://novu.example.test/',
    })
  })

  it('resolves owner delivery address from Clerk primary email without exposing it as durable metadata', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({
        id: 'user_sam',
        primary_email_address_id: 'email_primary',
        email_addresses: [
          { id: 'email_secondary', email_address: 'other@example.test' },
          { id: 'email_primary', email_address: ' Owner@Example.Test ' },
        ],
      }))
    }

    const deliveryAddress = await resolveClerkOwnerDeliveryAddress({
      clerkUserId: 'user_sam',
      secretKey: 'sk_test',
      apiBaseUrl: 'https://clerk.example.test/v1',
      fetch,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://clerk.example.test/v1/users/user_sam')
    expect(new Headers(calls[0]?.init.headers).get('Authorization')).toBe('Bearer sk_test')
    expect(deliveryAddress).toMatchObject({
      clerkUserId: 'user_sam',
      email: 'owner@example.test',
      redactedAddress: '[redacted]',
      addressHash: expect.any(String),
    })
    expect(deliveryAddress.addressHash).not.toContain('owner@example.test')
  })

  it('fails closed when Clerk has no deliverable owner email', async () => {
    await expect(
      resolveClerkOwnerDeliveryAddress({
        clerkUserId: 'user_sam',
        secretKey: 'sk_test',
        fetch: async () => new Response(JSON.stringify({ id: 'user_sam', email_addresses: [] })),
      })
    ).rejects.toMatchObject({ code: 'owner_delivery_address_not_found', status: 502 })
  })

  it('sends owner inquiry email through Resend with outbox idempotency and redacted provider result', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({ id: 'resend_email_123' }))
    }

    const result = await sendOwnerInquiryResendEmail({
      config: {
        apiKey: 're_test',
        from: 'Agentic Economy <hello@example.test>',
        apiBaseUrl: 'https://resend.example.test',
      },
      ownerEmail: 'Owner@Example.Test',
      dispatch: {
        dispatchId: 'notification_dispatch:123',
        providerIdempotencyKey: 'ae:notification_dispatch:123',
        inquiryThreadId: 'inquiry_thread:abc',
        businessName: 'Sam Plumbing',
        businessSlug: 'sam-plumbing',
      },
      appBaseUrl: 'https://agentic.test',
      fetch,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://resend.example.test/emails')
    expect(new Headers(calls[0]?.init.headers).get('Authorization')).toBe('Bearer re_test')
    expect(new Headers(calls[0]?.init.headers).get('Idempotency-Key')).toBe('ae:notification_dispatch:123')
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      from: 'Agentic Economy <hello@example.test>',
      to: ['owner@example.test'],
      subject: 'New inquiry for Sam Plumbing',
    })
    expect(String(body.text)).toContain('https://agentic.test/owner/inquiries/inquiry_thread%3Aabc')
    expect(String(body.text)).not.toContain('burst pipe raw body')
    expect(result).toMatchObject({
      kind: 'ok',
      status: 'sent',
      resendMessageId: 'resend_email_123',
      providerResponseHash: expect.any(String),
    })
    expect(JSON.stringify(result)).not.toContain('owner@example.test')
  })

  it('triggers the owner inquiry Novu workflow with outbox idempotency and redacted payload', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({
        acknowledged: true,
        status: 'processed',
        transactionId: 'ae:notification_dispatch:123',
        messageId: 'novu_message_123',
      }))
    }

    const result = await triggerOwnerInquiryNovuWorkflow({
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
        businessName: 'Sam Plumbing',
        businessSlug: 'sam-plumbing',
      },
      appBaseUrl: 'https://agentic.test',
      fetch,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://novu.example.test/v1/events/trigger')
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('Authorization')).toBe('ApiKey novu_test')
    expect(headers.get('Idempotency-Key')).toBe('ae:notification_dispatch:123')
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      name: 'owner-inquiry',
      to: { subscriberId: 'owner:user_sam' },
      transactionId: 'ae:notification_dispatch:123',
    })
    expect(JSON.stringify(body)).toContain('https://agentic.test/owner/inquiries/inquiry_thread%3Aabc')
    expect(JSON.stringify(body)).not.toContain('customer@example.test')
    expect(JSON.stringify(body)).not.toContain('burst pipe raw body')
    expect(result).toMatchObject({
      kind: 'ok',
      status: 'triggered',
      novuTransactionId: 'ae:notification_dispatch:123',
      novuWorkflowId: 'owner-inquiry',
      novuSubscriberId: 'owner:user_sam',
      novuMessageId: 'novu_message_123',
      providerResponseHash: expect.any(String),
    })
  })

  it('reads Novu transaction messages without returning message content or recipient contact', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({
        totalCount: 1,
        hasMore: false,
        data: [
          {
            _id: 'novu_message_123',
            transactionId: 'ae:notification_dispatch:123',
            channel: 'email',
            status: 'sent',
            createdAt: '2026-06-28T17:55:00.000Z',
            subject: 'Raw subject must not return',
            content: 'Raw customer inquiry must not return',
            subscriber: {
              subscriberId: 'owner:user_sam',
              email: 'owner@example.test',
            },
          },
        ],
      }))
    }

    const readback = await readNovuTransactionMessages({
      config: {
        secretKey: 'novu_test',
        ownerInquiryWorkflowId: 'owner-inquiry',
        apiBaseUrl: 'https://novu.example.test',
      },
      transactionId: 'ae:notification_dispatch:123',
      subscriberId: 'owner:user_sam',
      fetch,
    })

    expect(calls).toHaveLength(1)
    const url = new URL(calls[0]?.url ?? '')
    expect(url.origin + url.pathname).toBe('https://novu.example.test/v1/messages')
    expect(url.searchParams.get('transactionId')).toBe('ae:notification_dispatch:123')
    expect(url.searchParams.get('subscriberId')).toBe('owner:user_sam')
    expect(new Headers(calls[0]?.init.headers).get('Authorization')).toBe('ApiKey novu_test')
    expect(readback).toEqual({
      kind: 'ok',
      transactionId: 'ae:notification_dispatch:123',
      totalCount: 1,
      hasMore: false,
      providerResponseHash: expect.any(String),
      messages: [
        {
          novuMessageId: 'novu_message_123',
          subscriberId: 'owner:user_sam',
          transactionId: 'ae:notification_dispatch:123',
          channel: 'email',
          status: 'sent',
          createdAt: '2026-06-28T17:55:00.000Z',
        },
      ],
    })
    expect(JSON.stringify(readback)).not.toContain('owner@example.test')
    expect(JSON.stringify(readback)).not.toContain('Raw customer inquiry')
  })

  it('guards the Novu dispatch route with the server outbox secret', async () => {
    const calls: unknown[] = []
    const response = await handleNovuDispatchRequest(
      new Request('https://agentic.test/api/notification/novu-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: { 'content-type': 'application/json' },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          NOVU_SECRET_KEY: 'novu_test',
          NOVU_WORKFLOW_INQUIRY_OWNER: 'owner-inquiry',
        },
        readDispatchForSend: async (args) => {
          calls.push(args)
          throw new Error('should not read dispatch')
        },
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'notification_dispatch_unauthorized',
    })
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('runs the guarded Novu dispatch bridge with authenticated readback and redacted provider refs', async () => {
    const calls: { read: unknown[]; trigger: unknown[]; readback: unknown[]; record: unknown[] } = {
      read: [],
      trigger: [],
      readback: [],
      record: [],
    }

    const response = await handleNovuDispatchRequest(
      new Request('https://agentic.test/api/notification/novu-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer outbox-secret',
        },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          NOVU_SECRET_KEY: 'novu_test',
          NOVU_WORKFLOW_INQUIRY_OWNER: 'owner-inquiry',
          NOVU_API_BASE_URL: 'https://novu.example.test',
        },
        readDispatchForSend: async (args) => {
          calls.read.push(args)
          return novuDispatchSendReadback()
        },
        triggerOwnerInquiry: async (input) => {
          calls.trigger.push(input)
          return {
            kind: 'ok',
            status: 'triggered',
            providerResponseHash: 'novu-provider-response-hash',
            novuTransactionId: 'ae:notification_dispatch:123',
            novuWorkflowId: 'owner-inquiry',
            novuMessageId: 'novu_message_123',
            novuSubscriberId: 'owner:user_sam',
          }
        },
        readNovuMessages: async (input) => {
          calls.readback.push(input)
          return {
            kind: 'ok',
            transactionId: input.transactionId,
            providerResponseHash: 'novu-readback-response-hash',
            totalCount: 1,
            hasMore: false,
            messages: [
              {
                novuMessageId: 'novu_message_123',
                subscriberId: 'owner:user_sam',
                transactionId: input.transactionId,
                channel: 'email',
                status: 'sent',
              },
            ],
          }
        },
        recordDispatch: async (args) => {
          calls.record.push(args)
          return {
            kind: 'ok',
            code: 'notification_triggered',
            dispatch: {
              ...dispatchProjection(),
              providerFamily: 'novu',
              status: 'triggered',
              novuTransactionId: 'ae:notification_dispatch:123',
              novuWorkflowId: 'owner-inquiry',
              novuMessageId: 'novu_message_123',
              novuSubscriberId: 'owner:user_sam',
            },
            attempt: {
              attemptId: 'notification_attempt:novu',
              status: 'triggered',
              providerResponseHash: 'novu-provider-response-hash',
            },
          }
        },
      }
    )

    await expect(response.json()).resolves.toEqual({
      kind: 'ok',
      code: 'notification_novu_triggered',
      dispatchId: 'notification_dispatch:123',
      dispatchStatus: 'triggered',
      novuTransactionId: 'ae:notification_dispatch:123',
      novuWorkflowId: 'owner-inquiry',
      novuMessageId: 'novu_message_123',
      novuSubscriberId: 'owner:user_sam',
      providerResponseHash: 'novu-provider-response-hash',
      readbackProviderResponseHash: 'novu-readback-response-hash',
      novuMessageCount: 1,
      businessSlug: 'sam-plumbing',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(calls.read).toEqual([{ dispatchId: 'notification_dispatch:123', systemKey: 'outbox-secret' }])
    expect(calls.trigger[0]).toMatchObject({
      subscriberId: 'owner:user_sam',
      dispatch: {
        providerIdempotencyKey: 'ae:notification_dispatch:123',
        inquiryThreadId: 'inquiry_thread:abc',
        businessName: 'Sam Plumbing',
      },
      appBaseUrl: 'https://agentic.test',
    })
    expect(calls.readback).toEqual([
      {
        config: {
          secretKey: 'novu_test',
          ownerInquiryWorkflowId: 'owner-inquiry',
          apiBaseUrl: 'https://novu.example.test',
        },
        transactionId: 'ae:notification_dispatch:123',
        subscriberId: 'owner:user_sam',
      },
    ])
    expect(calls.record[0]).toMatchObject({
      dispatchId: 'notification_dispatch:123',
      systemKey: 'outbox-secret',
      providerResult: {
        kind: 'ok',
        status: 'triggered',
        novuTransactionId: 'ae:notification_dispatch:123',
        novuWorkflowId: 'owner-inquiry',
        novuMessageId: 'novu_message_123',
        novuSubscriberId: 'owner:user_sam',
        providerResponseHash: 'novu-provider-response-hash',
      },
    })
    expect(JSON.stringify(calls)).not.toContain('owner@example.test')
    expect(JSON.stringify(calls)).not.toContain('Raw customer inquiry')
  })

  it('refuses unsupported Novu dispatches before triggering or reading Novu', async () => {
    const calls: unknown[] = []
    const response = await handleNovuDispatchRequest(
      new Request('https://agentic.test/api/notification/novu-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer outbox-secret',
        },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          NOVU_SECRET_KEY: 'novu_test',
          NOVU_WORKFLOW_INQUIRY_OWNER: 'owner-inquiry',
        },
        readDispatchForSend: async () => dispatchSendReadback(),
        triggerOwnerInquiry: async (input) => {
          calls.push(input)
          throw new Error('should not trigger')
        },
        readNovuMessages: async (input) => {
          calls.push(input)
          throw new Error('should not readback')
        },
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'unsupported_notification_dispatch',
    })
    expect(response.status).toBe(422)
    expect(calls).toHaveLength(0)
  })

  it('does not retrigger Novu dispatches that already have a transaction id', async () => {
    const calls: unknown[] = []
    const response = await handleNovuDispatchRequest(
      new Request('https://agentic.test/api/notification/novu-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer outbox-secret',
        },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          NOVU_SECRET_KEY: 'novu_test',
          NOVU_WORKFLOW_INQUIRY_OWNER: 'owner-inquiry',
        },
        readDispatchForSend: async () => novuDispatchSendReadback({
          status: 'triggered',
          novuTransactionId: 'ae:notification_dispatch:123',
          novuWorkflowId: 'owner-inquiry',
          novuMessageId: 'novu_message_123',
          novuSubscriberId: 'owner:user_sam',
        }),
        triggerOwnerInquiry: async (input) => {
          calls.push(input)
          throw new Error('should not trigger')
        },
        readNovuMessages: async (input) => {
          return {
            kind: 'ok',
            transactionId: input.transactionId,
            providerResponseHash: 'novu-readback-response-hash',
            totalCount: 0,
            hasMore: false,
            messages: [],
          }
        },
      }
    )

    await expect(response.json()).resolves.toEqual({
      kind: 'ok',
      code: 'notification_novu_already_recorded',
      dispatchId: 'notification_dispatch:123',
      dispatchStatus: 'triggered',
      novuTransactionId: 'ae:notification_dispatch:123',
      novuWorkflowId: 'owner-inquiry',
      novuMessageId: 'novu_message_123',
      novuSubscriberId: 'owner:user_sam',
      readbackProviderResponseHash: 'novu-readback-response-hash',
      novuMessageCount: 0,
      businessSlug: 'sam-plumbing',
    })
    expect(calls).toHaveLength(0)
  })

  it('guards the Resend dispatch route with the server outbox secret', async () => {
    const calls: unknown[] = []
    const response = await handleResendDispatchRequest(
      new Request('https://agentic.test/api/notification/resend-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: { 'content-type': 'application/json' },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          CLERK_SECRET_KEY: 'sk_test',
          RESEND_API_KEY: 're_test',
          RESEND_FROM: 'Agentic Economy <hello@example.test>',
        },
        readDispatchForSend: async (args) => {
          calls.push(args)
          throw new Error('should not read dispatch')
        },
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'notification_dispatch_unauthorized',
    })
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('runs the guarded Resend dispatch bridge without leaking owner email in the response or writeback', async () => {
    const calls: { read: unknown[]; resolve: unknown[]; send: unknown[]; record: unknown[] } = {
      read: [],
      resolve: [],
      send: [],
      record: [],
    }

    const response = await handleResendDispatchRequest(
      new Request('https://agentic.test/api/notification/resend-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer outbox-secret',
        },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          CLERK_SECRET_KEY: 'sk_test',
          RESEND_API_KEY: 're_test',
          RESEND_FROM: 'Agentic Economy <hello@example.test>',
        },
        readDispatchForSend: async (args) => {
          calls.read.push(args)
          return dispatchSendReadback()
        },
        resolveOwnerDeliveryAddress: async (input) => {
          calls.resolve.push(input)
          return {
            clerkUserId: input.clerkUserId,
            email: 'owner@example.test',
            addressHash: 'owner-email-hash',
            redactedAddress: '[redacted]',
          }
        },
        sendOwnerInquiry: async (input) => {
          calls.send.push(input)
          return {
            kind: 'ok',
            status: 'sent',
            resendMessageId: 'resend_email_123',
            providerResponseHash: 'provider-response-hash',
          }
        },
        recordDispatch: async (args) => {
          calls.record.push(args)
          return {
            kind: 'ok',
            code: 'notification_sent',
            dispatch: {
              ...dispatchProjection(),
              status: 'sent',
              resendMessageId: 'resend_email_123',
            },
            attempt: {
              attemptId: 'notification_attempt:123',
              status: 'sent',
              providerResponseHash: 'provider-response-hash',
            },
          }
        },
      }
    )

    await expect(response.json()).resolves.toEqual({
      kind: 'ok',
      code: 'notification_resend_dispatched',
      dispatchId: 'notification_dispatch:123',
      dispatchStatus: 'sent',
      resendMessageId: 'resend_email_123',
      providerResponseHash: 'provider-response-hash',
      ownerAddressHash: 'owner-email-hash',
      businessSlug: 'sam-plumbing',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(calls.read).toEqual([{ dispatchId: 'notification_dispatch:123', systemKey: 'outbox-secret' }])
    expect(calls.resolve).toEqual([{ clerkUserId: 'user_sam', secretKey: 'sk_test' }])
    expect(calls.send[0]).toMatchObject({
      ownerEmail: 'owner@example.test',
      dispatch: {
        providerIdempotencyKey: 'ae:notification_dispatch:123',
        inquiryThreadId: 'inquiry_thread:abc',
        businessName: 'Sam Plumbing',
      },
      appBaseUrl: 'https://agentic.test',
    })
    expect(calls.record[0]).toMatchObject({
      dispatchId: 'notification_dispatch:123',
      systemKey: 'outbox-secret',
      providerResult: {
        kind: 'ok',
        status: 'sent',
        resendMessageId: 'resend_email_123',
        providerResponseHash: 'provider-response-hash',
      },
    })
    expect(JSON.stringify(calls.record)).not.toContain('owner@example.test')
  })

  it('refuses unsupported dispatches before resolving owner email or sending Resend', async () => {
    const calls: unknown[] = []
    const response = await handleResendDispatchRequest(
      new Request('https://agentic.test/api/notification/resend-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer outbox-secret',
        },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          CLERK_SECRET_KEY: 'sk_test',
          RESEND_API_KEY: 're_test',
          RESEND_FROM: 'Agentic Economy <hello@example.test>',
        },
        readDispatchForSend: async () => ({
          ...dispatchSendReadback(),
          send: {
            ...dispatchSendReadback().send,
            dispatch: {
              ...dispatchProjection(),
              providerFamily: 'novu',
            },
          },
        }),
        resolveOwnerDeliveryAddress: async (input) => {
          calls.push(input)
          throw new Error('should not resolve owner')
        },
      }
    )

    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'unsupported_notification_dispatch',
    })
    expect(response.status).toBe(422)
    expect(calls).toHaveLength(0)
  })

  it('does not resend dispatches that already have a Resend message id', async () => {
    const calls: unknown[] = []
    const response = await handleResendDispatchRequest(
      new Request('https://agentic.test/api/notification/resend-dispatch', {
        method: 'POST',
        body: JSON.stringify({ dispatchId: 'notification_dispatch:123' }),
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer outbox-secret',
        },
      }),
      {
        env: {
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
          CLERK_SECRET_KEY: 'sk_test',
          RESEND_API_KEY: 're_test',
          RESEND_FROM: 'Agentic Economy <hello@example.test>',
        },
        readDispatchForSend: async () => ({
          ...dispatchSendReadback(),
          send: {
            ...dispatchSendReadback().send,
            dispatch: {
              ...dispatchProjection(),
              status: 'sent',
              resendMessageId: 'resend_email_123',
            },
          },
        }),
        sendOwnerInquiry: async (input) => {
          calls.push(input)
          throw new Error('should not resend')
        },
      }
    )

    await expect(response.json()).resolves.toEqual({
      kind: 'ok',
      code: 'notification_resend_already_recorded',
      dispatchId: 'notification_dispatch:123',
      dispatchStatus: 'sent',
      resendMessageId: 'resend_email_123',
      businessSlug: 'sam-plumbing',
    })
    expect(calls).toHaveLength(0)
  })

  it('verifies Resend Svix signatures and normalizes redacted webhook metadata', () => {
    const verified = verifyResendWebhook({
      rawBody,
      headers: signedResendHeaders(secret, rawBody, svixId, svixTimestamp),
      secret,
      now,
    })

    expect(verified).toMatchObject({
      providerFamily: 'resend',
      providerEventId: svixId,
      logicalObjectKey: 'resend_email_123',
      eventType: 'email.delivered',
    })
    expect(verified.payloadHash).toEqual(expect.any(String))
    expect(verified.redactedPayloadJson).not.toContain('customer@example.test')
    expect(verified.redactedPayloadJson).not.toContain('Private subject')
  })

  it('rejects missing, stale, and invalid Resend webhook signatures', () => {
    expect(() => verifyResendWebhook({ rawBody, headers: new Headers(), secret, now })).toThrow(
      expect.objectContaining({ code: 'missing_resend_signature_headers', status: 400 })
    )
    expect(() =>
      verifyResendWebhook({
        rawBody,
        headers: signedResendHeaders(secret, rawBody, svixId, String(Math.floor((now - 10 * 60 * 1000) / 1000))),
        secret,
        now,
      })
    ).toThrow(expect.objectContaining({ code: 'stale_resend_signature', status: 401 }))
    expect(() =>
      verifyResendWebhook({
        rawBody,
        headers: signedResendHeaders(secret, rawBody.replace('delivered', 'bounced'), svixId, svixTimestamp),
        secret,
        now,
      })
    ).toThrow(expect.objectContaining({ code: 'invalid_resend_signature', status: 401 }))
  })

  it('verifies the Resend route before forwarding redacted metadata to Convex', async () => {
    const calls: unknown[] = []
    const response = await handleResendWebhookRequest(
      new Request('https://agentic.test/api/notification/resend-webhook', {
        method: 'POST',
        body: rawBody,
        headers: signedResendHeaders(secret, rawBody, svixId, svixTimestamp),
      }),
      {
        env: {
          RESEND_WEBHOOK_SECRET: secret,
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
        },
        now,
        ingestWebhook: async (args) => {
          calls.push(args)
          return { kind: 'ok', code: 'notification_webhook_received' }
        },
      }
    )

    await expect(response.json()).resolves.toEqual({ kind: 'ok', code: 'notification_webhook_received' })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      providerFamily: 'resend',
      providerEventId: svixId,
      logicalObjectKey: 'resend_email_123',
      eventType: 'email.delivered',
      signatureStatus: 'verified',
      systemKey: 'outbox-secret',
    })
    expect(JSON.stringify(calls)).not.toContain('customer@example.test')
  })

  it('does not forward unverified Resend route requests to Convex', async () => {
    const calls: unknown[] = []
    const response = await handleResendWebhookRequest(
      new Request('https://agentic.test/api/notification/resend-webhook', {
        method: 'POST',
        body: rawBody,
        headers: signedResendHeaders(secret, `${rawBody}tampered`, svixId, svixTimestamp),
      }),
      {
        env: {
          RESEND_WEBHOOK_SECRET: secret,
          AE_NOTIFICATION_OUTBOX_SECRET: 'outbox-secret',
        },
        now,
        ingestWebhook: async (args) => {
          calls.push(args)
          return { kind: 'ok', code: 'notification_webhook_received' }
        },
      }
    )

    await expect(response.json()).resolves.toMatchObject({ kind: 'error', code: 'invalid_resend_signature' })
    expect(response.status).toBe(401)
    expect(calls).toHaveLength(0)
  })
})

function signedResendHeaders(secret: string, rawBody: string, svixId: string, svixTimestamp: string): Headers {
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

function dispatchSendReadback() {
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
    },
  }
}

function novuDispatchSendReadback(overrides: Record<string, unknown> = {}) {
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

function dispatchProjection() {
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
