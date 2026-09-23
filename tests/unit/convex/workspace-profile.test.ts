import { makeFunctionReference } from 'convex/server'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createConvexServerFunctionAssertion } from '../../../src/lib/server/convex-source'
import type { Doc } from '../../../convex/_generated/dataModel'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const SYNC_OPERATION = 'workspaceProfile.syncOrganizationDisplayNameForServer'
const SYNC_SCOPE = 'workspace:sync_organization_display_name'

const CLERK_ORG_ID = 'org_test_workspace_profile'
const INITIAL_WORKSPACE_NAME = 'Acme Research'
const UPDATED_WORKSPACE_NAME = 'Acme Research Pty Ltd'

const ORG_ACCOUNT_REF = `acc_${'o'.repeat(32)}`
const ORG_OWNERSHIP_REF = `own_${'o'.repeat(32)}`
const ORG_BINDING_REF = `aob_${'o'.repeat(32)}`
const SECOND_ORG_BINDING_REF = `aob_${'p'.repeat(32)}`
const SECOND_ORG_ACCOUNT_REF = `acc_${'p'.repeat(32)}`
const SECOND_ORG_OWNERSHIP_REF = `own_${'p'.repeat(32)}`

type SyncOrganizationDisplayNameCommand = Readonly<{
  clerkOrgId: string
  displayName: string
  deliveryRefHash: string
  observedAt: number
}>

type SyncOrganizationDisplayNameResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' | 'display_name_invalid' }
>

const syncOrganizationDisplayNameForServerRef = makeFunctionReference<
  'mutation',
  SyncOrganizationDisplayNameCommand & Readonly<{
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  SyncOrganizationDisplayNameResult
>('workspaceProfile:syncOrganizationDisplayNameForServer')

const provisionOrganizationWorkspaceForServerRef = makeFunctionReference<
  'mutation',
  Readonly<{
    clerkOrgId: string
    displayName: string
    creatorTokenIdentifier: string
    correlationRef: string
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  Readonly<{
    kind: 'created' | 'replayed'
    accountRef: string
    ownershipRef: string
    bindingRef: string
  }>
>('workspaceProvisioning:provisionOrganizationWorkspaceForServer')

const ACCOUNT_DOCUMENT_KEYS = [
  '_creationTime',
  '_id',
  'accountRef',
  'createdAt',
  'creationActorPrincipalRef',
  'creationIdempotencyRef',
  'currentOwnershipRef',
  'displayName',
  'initialOwnershipRef',
  'lastAction',
  'lifecycle',
  'recoveryPolicy',
  'revision',
  'updatedAt',
] as const

const correlationRef = (label: string) => `test:workspace-profile:${label}`

function deliveryRefHash(deliveryRef: string): string {
  return canonicalDigest({
    contract: 'ae.clerk-webhook-delivery:v1',
    deliveryRef,
  })
}

function syncCommand(
  overrides: Partial<SyncOrganizationDisplayNameCommand> & { deliveryRef?: string } = {},
): SyncOrganizationDisplayNameCommand {
  const deliveryRef = overrides.deliveryRef ?? 'delivery-default'
  const { deliveryRef: _deliveryRef, ...rest } = overrides
  return {
    clerkOrgId: CLERK_ORG_ID,
    displayName: UPDATED_WORKSPACE_NAME,
    deliveryRefHash: deliveryRefHash(deliveryRef),
    observedAt: NOW + 100,
    ...rest,
  }
}

async function buildSyncServiceAuth(command: SyncOrganizationDisplayNameCommand) {
  return await createConvexServerFunctionAssertion({
    operation: SYNC_OPERATION,
    scope: SYNC_SCOPE,
    command,
    now: NOW,
  })
}

async function syncOrganizationDisplayNameForServer(
  backend: InteractiveAuthorityBackend,
  command: SyncOrganizationDisplayNameCommand,
  serviceAuth?: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>,
): Promise<SyncOrganizationDisplayNameResult> {
  return await backend.mutation(syncOrganizationDisplayNameForServerRef, {
    ...command,
    serviceAuth: serviceAuth ?? await buildSyncServiceAuth(command),
  })
}

async function provisionBoundOrgWorkspace(
  backend: InteractiveAuthorityBackend,
  displayName = INITIAL_WORKSPACE_NAME,
): Promise<string> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: 'workspaceProvisioning.provisionOrganizationWorkspaceForServer',
    scope: 'workspace:provision_organization',
    command: {
      clerkOrgId: CLERK_ORG_ID,
      displayName,
      creatorTokenIdentifier: TOKEN_IDENTIFIER,
      correlationRef: correlationRef('provision'),
    },
    now: NOW,
  })
  const result = await backend.mutation(provisionOrganizationWorkspaceForServerRef, {
    clerkOrgId: CLERK_ORG_ID,
    displayName,
    creatorTokenIdentifier: TOKEN_IDENTIFIER,
    correlationRef: correlationRef('provision'),
    serviceAuth,
  })
  return result.accountRef
}

async function readAccount(
  backend: InteractiveAuthorityBackend,
  accountRef: string,
): Promise<Doc<'accounts'> | null> {
  return await backend.run(async (ctx) =>
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .unique())
}

async function readPrincipal(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) =>
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', PRINCIPAL_REF))
      .unique())
}

async function insertOrgBinding(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    bindingRef: string
    accountRef: string
    providerIdentifier: string
    lifecycle?: 'active' | 'revoked'
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accountExternalOrganizationBindings', {
      bindingRef: input.bindingRef,
      accountRef: input.accountRef,
      providerNamespace: 'clerk/organization',
      providerIdentifier: input.providerIdentifier,
      lifecycle: input.lifecycle ?? 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function insertOrgAccountWithOwnership(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    accountRef: string
    ownershipRef: string
    displayName: string
    lifecycle?: 'active' | 'suspended' | 'closed'
    updatedAt?: number
    revision?: number
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef: input.accountRef,
      displayName: input.displayName,
      lifecycle: input.lifecycle ?? 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: PRINCIPAL_REF,
      creationIdempotencyRef: `account:${input.accountRef}`,
      initialOwnershipRef: input.ownershipRef,
      currentOwnershipRef: input.ownershipRef,
      revision: input.revision ?? 1,
      createdAt: NOW,
      updatedAt: input.updatedAt ?? NOW,
      lastAction: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: input.accountRef,
        correlationRef: `account:${input.accountRef}`,
        idempotencyRef: `account:${input.accountRef}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: input.ownershipRef,
      accountRef: input.accountRef,
      ownerPrincipalRef: PRINCIPAL_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_REF,
        activeAccountRef: input.accountRef,
        correlationRef: `account:${input.accountRef}`,
        idempotencyRef: `account:${input.accountRef}`,
      },
    })
  })
}

async function expectSyncRefusal(
  run: () => Promise<unknown>,
  code: 'authority_conflict' | 'display_name_invalid',
): Promise<void> {
  try {
    const result = await run()
    expect(result).toMatchObject({ kind: 'refused', code })
  } catch (error) {
    if (error !== null && typeof error === 'object' && 'code' in error) {
      expect((error as { code: string }).code).toBe(code)
      return
    }
    throw error
  }
}

describe('workspaceProfile syncOrganizationDisplayNameForServer (W-12)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-profile-test-key-material-32b'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = SERVICE_KEY
  })

  afterEach(() => {
    vi.useRealTimers()
    if (previousServiceKey === undefined) delete process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
    else process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = previousServiceKey
  })

  it('P1: bound active org with fresh observedAt updates account displayName and revision', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    const before = await readAccount(backend, accountRef)
    expect(before).not.toBeNull()

    const command = syncCommand({ deliveryRef: 'delivery-p1' })
    const result = await syncOrganizationDisplayNameForServer(backend, command)

    expect(result).toEqual({ kind: 'accepted', status: 'applied' })
    const after = await readAccount(backend, accountRef)
    expect(after).toMatchObject({
      displayName: UPDATED_WORKSPACE_NAME,
      revision: (before?.revision ?? 0) + 1,
    })
    expect(after?.updatedAt).toBeGreaterThanOrEqual(before?.updatedAt ?? 0)
  })

  it('P2: replaying the same deliveryRefHash returns replayed without revision bump', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    const command = syncCommand({ deliveryRef: 'delivery-p2' })

    expect(await syncOrganizationDisplayNameForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    const afterFirst = await readAccount(backend, accountRef)
    expect(await syncOrganizationDisplayNameForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    const afterReplay = await readAccount(backend, accountRef)
    expect(afterReplay?.revision).toBe(afterFirst?.revision)
    expect(afterReplay?.displayName).toBe(UPDATED_WORKSPACE_NAME)
  })

  it('P3: same displayName already on account does not bump revision', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend, UPDATED_WORKSPACE_NAME)
    const before = await readAccount(backend, accountRef)
    const command = syncCommand({
      deliveryRef: 'delivery-p3',
      displayName: UPDATED_WORKSPACE_NAME,
    })

    const result = await syncOrganizationDisplayNameForServer(backend, command)
    expect(result).toMatchObject({ kind: 'accepted' })
    if (result.kind === 'accepted') {
      expect(['applied', 'replayed']).toContain(result.status)
    }
    const after = await readAccount(backend, accountRef)
    expect(after?.revision).toBe(before?.revision)
    expect(after?.displayName).toBe(UPDATED_WORKSPACE_NAME)
  })

  it('P4: observedAt older than account.updatedAt leaves displayName unchanged', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: INITIAL_WORKSPACE_NAME,
      updatedAt: NOW + 500,
      revision: 3,
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: CLERK_ORG_ID,
    })

    const command = syncCommand({
      deliveryRef: 'delivery-p4',
      displayName: 'Stale Rename',
      observedAt: NOW + 100,
    })
    const result = await syncOrganizationDisplayNameForServer(backend, command)

    expect(result.kind).toBe('accepted')
    const account = await readAccount(backend, ORG_ACCOUNT_REF)
    expect(account).toMatchObject({
      displayName: INITIAL_WORKSPACE_NAME,
      revision: 3,
    })
  })

  it('P5: unknown clerk org id is accepted ignored without creating an account', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const beforeCount = await backend.run(async (ctx) =>
      (await ctx.db.query('accounts').collect()).length)

    const command = syncCommand({
      clerkOrgId: 'org_unknown_workspace_profile',
      deliveryRef: 'delivery-p5',
    })
    const result = await syncOrganizationDisplayNameForServer(backend, command)

    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    const afterCount = await backend.run(async (ctx) =>
      (await ctx.db.query('accounts').collect()).length)
    expect(afterCount).toBe(beforeCount)
  })

  it('P6: revoked org binding is accepted ignored', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: INITIAL_WORKSPACE_NAME,
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: CLERK_ORG_ID,
      lifecycle: 'revoked',
    })

    const command = syncCommand({ deliveryRef: 'delivery-p6' })
    const result = await syncOrganizationDisplayNameForServer(backend, command)

    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    const account = await readAccount(backend, ORG_ACCOUNT_REF)
    expect(account?.displayName).toBe(INITIAL_WORKSPACE_NAME)
  })

  it.each([
    ['suspended', 'suspended' as const],
    ['closed', 'closed' as const],
  ])('P7: %s workspace account is accepted ignored', async (_label, lifecycle) => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: INITIAL_WORKSPACE_NAME,
      lifecycle,
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: CLERK_ORG_ID,
    })

    const result = await syncOrganizationDisplayNameForServer(backend, syncCommand({
      deliveryRef: `delivery-p7-${lifecycle}`,
    }))

    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    const account = await readAccount(backend, ORG_ACCOUNT_REF)
    expect(account?.displayName).toBe(INITIAL_WORKSPACE_NAME)
  })

  it('P8: two active bindings for one clerk org refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: 'Workspace A',
    })
    await insertOrgAccountWithOwnership(backend, {
      accountRef: SECOND_ORG_ACCOUNT_REF,
      ownershipRef: SECOND_ORG_OWNERSHIP_REF,
      displayName: 'Workspace B',
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: CLERK_ORG_ID,
    })
    await insertOrgBinding(backend, {
      bindingRef: SECOND_ORG_BINDING_REF,
      accountRef: SECOND_ORG_ACCOUNT_REF,
      providerIdentifier: CLERK_ORG_ID,
    })

    await expectSyncRefusal(
      () => syncOrganizationDisplayNameForServer(backend, syncCommand({ deliveryRef: 'delivery-p8' })),
      'authority_conflict',
    )
  })

  it('P9: invalid HMAC or missing scope refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = syncCommand({ deliveryRef: 'delivery-p9' })

    const wrongScopeAuth = await createConvexServerFunctionAssertion({
      operation: SYNC_OPERATION,
      scope: 'workspace:provision_organization',
      command,
      now: NOW,
    })
    await expectSyncRefusal(
      () => syncOrganizationDisplayNameForServer(backend, command, wrongScopeAuth),
      'authority_conflict',
    )

    const forgedAuth = await createConvexServerFunctionAssertion({
      operation: SYNC_OPERATION,
      scope: SYNC_SCOPE,
      command: { ...command, displayName: 'Forged payload' },
      now: NOW,
    })
    await expectSyncRefusal(
      () => syncOrganizationDisplayNameForServer(backend, command, forgedAuth),
      'authority_conflict',
    )
  })

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['too long', `${'x'.repeat(201)}`],
  ] as const)('P10: invalid displayName (%s) refuses display_name_invalid', async (_label, displayName) => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)

    await expectSyncRefusal(
      () => syncOrganizationDisplayNameForServer(backend, syncCommand({
        deliveryRef: `delivery-p10-${_label}`,
        displayName,
      })),
      'display_name_invalid',
    )
  })

  it('P11: does not patch principals.displayName', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const principalBefore = await readPrincipal(backend)
    expect(principalBefore).not.toBeNull()

    await syncOrganizationDisplayNameForServer(backend, syncCommand({ deliveryRef: 'delivery-p11' }))

    const principalAfter = await readPrincipal(backend)
    expect(principalAfter).toMatchObject({
      displayName: principalBefore?.displayName,
      revision: principalBefore?.revision,
    })
  })

  it('P12: does not write slug, image, or other non-account fields onto the account row', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)

    await syncOrganizationDisplayNameForServer(backend, syncCommand({
      deliveryRef: 'delivery-p12',
      displayName: 'Acme With Logo',
    }))

    const account = await readAccount(backend, accountRef)
    expect(account).not.toBeNull()
    expect(Object.keys(account ?? {}).sort()).toEqual([...ACCOUNT_DOCUMENT_KEYS].sort())
    expect(account).not.toHaveProperty('slug')
    expect(account).not.toHaveProperty('image_url')
    expect(account).not.toHaveProperty('imageUrl')
    expect(account).not.toHaveProperty('supportEmail')
  })
})
