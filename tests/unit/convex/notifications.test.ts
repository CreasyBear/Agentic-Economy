import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkId } from '@convex-dev/workpool'
import { Webhook } from 'svix'
import { components, internal } from '../../../convex/_generated/api'
import { AUTHORITY_REQUEST_TTL_MS } from '../../../convex/lib/capabilityExecution/callLifecycle/admissionApprovals'
import { enqueueEmail } from '../../../convex/lib/principalAccount/notifications/enqueue'
import { moneyNoticeAmount } from '../../../convex/lib/principalAccount/notifications/delivery'
import type { Id } from '../../../convex/_generated/dataModel'
import { emailAddressHash } from '../../../convex/lib/principalAccount/notifications/suppression'
import { signUnsubscribeToken } from '../../../convex/lib/principalAccount/notifications/unsubscribe'
import { buildDigest } from '../../../convex/operatorDigest'
import { convexTestWithWorkers } from '../../helpers/convex-fixtures'
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



afterEach(() => { vi.unstubAllEnvs() })

const UNSUBSCRIBE_SECRET = 'unsubscribe-secret-test'
const WEBHOOK_SECRET = `whsec_${Buffer.from('resend-webhook-test-key').toString('base64')}`
const signedToken = (stream: 'alert' | 'lifecycle') => signUnsubscribeToken(UNSUBSCRIBE_SECRET, {
  principalRef: PRINCIPAL_REF,
  accountRef: ACCOUNT_REF,
  stream,
})
const unsubscribePath = (token: string) => `/notifications/unsubscribe?t=${encodeURIComponent(token)}`

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

async function createNotificationBackend(): Promise<InteractiveAuthorityBackend> {
  const backend = convexTestWithWorkers()
  await backend.run((ctx) => ctx.runMutation(components.notificationWorkpool.config.update, {
    maxParallelism: 0,
  }))
  return backend
}

async function enqueueApprovalNotice(
  backend: InteractiveAuthorityBackend,
  callRef: string,
) {
  return await backend.mutation(internal.notifications.enqueueAgentApprovalRequested, { callRef })
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
  stalledStepEmails: boolean
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
  stalledStepEmails?: boolean
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




const VIRTUAL_DEFAULTS: Omit<PreferencesView, 'accountRef' | 'principalRef'> = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
  agentApprovalRequested: true,
  stalledStepEmails: false,
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

  it('N18: stalled step emails turn on and survive updates to other preferences', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expect(updatePreferences(backend, updatePayload({
      stalledStepEmails: true,
      correlationRef: correlationRef('n18-on'),
      idempotencyRef: idempotencyRef('n18-on'),
    }))).resolves.toEqual({ kind: 'updated', revision: 1 })
    await expect(readPreferences(backend)).resolves.toMatchObject({ stalledStepEmails: true, revision: 1 })

    await updatePreferences(backend, updatePayload({
      agentApprovalRequested: false,
      expectedRevision: 1,
      correlationRef: correlationRef('n18-other'),
      idempotencyRef: idempotencyRef('n18-other'),
    }))
    await expect(readPreferences(backend)).resolves.toMatchObject({
      stalledStepEmails: true,
      agentApprovalRequested: false,
      revision: 2,
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
    const backend = await createNotificationBackend()
    await seedAuthority(backend)
    const callRef = 'operation-invocation:v1:notification-idempotency'
    await insertPendingApprovalCall(backend, callRef)

    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'enqueued' })
    const [first] = await listDeliveryRows(backend)
    expect(first).toMatchObject({
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      eventKind: 'agent_approval_requested',
      sourceEventRef: callRef,
      state: 'pending',
      workId: expect.any(String),
    })
    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'exists' })
    expect(await listDeliveryRows(backend)).toEqual([first])
  })

  it('skips enqueue when the owner has opted out', async () => {
    const backend = await createNotificationBackend()
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

  it('caps approval emails at three per account per hour', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(NOW + 1_000)
      const backend = await createNotificationBackend()
      await seedAuthority(backend)
      for (let index = 0; index < 4; index += 1) {
        const callRef = `operation-invocation:v1:notification-flood-${index}`
        await insertPendingApprovalCall(backend, callRef)
        await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({
          kind: index < 3 ? 'enqueued' : 'suppressed',
        })
      }
      const rows = await listDeliveryRows(backend)
      expect(rows).toHaveLength(4)
      for (const row of rows.slice(0, 3)) {
        expect(row.state).toBe('pending')
        expect(row.workId).toEqual(expect.any(String))
      }
      expect(rows[3]).toMatchObject({ state: 'suppressed', suppressCode: 'notification_rate_limited' })
      expect(rows[3]?.workId).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stamps approval deliveries with the transactional stream', async () => {
    const backend = await createNotificationBackend()
    await seedAuthority(backend)
    const callRef = 'operation-invocation:v1:notification-stream'
    await insertPendingApprovalCall(backend, callRef)

    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'enqueued' })
    await expect(listDeliveryRows(backend)).resolves.toEqual([expect.objectContaining({ stream: 'transactional' })])
  })

  it('suppresses an approval while the transactional stream switch is off', async () => {
    vi.stubEnv('AE_EMAIL_TRANSACTIONAL_ENABLED', 'false')
    const backend = await createNotificationBackend()
    await seedAuthority(backend)
    const callRef = 'operation-invocation:v1:notification-kill-switch'
    await insertPendingApprovalCall(backend, callRef)

    await expect(enqueueApprovalNotice(backend, callRef)).resolves.toEqual({ kind: 'suppressed' })
    const rows = await listDeliveryRows(backend)
    expect(rows).toEqual([expect.objectContaining({ state: 'suppressed', suppressCode: 'stream_disabled', stream: 'transactional' })])
    expect(rows[0]?.workId).toBeUndefined()
  })

  it('atomically enqueues the approval when the reserved Call records its pending result', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_FORMANCE_ENVIRONMENT', 'production')
    const backend = await createNotificationBackend()
    await seedAuthority(backend)
    const callRef = 'operation-invocation:v1:notification-record'
    await backend.run(async (ctx) => {
      await ctx.db.insert('capabilityCalls', {
        callRef, principalId: PRINCIPAL_REF, ownerId: ACCOUNT_REF,
        credentialId: 'credential:approval-email-test',
        applicationRef: 'application:approval-email-test',
        toolRef: 'operation:v1:approval-email-tool-title',
        idempotencyKey: `approval-email:${callRef}`,
        environment: 'production', grantRef: 'grant:approval-email-test',
        grantGeneration: 1, policyDigest: 'sha256:policy',
        grantExpiresAt: 100_000, inputDigest: 'sha256:input',
        requestDigest: 'sha256:request', state: 'pending',
        formanceFinancialState: 'reserved', createdAt: NOW, updatedAt: NOW,
      })
    })
    const record = {
      callRef, principalId: PRINCIPAL_REF, state: 'pending' as const, now: NOW + 1,
      result: {
        kind: 'needs_authority' as const, callRef,
        toolRef: 'operation:v1:approval-email-tool-title',
        authorityRequest: {
          kind: 'approval_required' as const,
          toolRef: 'operation:v1:approval-email-tool-title',
          consequence: 'external_effect' as const,
          retryClass: 'reconcile_before_retry' as const,
          dataFields: [],
        },
      },
    }
    await expect(backend.mutation(internal.capabilityCalls.record, record)).resolves.toEqual({ kind: 'recorded' })
    const [delivery] = await listDeliveryRows(backend)
    expect(delivery).toMatchObject({ sourceEventRef: callRef, state: 'pending', workId: expect.any(String) })
    await expect(backend.mutation(internal.capabilityCalls.record, record)).resolves.toEqual({ kind: 'recorded' })
    expect(await listDeliveryRows(backend)).toEqual([delivery])
  })

  it('fences completion by work ID and terminal state and stores each outcome', async () => {
    const outcomes = [
      { label: 'sent', result: { kind: 'success' as const, returnValue: { outcome: 'sent' as const, vendorMessageId: 'resend-message-123' } }, state: 'sent', field: 'vendorMessageId', code: 'resend-message-123' },
      { label: 'provider-failed', result: { kind: 'success' as const, returnValue: { outcome: 'failed' as const, code: 'no_verified_email' } }, state: 'failed', field: 'lastFailureCode', code: 'no_verified_email' },
      { label: 'provider-suppressed', result: { kind: 'success' as const, returnValue: { outcome: 'suppressed' as const, code: 'opted_out' } }, state: 'suppressed', field: 'suppressCode', code: 'opted_out' },
      { label: 'exhausted', result: { kind: 'failed' as const, error: 'temporary provider failure' }, state: 'failed', field: 'lastFailureCode', code: 'retries_exhausted' },
      { label: 'canceled', result: { kind: 'canceled' as const }, state: 'suppressed', field: 'suppressCode', code: 'canceled' },
    ]
    for (const outcome of outcomes) {
      const backend = await createNotificationBackend()
      await seedAuthority(backend)
      const callRef = `operation-invocation:v1:notification-${outcome.label}`
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)
      const row = (await listDeliveryRows(backend)).find((candidate) => candidate.sourceEventRef === callRef)
      if (row?.workId === undefined) throw new Error('notification_work_fixture_missing')

      await backend.mutation(internal.notifications.completeDelivery, {
        workId: 'different-work-id' as WorkId, context: { deliveryId: row._id }, result: outcome.result,
      })
      expect((await backend.run((ctx) => ctx.db.get(row._id)))?.state).toBe('pending')
      await backend.mutation(internal.notifications.completeDelivery, {
        workId: row.workId as WorkId, context: { deliveryId: row._id }, result: outcome.result,
      })
      const completed = await backend.run((ctx) => ctx.db.get(row._id))
      expect(completed).toMatchObject({ state: outcome.state, [outcome.field]: outcome.code })
      await backend.mutation(internal.notifications.completeDelivery, {
        workId: row.workId as WorkId, context: { deliveryId: row._id },
        result: { kind: 'success', returnValue: { outcome: 'sent', vendorMessageId: 'late-message' } },
      })
      expect(await backend.run((ctx) => ctx.db.get(row._id))).toEqual(completed)
    }
  })

  it('rechecks the recipient, preference, and expiration before building an email', async () => {
    vi.useFakeTimers()
    const previousSiteUrl = process.env.AE_SITE_URL
    process.env.AE_SITE_URL = 'https://aecon.example.test/'
    try {
      vi.setSystemTime(NOW + 1_000)
      const backend = await createNotificationBackend()
      await seedAuthority(backend)
      const callRef = 'operation-invocation:v1:notification-context'
      await insertPendingApprovalCall(backend, callRef)
      await enqueueApprovalNotice(backend, callRef)
      const [delivery] = await listDeliveryRows(backend)
      if (delivery === undefined) throw new Error('notification_delivery_fixture_missing')
      const readContext = () => backend.query(internal.notifications.readNotificationContext, { deliveryId: delivery._id })

      const ready = await readContext()
      if (ready.kind !== 'ready') throw new Error(`notification_context_not_ready:${ready.code}`)
      expect(ready).toMatchObject({ stream: 'transactional', email: { eventKind: 'agent_approval_requested' } })
      expect(ready.email.props).toMatchObject({ siteUrl: 'https://aecon.example.test', agentName: expect.stringContaining('Sam canonical principal') })
      expect(JSON.stringify(ready.email)).not.toContain('approval-email-tool-title')
      expect(JSON.stringify(ready.email)).not.toContain('$')

      await backend.run(async (ctx) => {
        const owner = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', `own_${'3'.repeat(32)}`)).unique()
        if (owner === null) throw new Error('owner_fixture_missing')
        await ctx.db.patch(owner._id, { ownerPrincipalRef: `prn_${'8'.repeat(32)}` })
      })
      await expect(readContext()).resolves.toEqual({ kind: 'skip', code: 'recipient_changed' })

      await backend.run(async (ctx) => {
        const owner = await ctx.db.query('accountOwnerships')
          .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', `own_${'3'.repeat(32)}`)).unique()
        if (owner === null) throw new Error('owner_fixture_missing')
        await ctx.db.patch(owner._id, { ownerPrincipalRef: PRINCIPAL_REF })
      })
      await updatePreferences(backend, updatePayload({
        agentApprovalRequested: false,
        correlationRef: correlationRef('context-opt-out'),
        idempotencyRef: idempotencyRef('context-opt-out'),
      }))
      await expect(readContext()).resolves.toEqual({ kind: 'skip', code: 'opted_out' })

      vi.setSystemTime(NOW + AUTHORITY_REQUEST_TTL_MS)
      await expect(readContext()).resolves.toEqual({ kind: 'skip', code: 'approval_expired' })
    } finally {
      if (previousSiteUrl === undefined) delete process.env.AE_SITE_URL
      else process.env.AE_SITE_URL = previousSiteUrl
      vi.useRealTimers()
    }
  })
})

describe('alert email caps', () => {
  it('allows one alert per kind and three alerts per recipient in a rolling day, suppressing the rest', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(NOW + 1_000)
      const backend = await createNotificationBackend()
      await seedAuthority(backend)
      const send = (eventKind: 'low_credit_balance' | 'spend_cap_warning' | 'spend_cap_exceeded' | 'call_failure_spike', sourceEventRef: string) =>
        backend.run((ctx) => enqueueEmail(ctx, {
          eventKind,
          stream: 'alert',
          recipientPrincipalRef: PRINCIPAL_REF,
          accountRef: ACCOUNT_REF,
          sourceEventRef,
        }))
      await expect(send('low_credit_balance', 'month-1:low-credit')).resolves.toBe('enqueued')
      await expect(send('low_credit_balance', 'month-2:low-credit')).resolves.toBe('suppressed')
      await expect(send('spend_cap_warning', 'month-1:ceiling')).resolves.toBe('enqueued')
      await expect(send('call_failure_spike', 'month-1:calls')).resolves.toBe('enqueued')
      await expect(send('spend_cap_warning', 'month-1:ceiling-2')).resolves.toBe('suppressed')
      await expect(send('spend_cap_exceeded', 'month-1:ceiling-exceeded')).resolves.toBe('suppressed')
      const rows = await listDeliveryRows(backend)
      expect(rows.filter((row) => row.state === 'suppressed').map((row) => row.suppressCode))
        .toEqual(['alert_kind_daily_cap', 'alert_kind_daily_cap', 'alert_daily_cap'])
      vi.setSystemTime(NOW + 2_000 + 24 * 60 * 60 * 1000)
      await expect(send('low_credit_balance', 'month-3:low-credit')).resolves.toBe('enqueued')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('stalled step notification deliveries', () => {
  async function seedStalledOwner(backend: InteractiveAuthorityBackend, stalledStepEmails: boolean | undefined) {
    await seedAuthority(backend)
    await updatePreferences(backend, updatePayload({
      correlationRef: correlationRef('stalled-pref'),
      idempotencyRef: idempotencyRef('stalled-pref'),
    }))
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('userNotificationPreferences').first()
      if (row !== null) await ctx.db.patch(row._id, { stalledStepEmails })
      await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT_REF,
        name: 'signed_up',
        eventKey: `${ACCOUNT_REF}:signed_up`,
        createdAt: Date.now() - 48 * 3600_000,
      })
    })
  }

  const enqueueStalled = (backend: InteractiveAuthorityBackend) =>
    backend.action(internal.notifications.sweepStalledStepEmails, {})

  it('sends nothing while the deployment flag is off', async () => {
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)

    await enqueueStalled(backend)
    await expect(listDeliveryRows(backend)).resolves.toHaveLength(0)
  })

  it('sends nothing when the owner has not opted in', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, undefined)

    await enqueueStalled(backend)
    await expect(listDeliveryRows(backend)).resolves.toHaveLength(0)
  })

  it('enqueues exactly one email per stalled step across runs', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)

    await enqueueStalled(backend)
    await enqueueStalled(backend)
    const rows = await listDeliveryRows(backend)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      eventKind: 'stalled_not_funded',
      sourceEventRef: ACCOUNT_REF,
      state: 'pending',
      workId: expect.any(String),
    })
  })

  it('stamps stalled-step deliveries with the lifecycle stream', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)

    await enqueueStalled(backend)
    await expect(listDeliveryRows(backend)).resolves.toEqual([expect.objectContaining({ stream: 'lifecycle', state: 'pending' })])
  })

  it('suppresses stalled-step mail while the lifecycle stream switch is off', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    vi.stubEnv('AE_EMAIL_LIFECYCLE_ENABLED', 'false')
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)

    await enqueueStalled(backend)
    const rows = await listDeliveryRows(backend)
    expect(rows).toEqual([expect.objectContaining({ state: 'suppressed', suppressCode: 'stream_disabled', stream: 'lifecycle' })])
    expect(rows[0]?.workId).toBeUndefined()
  })

  it('reaches every stalled step in one run, so a later step is not starved by an earlier one', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)
    await backend.run(async (ctx) => {
      await ctx.db.insert('journeyEvents', {
        accountRef: ACCOUNT_REF, name: 'funded', eventKey: `${ACCOUNT_REF}:funded`, createdAt: Date.now() - 30 * 3600_000,
      })
    })

    await enqueueStalled(backend)
    await expect(listDeliveryRows(backend)).resolves.toEqual([expect.objectContaining({ eventKind: 'stalled_no_agent' })])
  })

  it('one-click unsubscribe turns stalled-step emails off for that owner and account only', async () => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET)
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)
    const token = await signedToken('lifecycle')

    await expect(backend.fetch(unsubscribePath(token), { method: 'GET' })).resolves.toMatchObject({ status: 200 })
    await expect(readPreferences(backend)).resolves.toMatchObject({ stalledStepEmails: true })
    await expect(backend.fetch(unsubscribePath(token), { method: 'POST' })).resolves.toMatchObject({ status: 200 })
    await expect(readPreferences(backend)).resolves.toMatchObject({ stalledStepEmails: false, agentApprovalRequested: true })
  })

  it('builds a stalled email with a footer unsubscribe link and the RFC 8058 target', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    vi.stubEnv('AE_SITE_URL', 'https://ae.example.test')
    vi.stubEnv('CONVEX_SITE_URL', 'https://convex.example.test/')
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET)
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)
    await enqueueStalled(backend)
    const [delivery] = await listDeliveryRows(backend)
    if (delivery === undefined) throw new Error('delivery_missing')

    const context = await backend.query(internal.notifications.readNotificationContext, { deliveryId: delivery._id })
    const unsubscribeUrl = `https://convex.example.test/notifications/unsubscribe?t=${encodeURIComponent(await signedToken('lifecycle'))}`
    expect(context).toMatchObject({
      kind: 'ready',
      stream: 'lifecycle',
      email: { eventKind: 'stalled_not_funded', props: { siteUrl: 'https://ae.example.test', unsubscribeUrl } },
    })
  })

  it('keeps a delivered webhook state when the send completion arrives later', async () => {
    const backend = await createNotificationBackend()
    await seedAuthority(backend)
    const callRef = 'operation-invocation:v1:notification-rank'
    await insertPendingApprovalCall(backend, callRef)
    await enqueueApprovalNotice(backend, callRef)
    const row = (await listDeliveryRows(backend)).find((candidate) => candidate.sourceEventRef === callRef)
    if (row?.workId === undefined) throw new Error('notification_work_fixture_missing')
    await backend.run((ctx) => ctx.db.patch(row._id, { state: 'delivered', vendorMessageId: 'em_webhook_first' }))

    await backend.mutation(internal.notifications.completeDelivery, {
      workId: row.workId as WorkId, context: { deliveryId: row._id },
      result: { kind: 'success', returnValue: { outcome: 'sent', vendorMessageId: 'em_late_send' } },
    })
    await expect(backend.run((ctx) => ctx.db.get(row._id))).resolves.toMatchObject({ state: 'delivered', vendorMessageId: 'em_webhook_first' })
  })

  it('ignores the retired deliveryRef unsubscribe form', async () => {
    vi.stubEnv('AE_STALLED_EMAILS_ENABLED', 'true')
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET)
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)
    await enqueueStalled(backend)
    const [delivery] = await listDeliveryRows(backend)
    if (delivery === undefined) throw new Error('delivery_missing')

    await expect(backend.fetch(`/notifications/unsubscribe?d=${encodeURIComponent(delivery.deliveryRef)}`, { method: 'POST' }))
      .resolves.toMatchObject({ status: 404 })
    await expect(readPreferences(backend)).resolves.toMatchObject({ stalledStepEmails: true })
  })

  it('one-click unsubscribe from alerts turns off the alert toggles and leaves stalled emails alone', async () => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET)
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)

    await expect(backend.fetch(unsubscribePath(await signedToken('alert')), { method: 'POST' })).resolves.toMatchObject({ status: 200 })
    await expect(readPreferences(backend)).resolves.toMatchObject({
      lowCreditBalance: false,
      spendCapWarning: false,
      callFailureSpike: false,
      stalledStepEmails: true,
    })
  })

  it('refuses a tampered unsubscribe token without changing preferences', async () => {
    vi.stubEnv('EMAIL_UNSUBSCRIBE_SECRET', UNSUBSCRIBE_SECRET)
    const backend = await createNotificationBackend()
    await seedStalledOwner(backend, true)
    const token = await signedToken('lifecycle')

    await expect(backend.fetch(unsubscribePath(`${token.slice(0, -2)}xx`), { method: 'POST' })).resolves.toMatchObject({ status: 404 })
    await expect(readPreferences(backend)).resolves.toMatchObject({ stalledStepEmails: true })
  })

  it('enqueues the operator digest on the notification workpool', async () => {
    const backend = await createNotificationBackend()
    await expect(backend.mutation(internal.operatorDigest.enqueue, {})).resolves.toBeNull()
  })

  it('reports an operator digest the workpool gave up on', async () => {
    const backend = await createNotificationBackend()
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await backend.mutation(internal.operatorDigest.completeDigest, { workId: 'work_1' as WorkId, context: null, result: { kind: 'failed', error: 'resend_503' } })
    await backend.mutation(internal.operatorDigest.completeDigest, { workId: 'work_2' as WorkId, context: null, result: { kind: 'success', returnValue: null } })
    const degraded = error.mock.calls.filter(([prefix]) => prefix === '[ae.degraded]')
    expect(degraded).toHaveLength(1)
    expect(String(degraded[0]?.[1])).toContain('sendOperatorDigest')
  })

  it('renders an invalid unsubscribe link as a page that points to notification settings', async () => {
    vi.stubEnv('AE_SITE_URL', 'https://ae.example.test/')
    const backend = await createNotificationBackend()
    const response = await backend.fetch('/notifications/unsubscribe?t=not-a-token', { method: 'POST' })
    expect(response.status).toBe(404)
    const html = await response.text()
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<a href="https://ae.example.test/owner/settings/notifications">notification settings</a>')
  })
})

describe('resend delivery webhook', () => {
  async function insertSentDelivery(
    backend: InteractiveAuthorityBackend,
    input: { vendorMessageId: string; stream: 'transactional' | 'lifecycle' | 'operator' },
  ) {
    const now = Date.now()
    return await backend.run((ctx) => ctx.db.insert('notificationDeliveries', {
      deliveryRef: `notification:webhook-${input.vendorMessageId}`,
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      eventKind: input.stream === 'lifecycle' ? 'stalled_not_funded' : 'agent_approval_requested',
      stream: input.stream,
      sourceEventRef: `source:${input.vendorMessageId}`,
      vendorMessageId: input.vendorMessageId,
      state: 'sent',
      createdAt: now,
      updatedAt: now,
    }))
  }

  async function postResendEvent(
    backend: InteractiveAuthorityBackend,
    event: { type: string; emailId: string; to: string; bounceType?: 'Permanent' | 'Transient' },
    svixId: string,
    secret = WEBHOOK_SECRET,
  ) {
    const body = JSON.stringify({
      type: event.type,
      created_at: '2026-10-11T00:00:00.000Z',
      data: {
        email_id: event.emailId,
        to: [event.to],
        ...(event.bounceType === undefined ? {} : { bounce: { type: event.bounceType, message: 'test bounce' } }),
      },
    })
    const timestamp = new Date()
    const signature = new Webhook(secret).sign(svixId, timestamp, body)
    return await backend.fetch('/resend/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': svixId,
        'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'svix-signature': signature,
      },
      body,
    })
  }

  const suppressionRows = (backend: InteractiveAuthorityBackend) =>
    backend.run((ctx) => ctx.db.query('emailSuppressions').collect())
  const deliveryState = async (backend: InteractiveAuthorityBackend, id: Id<'notificationDeliveries'>) =>
    (await backend.run((ctx) => ctx.db.get(id)))?.state

  it('records a permanent bounce, moves the delivery to bounced and suppresses the address', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    const backend = await createNotificationBackend()
    const deliveryId = await insertSentDelivery(backend, { vendorMessageId: 'em_bounce_1', stream: 'transactional' })

    const response = await postResendEvent(backend, { type: 'email.bounced', emailId: 'em_bounce_1', to: 'Owner@Example.test', bounceType: 'Permanent' }, 'msg_bounce_1')

    expect(response.status).toBe(200)
    await expect(deliveryState(backend, deliveryId)).resolves.toBe('bounced')
    await expect(suppressionRows(backend)).resolves.toEqual([expect.objectContaining({
      addressHash: await emailAddressHash('owner@example.test'),
      domain: 'example.test',
      reason: 'hard_bounce',
      sourceDeliveryRef: 'notification:webhook-em_bounce_1',
    })])
  })

  it('treats a replayed svix id as a duplicate and adds no second suppression', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    const backend = await createNotificationBackend()
    await insertSentDelivery(backend, { vendorMessageId: 'em_replay_1', stream: 'transactional' })
    const event = { type: 'email.bounced', emailId: 'em_replay_1', to: 'replay@example.test', bounceType: 'Permanent' as const }

    await expect(postResendEvent(backend, event, 'msg_replay_1')).resolves.toMatchObject({ status: 200 })
    await expect(postResendEvent(backend, event, 'msg_replay_1')).resolves.toMatchObject({ status: 200 })
    await expect(suppressionRows(backend)).resolves.toHaveLength(1)
    await expect(backend.run((ctx) => ctx.db.query('emailWebhookEvents').collect())).resolves.toHaveLength(1)
  })

  it('refuses a payload whose signature does not match and changes nothing', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    const backend = await createNotificationBackend()
    const deliveryId = await insertSentDelivery(backend, { vendorMessageId: 'em_forged_1', stream: 'transactional' })
    const otherSecret = `whsec_${Buffer.from('some-other-key').toString('base64')}`

    const response = await postResendEvent(backend, { type: 'email.bounced', emailId: 'em_forged_1', to: 'forged@example.test', bounceType: 'Permanent' }, 'msg_forged_1', otherSecret)

    expect(response.status).toBe(400)
    await expect(deliveryState(backend, deliveryId)).resolves.toBe('sent')
    await expect(suppressionRows(backend)).resolves.toHaveLength(0)
  })

  it('never moves a bounced delivery back to delivered', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    const backend = await createNotificationBackend()
    const deliveryId = await insertSentDelivery(backend, { vendorMessageId: 'em_order_1', stream: 'transactional' })

    await postResendEvent(backend, { type: 'email.bounced', emailId: 'em_order_1', to: 'order@example.test', bounceType: 'Permanent' }, 'msg_order_1')
    await postResendEvent(backend, { type: 'email.delivered', emailId: 'em_order_1', to: 'order@example.test' }, 'msg_order_2')

    await expect(deliveryState(backend, deliveryId)).resolves.toBe('bounced')
  })

  it('logs a transient bounce without suppressing or changing the delivery', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    const backend = await createNotificationBackend()
    const deliveryId = await insertSentDelivery(backend, { vendorMessageId: 'em_soft_1', stream: 'transactional' })

    await expect(postResendEvent(backend, { type: 'email.bounced', emailId: 'em_soft_1', to: 'soft@example.test', bounceType: 'Transient' }, 'msg_soft_1'))
      .resolves.toMatchObject({ status: 200 })
    await expect(deliveryState(backend, deliveryId)).resolves.toBe('sent')
    await expect(suppressionRows(backend)).resolves.toHaveLength(0)
  })

  it('records a complaint that stops alert and lifecycle mail but not required mail', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    const backend = await createNotificationBackend()
    const lifecycleId = await insertSentDelivery(backend, { vendorMessageId: 'em_complaint_1', stream: 'lifecycle' })
    const requiredId = await insertSentDelivery(backend, { vendorMessageId: 'em_complaint_2', stream: 'transactional' })
    const operatorId = await insertSentDelivery(backend, { vendorMessageId: 'em_complaint_3', stream: 'operator' })

    await postResendEvent(backend, { type: 'email.complained', emailId: 'em_complaint_1', to: 'complaint@example.test' }, 'msg_complaint_1')

    const addressHash = await emailAddressHash('complaint@example.test')
    await expect(backend.query(internal.notifications.readSendSuppression, { deliveryId: lifecycleId, addressHash })).resolves.toBe('complaint_suppressed')
    await expect(backend.query(internal.notifications.readSendSuppression, { deliveryId: requiredId, addressHash })).resolves.toBeNull()
    await expect(backend.query(internal.notifications.readSendSuppression, { deliveryId: operatorId, addressHash })).resolves.toBeNull()
  })
})

describe('email deliverability observability', () => {
  const DAY_MS = 24 * 3_600_000

  async function seedDeliverabilityRows(backend: InteractiveAuthorityBackend, now: number) {
    await backend.run(async (ctx) => {
      const delivery = (state: 'bounced' | 'complained' | 'failed' | 'delivered', updatedAt: number, index: number) =>
        ctx.db.insert('notificationDeliveries', {
          deliveryRef: `notification:deliverability-${index}`,
          recipientPrincipalRef: PRINCIPAL_REF,
          accountRef: ACCOUNT_REF,
          eventKind: 'agent_approval_requested',
          stream: 'transactional',
          sourceEventRef: `source:deliverability-${index}`,
          state,
          createdAt: updatedAt,
          updatedAt,
        })
      await delivery('bounced', now - 1_000, 1)
      await delivery('bounced', now - 2 * DAY_MS, 2)
      await delivery('complained', now - 1_000, 3)
      await delivery('failed', now - 1_000, 4)
      await delivery('delivered', now - 1_000, 5)
      await ctx.db.insert('emailSuppressions', { addressHash: 'hash_recent', domain: 'example.test', reason: 'hard_bounce', sourceDeliveryRef: 'del:recent', createdAt: now - 1_000 })
      await ctx.db.insert('emailSuppressions', { addressHash: 'hash_old', domain: 'example.test', reason: 'complaint', sourceDeliveryRef: 'del:old', createdAt: now - 2 * DAY_MS })
    })
  }

  it('counts bounces, complaints and failures from the last 24 hours, and suppressions added in that window', async () => {
    const backend = await createNotificationBackend()
    const now = Date.now()
    await seedDeliverabilityRows(backend, now)

    await expect(backend.query(internal.operatorDigest.deliverability, { since: now - DAY_MS }))
      .resolves.toEqual({ bounced: 1, complained: 1, failed: 1, suppressed: 1 })
  })

  it('leads the operator digest with the deliverability line', async () => {
    const backend = await createNotificationBackend()
    const now = Date.now()
    await seedDeliverabilityRows(backend, now)
    const runQuery = ((reference: Parameters<typeof backend.query>[0], args: Record<string, unknown>) =>
      backend.query(reference, args as never)) as never

    const digest = await buildDigest({ runQuery }, now)

    expect(digest.text.split('\n')[0]).toBe('Deliverability, last 24h: 1 bounced, 1 complained, 1 failed, 1 suppressed.')
  })

  it('forwards a bounce or complaint to PostHog once per svix id, with stream and kind but no address', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', WEBHOOK_SECRET)
    vi.stubEnv('POSTHOG_KEY', 'phc_test_key')
    const realFetch = globalThis.fetch
    const posthog = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) =>
      String(input).includes('/batch/') ? new Response(null, { status: 200 }) : await realFetch(input, init))
    const backend = await createNotificationBackend()
    const now = Date.now()
    await backend.run((ctx) => ctx.db.insert('notificationDeliveries', {
      deliveryRef: 'notification:webhook-em_ph_1',
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      eventKind: 'agent_approval_requested',
      stream: 'transactional',
      sourceEventRef: 'source:em_ph_1',
      vendorMessageId: 'em_ph_1',
      state: 'sent',
      createdAt: now,
      updatedAt: now,
    }))

    const body = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'em_ph_1', to: ['owner@example.test'], bounce: { type: 'Permanent', message: 'test bounce' } },
    })
    const timestamp = new Date()
    const post = () => backend.fetch('/resend/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_ph_1',
        'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'svix-signature': new Webhook(WEBHOOK_SECRET).sign('msg_ph_1', timestamp, body),
      },
      body,
    })
    await post()
    await post()

    const batches = posthog.mock.calls
      .filter(([input]) => String(input).includes('/batch/'))
      .map(([, init]) => String(init?.body))
    posthog.mockRestore()
    expect(batches).toHaveLength(1)
    expect(JSON.parse(batches[0]!)).toMatchObject({
      api_key: 'phc_test_key',
      batch: [{ event: 'ae.email.bounced', properties: { stream: 'transactional', event_kind: 'agent_approval_requested', permanent: true } }],
    })
    expect(batches[0]).not.toContain('owner@example.test')
  })
})

describe('phase 3 email gate', () => {
  const enqueuePhase3 = (backend: InteractiveAuthorityBackend, eventKind: 'welcome' | 'provider_live') =>
    backend.run((ctx) => enqueueEmail(ctx, {
      eventKind,
      stream: 'transactional',
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      sourceEventRef: `phase3:${eventKind}`,
    }))

  it('suppresses a phase 3 email while AE_EMAIL_PHASE3_ENABLED is unset, and leaves no workpool work', async () => {
    const backend = await createNotificationBackend()
    await seedAuthority(backend)

    await expect(enqueuePhase3(backend, 'welcome')).resolves.toBe('suppressed')
    const rows = await listDeliveryRows(backend)
    expect(rows).toEqual([expect.objectContaining({ state: 'suppressed', suppressCode: 'stream_disabled', eventKind: 'welcome' })])
    expect(rows[0]?.workId).toBeUndefined()
  })

  it('enqueues a phase 3 email once the gate is on, and dedupes the same source', async () => {
    vi.stubEnv('AE_EMAIL_PHASE3_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedAuthority(backend)

    await expect(enqueuePhase3(backend, 'provider_live')).resolves.toBe('enqueued')
    await expect(enqueuePhase3(backend, 'provider_live')).resolves.toBe('exists')
    const rows = await listDeliveryRows(backend)
    expect(rows).toEqual([expect.objectContaining({ state: 'pending', eventKind: 'provider_live', required: true })])
  })

  it('reads a phase 3 welcome back as a ready required notice for the active owner at send time', async () => {
    vi.stubEnv('AE_EMAIL_PHASE3_ENABLED', 'true')
    vi.stubEnv('AE_SITE_URL', 'https://app.aecon.test')
    const backend = await createNotificationBackend()
    await seedAuthority(backend)
    await enqueuePhase3(backend, 'welcome')
    const [row] = await listDeliveryRows(backend)

    await expect(backend.run((ctx) => ctx.runQuery(internal.notifications.readNotificationContext, {
      deliveryId: row!._id,
    }))).resolves.toMatchObject({
      kind: 'ready',
      email: { eventKind: 'welcome', props: { siteUrl: 'https://app.aecon.test' } },
    })
  })

  it('keeps phase 2 mail gated by its own switch, not the phase 3 one', async () => {
    vi.stubEnv('AE_EMAIL_PHASE3_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedAuthority(backend)

    await expect(backend.run((ctx) => enqueueEmail(ctx, {
      eventKind: 'key_issued', stream: 'transactional', recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF, sourceEventRef: 'phase3:key_issued',
    }))).resolves.toBe('suppressed')
  })
})

describe('phase 2 email gate and money amounts', () => {
  const enqueuePhase2 = (backend: InteractiveAuthorityBackend, eventKind: 'key_issued' | 'task_refunded') =>
    backend.run((ctx) => enqueueEmail(ctx, {
      eventKind,
      stream: 'transactional',
      recipientPrincipalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      sourceEventRef: `phase2:${eventKind}`,
    }))

  it('suppresses a phase 2 email while AE_EMAIL_PHASE2_ENABLED is unset', async () => {
    const backend = await createNotificationBackend()
    await seedAuthority(backend)

    await expect(enqueuePhase2(backend, 'key_issued')).resolves.toBe('suppressed')
    const rows = await listDeliveryRows(backend)
    expect(rows).toEqual([expect.objectContaining({ state: 'suppressed', suppressCode: 'stream_disabled', eventKind: 'key_issued' })])
    expect(rows[0]?.workId).toBeUndefined()
  })

  it('enqueues a phase 2 email once the gate is on, and dedupes the same source', async () => {
    vi.stubEnv('AE_EMAIL_PHASE2_ENABLED', 'true')
    const backend = await createNotificationBackend()
    await seedAuthority(backend)

    await expect(enqueuePhase2(backend, 'task_refunded')).resolves.toBe('enqueued')
    await expect(enqueuePhase2(backend, 'task_refunded')).resolves.toBe('exists')
    const rows = await listDeliveryRows(backend)
    expect(rows).toEqual([expect.objectContaining({ state: 'pending', eventKind: 'task_refunded', required: true })])
  })

  it('accepts only canonical AUD money from the ledger and refuses anything else', () => {
    expect(moneyNoticeAmount({ currency: 'AUD', units: '4200000', exponent: 6 })).toBe('A$4.20')
    expect(moneyNoticeAmount({ currency: 'AUD', units: '20000000', exponent: 6 })).toBe('A$20.00')
    expect(moneyNoticeAmount({ currency: 'USD', units: '4200000', exponent: 6 })).toBeUndefined()
    expect(moneyNoticeAmount({ currency: 'AUD', units: '04200000', exponent: 6 })).toBeUndefined()
    expect(moneyNoticeAmount({ currency: 'AUD', units: '4200000' })).toBeUndefined()
    expect(moneyNoticeAmount(undefined)).toBeUndefined()
  })
})
