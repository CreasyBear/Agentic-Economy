import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  describe,
  expect,
  it,
} from 'vitest'

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


const setActiveWorkspaceRef = makeFunctionReference<
  'mutation',
  { accountRef: string; correlationRef: string },
  { principalRef: string; activeAccountRef: string; revision: number; selectedAt: number }
>('interactiveSession:setActiveWorkspace')

const VIRTUAL_DEFAULTS: Omit<PreferencesView, 'accountRef' | 'principalRef'> = {
  lowCreditBalance: true,
  lowCreditThresholdCents: 2500,
  spendCapWarning: true,
  callFailureSpike: true,
  invoiceReady: true,
  teamMembershipChanged: true,
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
      createdAt: NOW,
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
    await ctx.db.insert('interactiveSessionSelections', {
      principalRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      revision: 1,
      selectedAt: NOW,
      lastCorrelationRef: `session:${ACCOUNT_REF}`,
    })
  })
}

async function setActiveWorkspace(
  backend: InteractiveAuthorityBackend,
  accountRef: string,
  presentedIdentity: UserIdentity = identity(),
): Promise<void> {
  const session = backend.withIdentity(presentedIdentity)
  await session.mutation(setActiveWorkspaceRef, {
    accountRef,
    correlationRef: correlationRef(`workspace:${accountRef}`),
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

  it('N5: replaying identical update payload is idempotent', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const payload = updatePayload({
      lowCreditBalance: false,
      correlationRef: correlationRef('n5'),
      idempotencyRef: idempotencyRef('n5'),
    })

    await updatePreferences(backend, payload)
    const replay = await updatePreferences(backend, payload)

    expect(replay).toEqual({ kind: 'replayed', revision: 1 })
    expect(await listPreferenceRows(backend)).toHaveLength(1)
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

  it('N15: preferences on account A do not alter account B virtual defaults', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedSecondOwnedAccount(backend)

    await updatePreferences(backend, updatePayload({
      lowCreditBalance: false,
      correlationRef: correlationRef('n15-a'),
      idempotencyRef: idempotencyRef('n15-a'),
    }))

    await setActiveWorkspace(backend, ACCOUNT_B)

    await expect(readPreferences(backend)).resolves.toEqual({
      ...VIRTUAL_DEFAULTS,
      accountRef: ACCOUNT_B,
      principalRef: PRINCIPAL_REF,
    })
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
