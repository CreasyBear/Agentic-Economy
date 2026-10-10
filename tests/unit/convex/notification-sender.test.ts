import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { emitJourneyEvent } from '../../../convex/lib/journey/events'
import { postResendEmail } from '../../../convex/lib/principalAccount/notifications/resend'
import { emailAddressHash } from '../../../convex/lib/principalAccount/notifications/suppression'
import { createInteractiveAuthorityBackend } from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF,
  INTERACTIVE_PRINCIPAL_REF,
  seedInteractiveAuthority,
} from '../../helpers/interactive-authority-seed'

const clerkMocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    primaryEmailAddress: {
      emailAddress: 'owner@example.test',
      verification: { status: 'verified' },
    },
  })),
}))

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({ users: { getUser: clerkMocks.getUser } }),
}))

const envKeys = ['RESEND_API_KEY', 'NOTIFICATION_FROM_EMAIL', 'CLERK_SECRET_KEY', 'AE_SITE_URL'] as const
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))

async function pendingApprovalDelivery() {
  const backend = createInteractiveAuthorityBackend()
  await seedInteractiveAuthority(backend)
  const callRef = 'operation-invocation:v1:sender-test'
  const deliveryRef = 'notification:sender-test'
  const now = Date.now()
  const deliveryId = await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityCalls', {
      callRef,
      principalId: INTERACTIVE_PRINCIPAL_REF,
      ownerId: INTERACTIVE_ACCOUNT_REF,
      credentialId: 'credential:sender-test',
      applicationRef: 'application:sender-test',
      toolRef: 'operation:v1:sender-test',
      idempotencyKey: 'sender-test',
      environment: 'production',
      grantRef: 'grant:sender-test',
      grantGeneration: 1,
      policyDigest: 'sha256:policy',
      grantExpiresAt: now + 86_400_000,
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      state: 'pending',
      result: {
        kind: 'needs_authority',
        callRef,
        toolRef: 'operation:v1:sender-test',
        authorityRequest: {
          kind: 'approval_required',
          toolRef: 'operation:v1:sender-test',
          consequence: 'external_effect',
          retryClass: 'reconcile_before_retry',
          dataFields: [],
        },
      },
      createdAt: now,
      updatedAt: now,
    })
    return await ctx.db.insert('notificationDeliveries', {
      deliveryRef,
      recipientPrincipalRef: INTERACTIVE_PRINCIPAL_REF,
      accountRef: INTERACTIVE_ACCOUNT_REF,
      eventKind: 'agent_approval_requested',
      sourceEventRef: callRef,
      state: 'pending',
      createdAt: now,
      updatedAt: now,
    })
  })
  return { backend, deliveryId, deliveryRef }
}

describe('sendDeliveryEmail', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'))
    process.env.RESEND_API_KEY = 'resend-secret-test'
    process.env.NOTIFICATION_FROM_EMAIL = 'no-reply@example.test'
    process.env.CLERK_SECRET_KEY = 'clerk-secret-test'
    process.env.AE_SITE_URL = 'https://aecon.example.test'
    clerkMocks.getUser.mockReset()
    clerkMocks.getUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'owner@example.test',
        verification: { status: 'verified' },
      },
    })
  })

  afterEach(() => {
    for (const key of envKeys) {
      const value = previousEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('sends a verified approval email with the delivery reference as its idempotency key', async () => {
    const { backend, deliveryId, deliveryRef } = await pendingApprovalDelivery()
    const sendEmail = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'resend-message-123' }), { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'sent', vendorMessageId: 'resend-message-123' })
    expect(clerkMocks.getUser).toHaveBeenCalledWith('user_sam')
    expect(sendEmail).toHaveBeenCalledOnce()
    const [url, request] = sendEmail.mock.calls[0] ?? []
    if (url === undefined || request === undefined || typeof request.body !== 'string') {
      throw new Error('resend_request_missing')
    }
    expect(url).toBe('https://api.resend.com/emails')
    expect(request.method).toBe('POST')
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer resend-secret-test',
      'Idempotency-Key': deliveryRef,
      'User-Agent': 'aecon-notifications/1',
    })
    expect(JSON.parse(request.body)).toMatchObject({
      from: 'no-reply@example.test',
      to: ['owner@example.test'],
      subject: 'Sam canonical principal needs your approval',
      html: expect.stringContaining('Review request'),
      text: expect.stringContaining('/agent-access'),
      tags: expect.arrayContaining([
        { name: 'stream', value: 'transactional' },
        { name: 'event_kind', value: 'agent_approval_requested' },
      ]),
    })
    // Required mail carries no unsubscribe target.
    expect(JSON.parse(request.body)).not.toHaveProperty('headers')
  })

  it('suppresses a send to an address that hard-bounced before contacting Resend', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    const addressHash = await emailAddressHash('owner@example.test')
    await backend.run((ctx) => ctx.db.insert('emailSuppressions', {
      addressHash,
      domain: 'example.test',
      reason: 'hard_bounce',
      sourceDeliveryRef: 'notification:earlier-bounce',
      createdAt: Date.now(),
    }))
    const sendEmail = vi.fn(async () => new Response(JSON.stringify({ id: 'never' }), { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'suppressed', code: 'hard_bounce_suppressed' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('still sends required approval mail to an address with a complaint on file', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    const addressHash = await emailAddressHash('owner@example.test')
    await backend.run((ctx) => ctx.db.insert('emailSuppressions', {
      addressHash,
      domain: 'example.test',
      reason: 'complaint',
      sourceDeliveryRef: 'notification:earlier-complaint',
      createdAt: Date.now(),
    }))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'resend-required-1' }), { status: 200 })))

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'sent', vendorMessageId: 'resend-required-1' })
  })

  it('treats an accepted response without parseable JSON as sent', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 202 })))

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'sent' })
  })

  it('rejects a rate-limited Resend response for retry', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 429 })))

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .rejects.toThrow()
  })

  it('rejects an unavailable Resend response for retry', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .rejects.toThrow()
  })

  it('rejects a network failure for retry', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable') }))

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .rejects.toThrow()
  })

  it('returns a permanent failure for a rejected provider request', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 400 })))

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'failed', code: 'provider_rejected_400' })
  })

  it('does not send when the primary email is unverified', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    clerkMocks.getUser.mockResolvedValue({
      primaryEmailAddress: {
        emailAddress: 'owner@example.test',
        verification: { status: 'unverified' },
      },
    })
    const sendEmail = vi.fn()
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'failed', code: 'no_verified_email' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('suppresses sending without credentials before contacting Clerk or Resend', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    delete process.env.RESEND_API_KEY
    const sendEmail = vi.fn()
    vi.stubGlobal('fetch', sendEmail)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'suppressed', code: 'sender_not_configured' })
    expect(clerkMocks.getUser).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('suppresses a queued approval when the owner opts out before delivery', async () => {
    const { backend, deliveryId } = await pendingApprovalDelivery()
    await backend.run(async (ctx) => {
      await ctx.db.insert('userNotificationPreferences', {
        principalRef: INTERACTIVE_PRINCIPAL_REF,
        accountRef: INTERACTIVE_ACCOUNT_REF,
        lowCreditBalance: true,
        lowCreditThresholdCents: 2500,
        spendCapWarning: true,
        callFailureSpike: true,
        invoiceReady: true,
        teamMembershipChanged: true,
        agentApprovalRequested: false,
        revision: 1,
        updatedAt: Date.now(),
        lastCorrelationRef: 'test:sender-opt-out',
      })
    })
    const sendEmail = vi.fn()
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendDeliveryEmail, { deliveryId }))
      .resolves.toEqual({ outcome: 'suppressed', code: 'opted_out' })
    expect(clerkMocks.getUser).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('sendOperatorDigest', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T22:00:00.000Z'))
    process.env.RESEND_API_KEY = 'resend-secret-test'
    process.env.NOTIFICATION_FROM_EMAIL = 'no-reply@example.test'
    process.env.OPERATOR_EMAIL = 'operator@example.test'
  })

  afterEach(() => {
    delete process.env.OPERATOR_EMAIL
    for (const key of envKeys) {
      const value = previousEnv[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('posts one digest to the operator with a date-based idempotency key', async () => {
    const backend = createInteractiveAuthorityBackend()
    vi.setSystemTime(new Date('2026-10-07T00:00:00.000Z'))
    await backend.run((ctx) => emitJourneyEvent(ctx, 'acc_stalled_digest', 'signed_up'))
    vi.setSystemTime(new Date('2026-10-09T22:00:00.000Z'))
    const sendEmail = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'resend-digest-1' }), { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendOperatorDigest, {})).resolves.toBeNull()
    const resendCalls = sendEmail.mock.calls.filter(([url]) => String(url) === 'https://api.resend.com/emails')
    expect(resendCalls).toHaveLength(1)
    const [, request] = resendCalls[0] ?? []
    if (request === undefined || typeof request.body !== 'string') throw new Error('resend_request_missing')
    // 22:00 UTC on 9 October is 09:00 on 10 October in Sydney, where the operator reads it.
    expect(request.headers).toMatchObject({ 'Idempotency-Key': 'operator-digest:2026-10-10' })
    expect(JSON.parse(request.body)).toMatchObject({
      to: ['operator@example.test'],
      text: expect.stringContaining('acc_stalled_digest'),
    })
  })

  it('posts a zero digest so a missing email means the job failed', async () => {
    const backend = createInteractiveAuthorityBackend()
    const sendEmail = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendOperatorDigest, {})).resolves.toBeNull()
    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [, request] = sendEmail.mock.calls[0] ?? []
    expect(JSON.parse(String(request?.body))).toMatchObject({
      subject: 'AE stalled accounts, 2026-10-10',
      text: expect.stringContaining('Signed up, not funded: 0 total'),
    })
  })

  it('throws on a Resend 503 so the workpool retries the digest', async () => {
    const backend = createInteractiveAuthorityBackend()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })))
    await expect(backend.action(internal.notificationDelivery.sendOperatorDigest, {})).rejects.toThrow('resend_retryable_status_503')
  })

  it('suppresses without credentials before reading the digest or contacting Resend', async () => {
    const backend = createInteractiveAuthorityBackend()
    delete process.env.OPERATOR_EMAIL
    const sendEmail = vi.fn(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)

    await expect(backend.action(internal.notificationDelivery.sendOperatorDigest, {})).resolves.toBeNull()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('postResendEmail', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('passes the HTML body and tags through to Resend', async () => {
    const sendEmail = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)
    await postResendEmail({
      apiKey: 'k', from: 'a@example.test', to: 'b@example.test', subject: 's', text: 't', html: '<p>h</p>', idempotencyKey: 'i',
      tags: [{ name: 'stream', value: 'alert' }],
    })
    const [, request] = sendEmail.mock.calls[0] ?? []
    expect(JSON.parse(String(request?.body))).toMatchObject({ html: '<p>h</p>', tags: [{ name: 'stream', value: 'alert' }] })
  })

  it('passes List-Unsubscribe headers through to Resend', async () => {
    const sendEmail = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)
    await postResendEmail({
      apiKey: 'k', from: 'a@example.test', to: 'b@example.test', subject: 's', text: 't', idempotencyKey: 'i',
      headers: { 'List-Unsubscribe': '<https://x.test/u?d=1>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    })
    const [, request] = sendEmail.mock.calls[0] ?? []
    expect(JSON.parse(String(request?.body)).headers).toEqual({
      'List-Unsubscribe': '<https://x.test/u?d=1>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })
})
