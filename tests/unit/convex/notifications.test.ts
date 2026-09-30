import { makeFunctionReference, type UserIdentity } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import type { WorkId } from '@convex-dev/workpool'
import { components, internal } from '../../../convex/_generated/api'
import { AUTHORITY_REQUEST_TTL_MS } from '../../../convex/lib/capabilityExecution/callLifecycle/admissionApprovals'
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

  it('atomically enqueues the approval when the reserved Call records its pending result', async () => {
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
      expect(`${ready.subject} ${ready.text}`).toContain('Sam canonical principal')
      expect(ready.text).toContain('https://aecon.example.test/agent-access')
      expect(`${ready.subject} ${ready.text}`).not.toContain('approval-email-tool-title')
      expect(`${ready.subject} ${ready.text}`).not.toContain('$')

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
