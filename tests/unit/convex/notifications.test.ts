import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'

import type { MutationCtx, QueryCtx } from '../../../convex/_generated/server'
import {
  claimDueNotificationDeliveriesHandler,
  finishNotificationDeliveryHandler,
  readNotificationContextHandler,
} from '../../../convex/lib/principalAccount/notifications/delivery'
import { enqueueAgentApprovalRequestedHandler } from '../../../convex/lib/principalAccount/notifications/enqueue'

import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
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


async function insertPendingApprovalCall(
  backend: InteractiveAuthorityBackend,
  callRef: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('capabilityCalls', {
      callRef,
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      credentialId: 'credential:approval-email-test',
      applicationRef: 'application:approval-email-test',
      toolRef: 'operation:v1:approval-email-tool-title',
      idempotencyKey: `approval-email:${callRef}`,
      environment: 'production',
      grantRef: 'grant:approval-email-test',
      grantGeneration: 1,
      policyDigest: 'sha256:policy',
      grantExpiresAt: 100_000,
      inputDigest: 'sha256:input',
      requestDigest: 'sha256:request',
      state: 'pending',
      result: {
        kind: 'needs_authority',
        callRef,
        toolRef: 'operation:v1:approval-email-tool-title',
        authorityRequest: {
          kind: 'approval_required',
          toolRef: 'operation:v1:approval-email-tool-title',
          consequence: 'external_effect',
          retryClass: 'reconcile_before_retry',
          dataFields: [],
        },
      },
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function enqueueApprovalNotice(
  backend: InteractiveAuthorityBackend,
  callRef: string,
): Promise<{ kind: 'enqueued' | 'exists' | 'skipped' }> {
  return await backend.run((ctx) => enqueueAgentApprovalRequestedHandler(
    ctx as unknown as MutationCtx,
    { callRef },
  ))
}

async function listDeliveryRows(backend: InteractiveAuthorityBackend) {
  return await backend.run((ctx) => ctx.db.query('notificationDeliveries').collect())
}

const ACCOUNT_B = `acc_${'b'.repeat(32)}`
const OWNERSHIP_B = `own_${'b'.repeat(32)}`

type PreferencesView = Readonly<{
  accountRef: string
  principalRef: string
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
  agentApprovalRequested: boolean
  revision: number
  updatedAt: number | null
  isVirtualDefault: boolean
}>

type PreferenceUpdateReceipt = Readonly<{
  kind: 'updated' | 'replayed'
  revision: number
}>

type UpdatePreferencesInput = Readonly<{
  lowCreditBalance?: boolean
  lowCreditThresholdCents?: number
  spendCapWarning?: boolean
  callFailureSpike?: boolean
  invoiceReady?: boolean
  teamMembershipChanged?: boolean
  agentApprovalRequested?: boolean
  expectedRevision: number
  correlationRef: string
  idempotencyRef: string
}>


type PreferenceRow = Readonly<{
  accountRef: string
  principalRef: string
  lowCreditBalance: boolean
  lowCreditThresholdCents: number
  spendCapWarning: boolean
  callFailureSpike: boolean
  invoiceReady: boolean
  teamMembershipChanged: boolean
  agentApprovalRequested?: boolean
  revision: number
  idempotencyRef?: string
}>

const readPreferencesRef = makeFunctionReference<
  'query',
  Record<string, never>,
  PreferencesView
>('notifications:readPreferences')

const updatePreferencesRef = makeFunctionReference<
  'mutation',
  UpdatePreferencesInput,
  PreferenceUpdateReceipt
>('notifications:updatePreferences')
const deliverOwnerNotificationsRef = makeFunctionReference<
  'action',
  Record<string, never>,
  null
>('notificationDelivery:deliverDueOwnerNotifications')



const VIRTUAL_DEFAULTS: Omit<PreferencesView, 'accountRef' | 'principalRef'> = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  agentApprovalRequested: true,
  revision: 0,
  updatedAt: null,
  isVirtualDefault: true,
}

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:notifications:${label}`

const idempotencyRef = (label: string) => `idem:notifications:${label}`

async function readPreferences(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<PreferencesView> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(readPreferencesRef, {})
}

async function updatePreferences(
  backend: InteractiveAuthorityBackend,
  input: UpdatePreferencesInput,
  presentedIdentity: UserIdentity = identity(),
): Promise<PreferenceUpdateReceipt> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.mutation(updatePreferencesRef, input)
}


async function expectNotificationRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function listPreferenceRows(backend: InteractiveAuthorityBackend): Promise<PreferenceRow[]> {
  return await backend.run(async (ctx) =>
    (await (ctx.db as { query: (table: string) => { collect: () => Promise<PreferenceRow[]> } })
      .query('userNotificationPreferences')
      .collect()))
}


async function seedSecondOwnedAccount(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef: ACCOUNT_B,
      displayName: 'Workspace B',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: PRINCIPAL_REF,
      creationIdempotencyRef: `account:${ACCOUNT_B}`,
      initialOwnershipRef: OWNERSHIP_B,
      currentOwnershipRef: OWNERSHIP_B,
      revision: 1,
      createdAt: 0,
      updatedAt: NOW,
      lastAction: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_B,
        correlationRef: `account:${ACCOUNT_B}`,
        idempotencyRef: `account:${ACCOUNT_B}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: OWNERSHIP_B,
      accountRef: ACCOUNT_B,
      ownerPrincipalRef: PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_B,
        correlationRef: `ownership:${OWNERSHIP_B}`,
        idempotencyRef: `ownership:${OWNERSHIP_B}`,
      },
    })

  })
}
function updatePayload(
  overrides: Partial<UpdatePreferencesInput> = {},
): UpdatePreferencesInput {
  return {
    expectedRevision: 0,
    correlationRef: correlationRef('update'),
    idempotencyRef: idempotencyRef('update'),
    ...overrides,
  }
}



describe('notification preferences', () => {
  it('N1: unauthenticated readPreferences refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectNotificationRefusal(
      () => backend.query(readPreferencesRef, {}),
      'identity_invalid',
    )
  })

  it('N2: unauthenticated updatePreferences refuses identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectNotificationRefusal(
      () => backend.mutation(updatePreferencesRef, updatePayload({ lowCreditBalance: false })),
      'identity_invalid',
    )
  })

  it('N3: seeded owner with no preference row reads virtual defaults without inserting', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(readPreferences(backend)).resolves.toEqual({
      ...VIRTUAL_DEFAULTS,
      accountRef: ACCOUNT_REF,
      principalRef: PRINCIPAL_REF,
    })
    expect(await listPreferenceRows(backend)).toHaveLength(0)
  })

  it('N4: owner disables lowCreditBalance at revision 0', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const receipt = await updatePreferences(backend, updatePayload({
      lowCreditBalance: false,
      correlationRef: correlationRef('n4'),
      idempotencyRef: idempotencyRef('n4'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 1 })
    await expect(readPreferences(backend)).resolves.toMatchObject({
      lowCreditBalance: false,
      revision: 1,
      isVirtualDefault: false,
    })
    expect(await listPreferenceRows(backend)).toHaveLength(1)
  })

  it('N5: replaying identical approval-request updates is idempotent', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const payload = updatePayload({
      agentApprovalRequested: false,
      correlationRef: correlationRef('n5'),
      idempotencyRef: idempotencyRef('n5'),
    })

    const updated = await updatePreferences(backend, payload)
    const replay = await updatePreferences(backend, payload)

    expect(updated).toEqual({ kind: 'updated', revision: 1 })
    expect(replay).toEqual({ kind: 'replayed', revision: 1 })
    await expect(readPreferences(backend)).resolves.toMatchObject({
      agentApprovalRequested: false,
      revision: 1,
    })
    expect(await listPreferenceRows(backend)).toHaveLength(1)
  })
  it('N17: legacy preference rows default approval email on and replay that default', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const payload = updatePayload({
      agentApprovalRequested: true,
      correlationRef: correlationRef('n17'),
      idempotencyRef: idempotencyRef('n17'),
    })
    await updatePreferences(backend, payload)

    await backend.run(async (ctx) => {
      const row = await ctx.db.query('userNotificationPreferences').first()
      if (row !== null) {
        await ctx.db.patch(row._id, { agentApprovalRequested: undefined })
      }
    })

    await expect(readPreferences(backend)).resolves.toMatchObject({
      agentApprovalRequested: true,
      revision: 1,
    })
    await expect(updatePreferences(backend, payload)).resolves.toEqual({
      kind: 'replayed',
      revision: 1,
    })
  })

  it('N6: stale expectedRevision refuses preference_revision_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePreferences(backend, updatePayload({
      lowCreditBalance: false,
      correlationRef: correlationRef('n6-first'),
      idempotencyRef: idempotencyRef('n6-first'),
    }))

    await expectNotificationRefusal(
      () => updatePreferences(backend, updatePayload({
        lowCreditBalance: true,
        expectedRevision: 0,
        correlationRef: correlationRef('n6-stale'),
        idempotencyRef: idempotencyRef('n6-stale'),
      })),
      'preference_revision_conflict',
    )
  })

  it('N7: partial patch merges spendCapWarning at revision 1', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePreferences(backend, updatePayload({
      lowCreditBalance: false,
      correlationRef: correlationRef('n7-first'),
      idempotencyRef: idempotencyRef('n7-first'),
    }))

    const receipt = await updatePreferences(backend, updatePayload({
      spendCapWarning: false,
      expectedRevision: 1,
      correlationRef: correlationRef('n7-second'),
      idempotencyRef: idempotencyRef('n7-second'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 2 })
    await expect(readPreferences(backend)).resolves.toMatchObject({
      lowCreditBalance: false,
      spendCapWarning: false,
      revision: 2,
    })
  })

  it('N8: invalid lowCreditThresholdCents refuses threshold_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectNotificationRefusal(
      () => updatePreferences(backend, updatePayload({
        lowCreditThresholdCents: 999,
        correlationRef: correlationRef('n8'),
        idempotencyRef: idempotencyRef('n8'),
      })),
      'threshold_invalid',
    )
    expect(await listPreferenceRows(backend)).toHaveLength(0)
  })

  it.each([1000, 5000] as const)(
    'N9: legal lowCreditThresholdCents %i persists',
    async (thresholdCents) => {
      const backend = createBackend()
      await seedAuthority(backend)

      await updatePreferences(backend, updatePayload({
        lowCreditThresholdCents: thresholdCents,
        correlationRef: correlationRef(`n9-${thresholdCents}`),
        idempotencyRef: idempotencyRef(`n9-${thresholdCents}`),
      }))

      await expect(readPreferences(backend)).resolves.toMatchObject({
        lowCreditThresholdCents: thresholdCents,
        revision: 1,
      })
    },
  )

  it('N10: membership-only caller can update their own preferences', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { access: 'membership' })

    const receipt = await updatePreferences(backend, updatePayload({
      invoiceReady: false,
      correlationRef: correlationRef('n10'),
      idempotencyRef: idempotencyRef('n10'),
    }))

    expect(receipt).toEqual({ kind: 'updated', revision: 1 })
    await expect(readPreferences(backend)).resolves.toMatchObject({
      invoiceReady: false,
      revision: 1,
    })
  })

  it('N12: suspended account caller cannot update preferences', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { accountLifecycle: 'suspended' })

    await expectNotificationRefusal(
      () => updatePreferences(backend, updatePayload({
        lowCreditBalance: false,
        correlationRef: correlationRef('n12'),
        idempotencyRef: idempotencyRef('n12'),
      })),
      'account_inactive',
    )
  })

  it('N14: empty correlationRef refuses correlation_ref_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectNotificationRefusal(
      () => updatePreferences(backend, updatePayload({ correlationRef: '' })),
      'correlation_ref_invalid',
    )
  })

  it('N15: preferences use the oldest self-created account under deterministic resolution', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSecondOwnedAccount(backend)

    await updatePreferences(backend, updatePayload({
      lowCreditBalance: false,
      correlationRef: correlationRef('n15-b'),
      idempotencyRef: idempotencyRef('n15-b'),
    }))

    await expect(readPreferences(backend)).resolves.toMatchObject({
      accountRef: ACCOUNT_B,
      principalRef: PRINCIPAL_REF,
      lowCreditBalance: false,
      isVirtualDefault: false,
    })
    await expect(listPreferenceRows(backend)).resolves.toMatchObject([
      { accountRef: ACCOUNT_B, lowCreditBalance: false },
    ])
  })

  it('N16: readPreferences after update does not insert extra preference rows', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await updatePreferences(backend, updatePayload({
      teamMembershipChanged: false,
      correlationRef: correlationRef('n16'),
      idempotencyRef: idempotencyRef('n16'),
    }))
    expect(await listPreferenceRows(backend)).toHaveLength(1)

    await readPreferences(backend)
    await readPreferences(backend)

    expect(await listPreferenceRows(backend)).toHaveLength(1)
  })

})

describe('approval notification deliveries', () => {
  it('enqueues a pending approval once for its current owner', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const callRef = 'operation-invocation:v1:notification-idempotency'
    await insertPendingApprovalCall(backend, callRef)

    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'enqueued' })
    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'exists' })
    await expect(listDeliveryRows(backend)).resolves.toMatchObject([{
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      eventKind: 'agent_approval_requested',
      sourceEventRef: callRef,
      state: 'pending',
      attemptCount: 0,
    }])
  })

  it('skips enqueue when the owner has opted out', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await updatePreferences(backend, updatePayload({
      agentApprovalRequested: false,
      correlationRef: correlationRef('approval-email-off'),
      idempotencyRef: idempotencyRef('approval-email-off'),
    }))
    const callRef = 'operation-invocation:v1:notification-opt-out'
    await insertPendingApprovalCall(backend, callRef)

    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'skipped' })
    await expect(listDeliveryRows(backend)).resolves.toHaveLength(0)
  })

  it('leases claimed rows so a second worker waits until the lease expires', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'))
      const backend = createBackend()
      await seedAuthority(backend)
      const callRef = 'operation-invocation:v1:notification-lease'
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)

      const firstClaim = await backend.run((ctx) => claimDueNotificationDeliveriesHandler(
        ctx as unknown as MutationCtx,
        { limit: 20 },
      ))
      expect(firstClaim).toMatchObject([{ deliveryRef: expect.any(String), attemptCount: 1 }])
      await expect(backend.run((ctx) => claimDueNotificationDeliveriesHandler(
        ctx as unknown as MutationCtx,
        { limit: 20 },
      ))).resolves.toEqual([])

      await vi.advanceTimersByTimeAsync(5 * 60_000)
      await expect(backend.run((ctx) => claimDueNotificationDeliveriesHandler(
        ctx as unknown as MutationCtx,
        { limit: 20 },
      ))).resolves.toMatchObject([{ attemptCount: 2 }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies sent, retry, failed and suppressed finish transitions', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const callRefs = [
      'operation-invocation:v1:notification-sent',
      'operation-invocation:v1:notification-retry',
      'operation-invocation:v1:notification-failed',
      'operation-invocation:v1:notification-suppressed',
    ]
    for (const callRef of callRefs) {
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)
    }
    const rows = await listDeliveryRows(backend)
    const sent = rows.find((row) => row.sourceEventRef === callRefs[0])
    const retry = rows.find((row) => row.sourceEventRef === callRefs[1])
    const failed = rows.find((row) => row.sourceEventRef === callRefs[2])
    const suppressed = rows.find((row) => row.sourceEventRef === callRefs[3])
    if (sent === undefined || retry === undefined || failed === undefined || suppressed === undefined) {
      throw new Error('notification_delivery_fixture_missing')
    }
    await backend.run(async (ctx) => {
      await finishNotificationDeliveryHandler(ctx as unknown as MutationCtx, {
        deliveryId: sent._id,
        outcome: 'sent',
        vendorMessageId: 'resend-message-123',
      })
      await finishNotificationDeliveryHandler(ctx as unknown as MutationCtx, {
        deliveryId: retry._id,
        outcome: 'retry',
        code: 'network_error',
        nextAttemptAt: Date.now() + 60_000,
      })
      await finishNotificationDeliveryHandler(ctx as unknown as MutationCtx, {
        deliveryId: failed._id,
        outcome: 'failed',
        code: 'no_verified_email',
      })
      await finishNotificationDeliveryHandler(ctx as unknown as MutationCtx, {
        deliveryId: suppressed._id,
        outcome: 'suppressed',
        code: 'no_clerk_identity',
      })
    })
    await expect(listDeliveryRows(backend)).resolves.toMatchObject([
      { sourceEventRef: callRefs[0], state: 'sent', vendorMessageId: 'resend-message-123' },
      { sourceEventRef: callRefs[1], state: 'pending', lastFailureCode: 'network_error' },
      { sourceEventRef: callRefs[2], state: 'failed', lastFailureCode: 'no_verified_email' },
      { sourceEventRef: callRefs[3], state: 'suppressed', suppressCode: 'no_clerk_identity' },
    ])
  })

  it('resolves approval email copy without including a Tool title or Call data', async () => {
    const previousSiteUrl = process.env.AE_SITE_URL
    process.env.AE_SITE_URL = 'https://aecon.example.test/'
    try {
      const backend = createBackend()
      await seedAuthority(backend)
      const callRef = 'operation-invocation:v1:notification-context'
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)
      const [delivery] = await listDeliveryRows(backend)
      if (delivery === undefined) throw new Error('notification_delivery_fixture_missing')
      const context = await backend.run((ctx) => readNotificationContextHandler(
        ctx as unknown as QueryCtx,
        { deliveryId: delivery._id },
      ))

      if (context.kind !== 'ready') throw new Error(`notification_context_not_ready:${context.code}`)
      expect(context).toMatchObject({
        clerkUserId: 'user_sam',
        subject: 'Sam canonical principal needs your approval',
      })
      expect(context.text).toContain('https://aecon.example.test/agent-access')
      expect(context.text).not.toContain('approval-email-tool-title')
      expect(context.text).not.toContain('grant:approval-email-test')
      expect(context.text).not.toContain('sha256:input')
    } finally {
      if (previousSiteUrl === undefined) delete process.env.AE_SITE_URL
      else process.env.AE_SITE_URL = previousSiteUrl
    }
  })
  it('does not claim deliveries when sender credentials are absent', async () => {
    const previous = {
      resend: process.env.RESEND_API_KEY,
      fromEmail: process.env.NOTIFICATION_FROM_EMAIL,
      clerkSecret: process.env.CLERK_SECRET_KEY,
    }
    delete process.env.RESEND_API_KEY
    delete process.env.NOTIFICATION_FROM_EMAIL
    delete process.env.CLERK_SECRET_KEY
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const backend = createBackend()
      await seedAuthority(backend)
      const callRef = 'operation-invocation:v1:notification-no-credentials'
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)

      await expect(backend.action(deliverOwnerNotificationsRef, {})).resolves.toBeNull()
      await expect(listDeliveryRows(backend)).resolves.toMatchObject([{ state: 'pending', attemptCount: 0 }])
      expect(report).toHaveBeenCalledOnce()
    } finally {
      if (previous.resend === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = previous.resend
      if (previous.fromEmail === undefined) delete process.env.NOTIFICATION_FROM_EMAIL
      else process.env.NOTIFICATION_FROM_EMAIL = previous.fromEmail
      if (previous.clerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
      else process.env.CLERK_SECRET_KEY = previous.clerkSecret
      report.mockRestore()
    }
  })
  it('sends a verified approval email through Resend with the stable delivery key', async () => {
    const previous = {
      resend: process.env.RESEND_API_KEY,
      fromEmail: process.env.NOTIFICATION_FROM_EMAIL,
      clerkSecret: process.env.CLERK_SECRET_KEY,
      siteUrl: process.env.AE_SITE_URL,
    }
    process.env.RESEND_API_KEY = 'resend-secret-test'
    process.env.NOTIFICATION_FROM_EMAIL = 'no-reply@example.test'
    process.env.CLERK_SECRET_KEY = 'clerk-secret-test'
    process.env.AE_SITE_URL = 'https://aecon.example.test'
    const sendEmail = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('', { status: 200 }))
    vi.stubGlobal('fetch', sendEmail)
    try {
      const backend = createBackend()
      await seedAuthority(backend)
      const callRef = 'operation-invocation:v1:notification-send'
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)
      const [delivery] = await listDeliveryRows(backend)
      if (delivery === undefined) throw new Error('notification_delivery_fixture_missing')

      await expect(backend.action(deliverOwnerNotificationsRef, {})).resolves.toBeNull()
      expect(clerkMocks.getUser).toHaveBeenCalledWith('user_sam')
      expect(sendEmail).toHaveBeenCalledOnce()
      const [url, request] = sendEmail.mock.calls[0] ?? []
      if (url === undefined || request === undefined || typeof request.body !== 'string') {
        throw new Error('resend_request_fixture_missing')
      }
      expect(url).toBe('https://api.resend.com/emails')
      expect(request.headers).toMatchObject({
        Authorization: 'Bearer resend-secret-test',
        'Idempotency-Key': delivery.deliveryRef,
        'User-Agent': 'aecon-notifications/1',
      })
      const payload = JSON.parse(request.body) as { to: string[]; subject: string; text: string }
      expect(payload).toMatchObject({
        from: 'no-reply@example.test',
        to: ['owner@example.test'],
        subject: 'Sam canonical principal needs your approval',
        text: expect.stringContaining('/agent-access'),
      })
      expect(JSON.stringify(payload)).not.toContain('approval-email-tool-title')
      expect(JSON.stringify(payload)).not.toContain('grant:approval-email-test')
      await expect(listDeliveryRows(backend)).resolves.toMatchObject([{ state: 'sent', attemptCount: 1 }])
    } finally {
      if (previous.resend === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = previous.resend
      if (previous.fromEmail === undefined) delete process.env.NOTIFICATION_FROM_EMAIL
      else process.env.NOTIFICATION_FROM_EMAIL = previous.fromEmail
      if (previous.clerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
      else process.env.CLERK_SECRET_KEY = previous.clerkSecret
      if (previous.siteUrl === undefined) delete process.env.AE_SITE_URL
      else process.env.AE_SITE_URL = previous.siteUrl
      vi.unstubAllGlobals()
      clerkMocks.getUser.mockClear()
    }
  })
})
