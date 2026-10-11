import { makeFunctionReference } from 'convex/server'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { api } from '../../../convex/_generated/api'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
} from '../../../convex/interactiveAuthority'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { createConvexServerFunctionAssertion } from '../../../src/lib/server/convex-source'
import type { Doc } from '../../../convex/_generated/dataModel'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_OWNER_REF,
  INTERACTIVE_TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const RECORD_OPERATION = 'workspaceMemberships.recordOrganizationMembershipCreatedForServer'
const RECORD_SCOPE = 'workspace:record_organization_membership_created'
const RECORD_UPDATED_OPERATION = 'workspaceMemberships.recordOrganizationMembershipUpdatedForServer'
const RECORD_UPDATED_SCOPE = 'workspace:record_organization_membership_updated'
const RECORD_DELETED_OPERATION = 'workspaceMemberships.recordOrganizationMembershipDeletedForServer'
const RECORD_DELETED_SCOPE = 'workspace:record_organization_membership_deleted'
const CLERK_ORG_MEMBERSHIP_ACTOR_REF = 'ae:clerk-organization-membership'

const CLERK_ORG_ID = 'org_test_workspace_membership'
const OTHER_CLERK_ORG_ID = 'org_test_workspace_membership_other'
const INITIAL_WORKSPACE_NAME = 'Acme Membership Lab'

const ORG_ACCOUNT_REF = `acc_${'m'.repeat(32)}`
const ORG_OWNERSHIP_REF = `own_${'m'.repeat(32)}`
const ORG_BINDING_REF = `aob_${'m'.repeat(32)}`
const SECOND_ORG_BINDING_REF = `aob_${'n'.repeat(32)}`
const SECOND_ORG_ACCOUNT_REF = `acc_${'n'.repeat(32)}`
const SECOND_ORG_OWNERSHIP_REF = `own_${'n'.repeat(32)}`

const INVITEE_PRINCIPAL_REF = `prn_${'c'.repeat(32)}`
const INVITEE_BINDING_REF = `eib_${'i'.repeat(32)}`
const INVITEE_PROVIDER_IDENTIFIER = 'https://clerk.example.test|user_invitee_01'
const OWNER_PROVIDER_IDENTIFIER = INTERACTIVE_TOKEN_IDENTIFIER
const TOKEN_IDENTIFIER = INTERACTIVE_TOKEN_IDENTIFIER
const AGENT_PRINCIPAL_REF = `prn_${'g'.repeat(32)}`
const AGENT_BINDING_REF = `eib_${'g'.repeat(32)}`

const REMOVED_AGENT_REF = `prn_${'a'.repeat(32)}`
const OTHER_AGENT_REF = `prn_${'b'.repeat(32)}`
const MEMBERSHIP_ID = 'orgmem_test_workspace_membership_alpha'
const ENDED_MEMBERSHIP_REF = `mem_${'e'.repeat(32)}`
const PRIOR_ACTIVE_MEMBERSHIP_REF = `mem_${'p'.repeat(32)}`

type OrganizationMembershipCreatedCommand = Readonly<{
  clerkOrgId: string
  deliveryRefHash: string
  membershipRefHash: string
  providerIdentifier: string
  role: 'org:admin' | 'org:member'
  observedAt: number
}>

type OrganizationMembershipCreatedResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' | 'identity_binding_missing' | 'organization_unbound' }
>

type OrganizationMembershipUpdatedCommand = OrganizationMembershipCreatedCommand
type OrganizationMembershipUpdatedResult = OrganizationMembershipCreatedResult
type OrganizationMembershipDeletedCommand = OrganizationMembershipCreatedCommand
type OrganizationMembershipDeletedResult = OrganizationMembershipCreatedResult

const recordOrganizationMembershipCreatedForServerRef = makeFunctionReference<
  'mutation',
  OrganizationMembershipCreatedCommand & Readonly<{
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  OrganizationMembershipCreatedResult
>('workspaceMemberships:recordOrganizationMembershipCreatedForServer')

const recordOrganizationMembershipUpdatedForServerRef = makeFunctionReference<
  'mutation',
  OrganizationMembershipUpdatedCommand & Readonly<{
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  OrganizationMembershipUpdatedResult
>('workspaceMemberships:recordOrganizationMembershipUpdatedForServer')

const recordOrganizationMembershipDeletedForServerRef = makeFunctionReference<
  'mutation',
  OrganizationMembershipDeletedCommand & Readonly<{
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  OrganizationMembershipDeletedResult
>('workspaceMemberships:recordOrganizationMembershipDeletedForServer')

const listDirectoryRef = makeFunctionReference<
  'query',
  Record<string, never>,
  Readonly<{
    members: ReadonlyArray<Readonly<{ principalRef: string; lifecycle: string }>>
  }>
>('workspaceTeam:listDirectory')

const provisionOrganizationWorkspaceForServerRef = api.workspaceProvisioning.provisionOrganizationWorkspaceForServer

const correlationRef = (label: string) => `test:workspace-membership:${label}`

function deliveryRefHash(deliveryRef: string): string {
  return canonicalDigest({
    contract: 'ae.clerk-webhook-delivery:v1',
    deliveryRef,
  })
}

function membershipRefHash(membershipRef: string): string {
  return canonicalDigest({
    contract: 'ae.clerk-organization-membership-ref:v1',
    membershipRef,
  })
}

function membershipCommand(
  overrides: Partial<OrganizationMembershipCreatedCommand> & { deliveryRef?: string; membershipRef?: string } = {},
): OrganizationMembershipCreatedCommand {
  const deliveryRef = overrides.deliveryRef ?? 'delivery-default'
  const membershipRef = overrides.membershipRef ?? MEMBERSHIP_ID
  const { deliveryRef: _deliveryRef, membershipRef: _membershipRef, ...rest } = overrides
  return {
    clerkOrgId: CLERK_ORG_ID,
    deliveryRefHash: deliveryRefHash(deliveryRef),
    membershipRefHash: membershipRefHash(membershipRef),
    providerIdentifier: INVITEE_PROVIDER_IDENTIFIER,
    role: 'org:member',
    observedAt: NOW + 100,
    ...rest,
  }
}

async function buildRecordServiceAuth(command: OrganizationMembershipCreatedCommand) {
  return await createConvexServerFunctionAssertion({
    operation: RECORD_OPERATION,
    scope: RECORD_SCOPE,
    command,
    now: NOW,
  })
}

async function recordOrganizationMembershipCreatedForServer(
  backend: InteractiveAuthorityBackend,
  command: OrganizationMembershipCreatedCommand,
  serviceAuth?: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>,
): Promise<OrganizationMembershipCreatedResult> {
  return await backend.mutation(recordOrganizationMembershipCreatedForServerRef, {
    ...command,
    serviceAuth: serviceAuth ?? await buildRecordServiceAuth(command),
  })
}

function updatedMembershipCommand(
  overrides: Partial<OrganizationMembershipUpdatedCommand> & { deliveryRef?: string; membershipRef?: string } = {},
): OrganizationMembershipUpdatedCommand {
  return membershipCommand({
    ...overrides,
    role: overrides.role ?? 'org:admin',
  })
}

async function buildRecordUpdatedServiceAuth(command: OrganizationMembershipUpdatedCommand) {
  return await createConvexServerFunctionAssertion({
    operation: RECORD_UPDATED_OPERATION,
    scope: RECORD_UPDATED_SCOPE,
    command,
    now: NOW,
  })
}

async function recordOrganizationMembershipUpdatedForServer(
  backend: InteractiveAuthorityBackend,
  command: OrganizationMembershipUpdatedCommand,
  serviceAuth?: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>,
): Promise<OrganizationMembershipUpdatedResult> {
  return await backend.mutation(recordOrganizationMembershipUpdatedForServerRef, {
    ...command,
    serviceAuth: serviceAuth ?? await buildRecordUpdatedServiceAuth(command),
  })
}

function deletedMembershipCommand(
  overrides: Partial<OrganizationMembershipDeletedCommand> & { deliveryRef?: string; membershipRef?: string } = {},
): OrganizationMembershipDeletedCommand {
  return membershipCommand(overrides)
}

async function buildRecordDeletedServiceAuth(command: OrganizationMembershipDeletedCommand) {
  return await createConvexServerFunctionAssertion({
    operation: RECORD_DELETED_OPERATION,
    scope: RECORD_DELETED_SCOPE,
    command,
    now: NOW,
  })
}

async function recordOrganizationMembershipDeletedForServer(
  backend: InteractiveAuthorityBackend,
  command: OrganizationMembershipDeletedCommand,
  serviceAuth?: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>,
): Promise<OrganizationMembershipDeletedResult> {
  return await backend.mutation(recordOrganizationMembershipDeletedForServerRef, {
    ...command,
    serviceAuth: serviceAuth ?? await buildRecordDeletedServiceAuth(command),
  })
}

async function listMembershipDeletedAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('auditEvents').collect()
    return rows.filter((row) => row.eventType === 'account.workspace_membership.deleted')
  })
}

async function listDirectoryForOwner(backend: InteractiveAuthorityBackend) {
  const session = backend.withIdentity(samIdentity(TOKEN_IDENTIFIER, { org_id: CLERK_ORG_ID }))
  return await session.query(listDirectoryRef, {})
}

async function insertActiveMembershipRow(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    accountRef: string
    memberPrincipalRef?: string
    membershipRef?: string
    revision?: number
    role?: 'org:admin' | 'org:member'
    omitRole?: boolean
    lifecycle?: 'active' | 'ended'
  }>,
): Promise<void> {
  const membershipRef = input.membershipRef ?? PRIOR_ACTIVE_MEMBERSHIP_REF
  const memberPrincipalRef = input.memberPrincipalRef ?? INVITEE_PRINCIPAL_REF
  await backend.run(async (ctx) => {
    await ctx.db.insert('memberships', {
      membershipRef,
      accountRef: input.accountRef,
      memberPrincipalRef,
      lifecycle: input.lifecycle ?? 'active',
      revision: input.revision ?? 1,
      createdAt: NOW - 10,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_OWNER_REF,
        activeAccountRef: input.accountRef,
        correlationRef: `test:membership:${membershipRef}`,
        idempotencyRef: `test:membership:${membershipRef}`,
      },
      ...(input.omitRole !== true && input.role !== undefined ? { role: input.role } : {}),
    })
  })
}

async function listMembershipUpdatedAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('auditEvents').collect()
    return rows.filter((row) => row.eventType === 'account.workspace_membership.updated')
  })
}

async function provisionBoundOrgWorkspace(
  backend: InteractiveAuthorityBackend,
  clerkOrgId = CLERK_ORG_ID,
  displayName = INITIAL_WORKSPACE_NAME,
): Promise<string> {
  const serviceAuth = await createConvexServerFunctionAssertion({
    operation: 'workspaceProvisioning.provisionOrganizationWorkspaceForServer',
    scope: 'workspace:provision_organization',
    command: {
      clerkOrgId,
      displayName,
      creatorTokenIdentifier: TOKEN_IDENTIFIER,
      correlationRef: correlationRef(`provision:${clerkOrgId}`),
    },
    now: NOW,
  })
  const result = await backend.mutation(provisionOrganizationWorkspaceForServerRef, {
    clerkOrgId,
    displayName,
    creatorTokenIdentifier: TOKEN_IDENTIFIER,
    correlationRef: correlationRef(`provision:${clerkOrgId}`),
    serviceAuth: { ...serviceAuth, scopes: [...serviceAuth.scopes] },
  })
  if (result.kind === 'refused') throw new Error(`provisioning refused: ${result.code}`)
  return result.accountRef
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
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef: input.accountRef,
      displayName: input.displayName,
      lifecycle: input.lifecycle ?? 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: PRINCIPAL_OWNER_REF,
      creationIdempotencyRef: `account:${input.accountRef}`,
      initialOwnershipRef: input.ownershipRef,
      currentOwnershipRef: input.ownershipRef,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      lastAction: {
        actorPrincipalRef: PRINCIPAL_OWNER_REF,
        activeAccountRef: input.accountRef,
        correlationRef: `account:${input.accountRef}`,
        idempotencyRef: `account:${input.accountRef}`,
      },
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef: input.ownershipRef,
      accountRef: input.accountRef,
      ownerPrincipalRef: PRINCIPAL_OWNER_REF,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: NOW,
      createdBy: {
        actorPrincipalRef: PRINCIPAL_OWNER_REF,
        activeAccountRef: input.accountRef,
        correlationRef: `account:${input.accountRef}`,
        idempotencyRef: `account:${input.accountRef}`,
      },
    })
  })
}

async function insertHumanPrincipal(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    principalRef: string
    displayName: string
    kind?: 'human' | 'agent' | 'workload'
    lifecycle?: 'active' | 'suspended'
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: input.principalRef,
      kind: input.kind ?? 'human',
      displayName: input.displayName,
      lifecycle: input.lifecycle ?? 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function insertUserIdentityBinding(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    bindingRef: string
    principalRef: string
    providerIdentifier: string
    lifecycle?: 'active' | 'revoked'
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef: input.bindingRef,
      principalRef: input.principalRef,
      providerNamespace: 'clerk/user',
      providerIdentifier: input.providerIdentifier,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: input.lifecycle ?? 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:${input.bindingRef}`,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function seedInviteePrincipalWithBinding(
  backend: InteractiveAuthorityBackend,
  options: Readonly<{
    principalRef?: string
    bindingRef?: string
    providerIdentifier?: string
    principalKind?: 'human' | 'agent' | 'workload'
    bindingLifecycle?: 'active' | 'revoked'
    duplicateBinding?: boolean
  }> = {},
): Promise<void> {
  const principalRef = options.principalRef ?? INVITEE_PRINCIPAL_REF
  const bindingRef = options.bindingRef ?? INVITEE_BINDING_REF
  const providerIdentifier = options.providerIdentifier ?? INVITEE_PROVIDER_IDENTIFIER
  await insertHumanPrincipal(backend, {
    principalRef,
    displayName: 'Invitee Human',
    ...(options.principalKind !== undefined ? { kind: options.principalKind } : {}),
  })
  await insertUserIdentityBinding(backend, {
    bindingRef,
    principalRef,
    providerIdentifier,
    ...(options.bindingLifecycle !== undefined ? { lifecycle: options.bindingLifecycle } : {}),
  })
  if (options.duplicateBinding === true) {
    await insertUserIdentityBinding(backend, {
      bindingRef: `eib_${'d'.repeat(32)}`,
      principalRef,
      providerIdentifier,
    })
  }
}

async function listMembershipAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('auditEvents').collect()
    return rows.filter((row) => row.eventType === 'account.workspace_membership.created')
  })
}

async function listMembershipRows(backend: InteractiveAuthorityBackend, accountRef?: string) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('memberships').collect()
    return accountRef === undefined ? rows : rows.filter((row) => row.accountRef === accountRef)
  })
}

async function countTable(
  backend: InteractiveAuthorityBackend,
  table: 'memberships' | 'accountOwnerships',
): Promise<number> {
  return await backend.run(async (ctx) => (await ctx.db.query(table).collect()).length)
}

async function readAccountRevision(
  backend: InteractiveAuthorityBackend,
  accountRef: string,
): Promise<number> {
  return await backend.run(async (ctx) => {
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', accountRef))
      .unique()
    if (account === null) throw new Error('account_missing')
    return account.revision
  })
}

async function expectRecordRefusal(
  run: () => Promise<unknown>,
  code: 'authority_conflict' | 'identity_binding_missing',
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

function parseRedactedPayload(row: Doc<'auditEvents'>): Record<string, unknown> {
  return JSON.parse(row.redactedPayloadJson) as Record<string, unknown>
}

async function seedMembershipObservationFixture(
  backend: InteractiveAuthorityBackend,
): Promise<string> {
  await seedAuthority(backend)
  await seedInviteePrincipalWithBinding(backend)
  return await provisionBoundOrgWorkspace(backend)
}

describe('workspaceMemberships recordOrganizationMembershipCreatedForServer (W-17)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-membership-test-key-material-32'

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

  it('C1: bound org and active invitee principal applies one membership and audit', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)
    const command = membershipCommand({ deliveryRef: 'delivery-c1' })

    const result = await recordOrganizationMembershipCreatedForServer(backend, command)
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })

    const memberships = await listMembershipRows(backend, accountRef)
    expect(memberships).toHaveLength(1)
    expect(memberships[0]).toMatchObject({
      lifecycle: 'active',
      revision: 1,
      memberPrincipalRef: INVITEE_PRINCIPAL_REF,
      accountRef,
    })

    const audits = await listMembershipAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRef)
    expect(audits[0]?.eventType).toBe('account.workspace_membership.created')

    const notices = await backend.run((ctx) => ctx.db.query('notificationDeliveries').collect())
    expect(notices.filter((row) => row.eventKind === 'team_membership_changed')).toEqual([
      expect.objectContaining({ state: 'suppressed', accountRef }),
    ])
  })

  it('C2: replay with same deliveryRefHash returns replayed with one membership and audit', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)
    const command = membershipCommand({ deliveryRef: 'delivery-c2' })

    expect(await recordOrganizationMembershipCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    expect(await recordOrganizationMembershipCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(await listMembershipRows(backend)).toHaveLength(1)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(1)
  })

  it('C3: replay with same deliveryRefHash but conflicting payload refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)
    const command = membershipCommand({ deliveryRef: 'delivery-c3' })
    expect(await recordOrganizationMembershipCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })

    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, {
        ...command,
        role: 'org:admin',
      }),
      'authority_conflict',
    )
    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, {
        ...command,
        membershipRefHash: membershipRefHash('orgmem_conflicting_ref'),
      }),
      'authority_conflict',
    )
    expect(await listMembershipRows(backend)).toHaveLength(1)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(1)
  })

  it('C4: unknown clerkOrgId refuses organization_unbound with zero memberships and audits', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)
    const command = membershipCommand({
      clerkOrgId: 'org_unknown_workspace_membership',
      deliveryRef: 'delivery-c4',
    })

    expect(await recordOrganizationMembershipCreatedForServer(backend, command)).toEqual({
      kind: 'refused',
      code: 'organization_unbound',
    })
    expect(await listMembershipRows(backend)).toHaveLength(0)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(0)
  })

  it('C5: inactive account is ignored and revoked binding is refused without memberships or audits', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: INITIAL_WORKSPACE_NAME,
      lifecycle: 'suspended',
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: CLERK_ORG_ID,
    })

    expect(await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c5-account',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: SECOND_ORG_ACCOUNT_REF,
      ownershipRef: SECOND_ORG_OWNERSHIP_REF,
      displayName: 'Active Workspace',
    })
    await insertOrgBinding(backend, {
      bindingRef: SECOND_ORG_BINDING_REF,
      accountRef: SECOND_ORG_ACCOUNT_REF,
      providerIdentifier: OTHER_CLERK_ORG_ID,
      lifecycle: 'revoked',
    })

    expect(await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      clerkOrgId: OTHER_CLERK_ORG_ID,
      deliveryRef: 'delivery-c5-binding',
    }))).toEqual({ kind: 'refused', code: 'organization_unbound' })

    expect(await listMembershipRows(backend)).toHaveLength(0)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(0)
  })

  it('C6: multiple active bindings for one clerk org refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
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

    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, membershipCommand({ deliveryRef: 'delivery-c6' })),
      'authority_conflict',
    )
    expect(await listMembershipRows(backend)).toHaveLength(0)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(0)
  })

  it('C7: invalid or forged HMAC refuses authority_conflict with zero memberships and audits', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)
    const command = membershipCommand({ deliveryRef: 'delivery-c7' })

    const wrongScopeAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_OPERATION,
      scope: 'workspace:provision_organization',
      command,
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, command, wrongScopeAuth),
      'authority_conflict',
    )

    const forgedAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_OPERATION,
      scope: RECORD_SCOPE,
      command: { ...command, role: 'org:admin' },
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, command, forgedAuth),
      'authority_conflict',
    )
    expect(await listMembershipRows(backend)).toHaveLength(0)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(0)
  })

  it('C8: audit redactedPayload contains clerkOrgId, membershipRefHash, role, memberPrincipalRef only', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)
    const command = membershipCommand({ deliveryRef: 'delivery-c8' })
    await recordOrganizationMembershipCreatedForServer(backend, command)

    const [audit] = await listMembershipAuditEvents(backend)
    expect(audit).toBeDefined()
    const payload = parseRedactedPayload(audit!)
    expect(Object.keys(payload).sort()).toEqual([
      'clerkOrgId',
      'memberPrincipalRef',
      'membershipRefHash',
      'role',
    ])
    expect(payload).toMatchObject({
      clerkOrgId: CLERK_ORG_ID,
      membershipRefHash: command.membershipRefHash,
      role: 'org:member',
      memberPrincipalRef: INVITEE_PRINCIPAL_REF,
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('orgmem_')
    expect(serialized).not.toContain('user_')
    expect(serialized).not.toContain('http')
  })

  it('C9: accountOwnerships and account revision are untouched', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)
    const revisionBefore = await readAccountRevision(backend, accountRef)
    const ownershipsBefore = await countTable(backend, 'accountOwnerships')

    await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({ deliveryRef: 'delivery-c9' }))

    expect(await readAccountRevision(backend, accountRef)).toBe(revisionBefore)
    expect(await countTable(backend, 'accountOwnerships')).toBe(ownershipsBefore)
  })

  it('C10: org A join never writes membership or audit on org B', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
    const accountRefA = await provisionBoundOrgWorkspace(backend, CLERK_ORG_ID, 'Workspace A')
    const accountRefB = await provisionBoundOrgWorkspace(backend, OTHER_CLERK_ORG_ID, 'Workspace B')

    await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      clerkOrgId: CLERK_ORG_ID,
      deliveryRef: 'delivery-c10-a',
    }))

    expect(await listMembershipRows(backend, accountRefB)).toHaveLength(0)
    const audits = await listMembershipAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRefA)
    expect(audits.every((row) => row.activeAccountRef !== accountRefB)).toBe(true)
  })

  it('C11: existing user with prior identity binding applies on first delivery', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
    await provisionBoundOrgWorkspace(backend)

    const result = await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c11',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })
    expect(await listMembershipRows(backend)).toHaveLength(1)
  })

  it('C12: missing identity binding refuses until binding exists then applies', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = membershipCommand({ deliveryRef: 'delivery-c12' })

    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, command),
      'identity_binding_missing',
    )
    expect(await listMembershipRows(backend)).toHaveLength(0)

    await seedInviteePrincipalWithBinding(backend)
    expect(await recordOrganizationMembershipCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    expect(await listMembershipRows(backend)).toHaveLength(1)
  })

  it('C13: active membership pair idempotency replays new deliveryRefHash with one active row', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)
    await backend.run(async (ctx) => {
      await ctx.db.insert('memberships', {
        membershipRef: PRIOR_ACTIVE_MEMBERSHIP_REF,
        accountRef,
        memberPrincipalRef: INVITEE_PRINCIPAL_REF,
        lifecycle: 'active',
        revision: 1,
        createdAt: NOW - 10,
        createdBy: {
          actorPrincipalRef: PRINCIPAL_OWNER_REF,
          activeAccountRef: accountRef,
          correlationRef: 'test:membership:c13',
          idempotencyRef: 'test:membership:c13',
        },
      })
    })

    const result = await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c13-new',
      membershipRef: 'orgmem_test_workspace_membership_beta',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'replayed' })
    const activeRows = (await listMembershipRows(backend, accountRef))
      .filter((row) => row.lifecycle === 'active')
    expect(activeRows).toHaveLength(1)
    expect(activeRows[0]?.membershipRef).toBe(PRIOR_ACTIVE_MEMBERSHIP_REF)
  })

  it('C14: ended membership plus new delivery applies a new membershipRef row', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)
    await backend.run(async (ctx) => {
      await ctx.db.insert('memberships', {
        membershipRef: ENDED_MEMBERSHIP_REF,
        accountRef,
        memberPrincipalRef: INVITEE_PRINCIPAL_REF,
        lifecycle: 'ended',
        revision: 2,
        createdAt: NOW - 100,
        endedAt: NOW - 50,
        createdBy: {
          actorPrincipalRef: PRINCIPAL_OWNER_REF,
          activeAccountRef: accountRef,
          correlationRef: 'test:membership:c14-ended',
          idempotencyRef: 'test:membership:c14-ended',
        },
      })
    })

    const result = await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c14',
      membershipRef: 'orgmem_test_workspace_membership_rejoin',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })

    const rows = await listMembershipRows(backend, accountRef)
    expect(rows.filter((row) => row.lifecycle === 'ended')).toHaveLength(1)
    expect(rows.filter((row) => row.lifecycle === 'active')).toHaveLength(1)
    expect(rows.find((row) => row.lifecycle === 'ended')?.membershipRef).toBe(ENDED_MEMBERSHIP_REF)
    expect(rows.find((row) => row.lifecycle === 'active')?.membershipRef).not.toBe(ENDED_MEMBERSHIP_REF)
  })

  it('C15: workspace owner providerIdentifier is ignored without changing memberships', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)
    const before = await countTable(backend, 'memberships')

    const result = await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c15',
      providerIdentifier: OWNER_PROVIDER_IDENTIFIER,
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await countTable(backend, 'memberships')).toBe(before)
    expect(await listMembershipAuditEvents(backend)).toHaveLength(0)
  })

  it('C16: inactive user binding is ignored', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend, { bindingLifecycle: 'revoked' })
    await provisionBoundOrgWorkspace(backend)

    const result = await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c16',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await listMembershipRows(backend)).toHaveLength(0)
  })

  it('C17: ambiguous user bindings refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend, { duplicateBinding: true })
    await provisionBoundOrgWorkspace(backend)

    await expectRecordRefusal(
      () => recordOrganizationMembershipCreatedForServer(backend, membershipCommand({ deliveryRef: 'delivery-c17' })),
      'authority_conflict',
    )
    expect(await listMembershipRows(backend)).toHaveLength(0)
  })

  it('C18: non-human principal binding is ignored', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertHumanPrincipal(backend, {
      principalRef: AGENT_PRINCIPAL_REF,
      displayName: 'Agent Invitee',
      kind: 'agent',
    })
    await insertUserIdentityBinding(backend, {
      bindingRef: AGENT_BINDING_REF,
      principalRef: AGENT_PRINCIPAL_REF,
      providerIdentifier: 'https://clerk.example.test|user_agent_invitee',
    })
    await provisionBoundOrgWorkspace(backend)

    const result = await recordOrganizationMembershipCreatedForServer(backend, membershipCommand({
      deliveryRef: 'delivery-c18',
      providerIdentifier: 'https://clerk.example.test|user_agent_invitee',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await listMembershipRows(backend)).toHaveLength(0)
  })
})

describe('workspaceMemberships recordOrganizationMembershipUpdatedForServer (W-18)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-membership-updated-test-key-32'

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

  async function seedUpdatedObservationFixture(
    backend: InteractiveAuthorityBackend,
    membershipInput: Readonly<{
      role?: 'org:admin' | 'org:member'
      omitRole?: boolean
      revision?: number
    }> = {},
  ): Promise<string> {
    const accountRef = await seedMembershipObservationFixture(backend)
    await insertActiveMembershipRow(backend, {
      accountRef,
      role: membershipInput.role ?? 'org:member',
      ...(membershipInput.omitRole === true ? { omitRole: true } : {}),
      ...(membershipInput.revision !== undefined ? { revision: membershipInput.revision } : {}),
    })
    return accountRef
  }

  it('U1: active membership promotes to org:admin with revision bump and updated audit', async () => {
    const backend = createBackend()
    const accountRef = await seedUpdatedObservationFixture(backend)
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u1', role: 'org:admin' })

    const result = await recordOrganizationMembershipUpdatedForServer(backend, command)
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })

    const [membership] = await listMembershipRows(backend, accountRef)
    expect(membership?.role).toBe('org:admin')
    expect(membership?.revision).toBe(2)

    const audits = await listMembershipUpdatedAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRef)
  })

  it('U2: same deliveryRefHash replay returns replayed without duplicate audit or revision bump', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend)
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u2', role: 'org:admin' })

    expect(await recordOrganizationMembershipUpdatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    const revisionAfterApply = (await listMembershipRows(backend))[0]?.revision
    expect(await recordOrganizationMembershipUpdatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(await listMembershipRows(backend)).toHaveLength(1)
    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(1)
    expect((await listMembershipRows(backend))[0]?.revision).toBe(revisionAfterApply)
  })

  it('U3: same delivery with conflicting role or membershipRefHash refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend)
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u3', role: 'org:admin' })
    expect(await recordOrganizationMembershipUpdatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })

    await expectRecordRefusal(
      () => recordOrganizationMembershipUpdatedForServer(backend, {
        ...command,
        role: 'org:member',
      }),
      'authority_conflict',
    )
    await expectRecordRefusal(
      () => recordOrganizationMembershipUpdatedForServer(backend, {
        ...command,
        membershipRefHash: membershipRefHash('orgmem_updated_conflict'),
      }),
      'authority_conflict',
    )
    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(1)
  })

  it('U4: membership role already matches command returns replayed without new audit', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend, { role: 'org:admin' })
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u4', role: 'org:admin' })
    const revisionBefore = (await listMembershipRows(backend))[0]?.revision

    expect(await recordOrganizationMembershipUpdatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(0)
    expect((await listMembershipRows(backend))[0]?.revision).toBe(revisionBefore)
  })

  it('U5: legacy membership without role applies org:member role', async () => {
    const backend = createBackend()
    const accountRef = await seedUpdatedObservationFixture(backend, { omitRole: true })
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u5', role: 'org:member' })

    expect(await recordOrganizationMembershipUpdatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    const [membership] = await listMembershipRows(backend, accountRef)
    expect(membership?.role).toBe('org:member')
  })

  it('U6: unknown clerkOrgId or inactive binding or inactive account is ignored', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend)

    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      clerkOrgId: 'org_unknown_updated_membership',
      deliveryRef: 'delivery-u6-unknown',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: 'Suspended workspace',
      lifecycle: 'suspended',
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: OTHER_CLERK_ORG_ID,
    })
    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      clerkOrgId: OTHER_CLERK_ORG_ID,
      deliveryRef: 'delivery-u6-inactive-account',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: SECOND_ORG_ACCOUNT_REF,
      ownershipRef: SECOND_ORG_OWNERSHIP_REF,
      displayName: 'Revoked binding workspace',
    })
    await insertOrgBinding(backend, {
      bindingRef: SECOND_ORG_BINDING_REF,
      accountRef: SECOND_ORG_ACCOUNT_REF,
      providerIdentifier: 'org_revoked_binding_only',
      lifecycle: 'revoked',
    })
    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      clerkOrgId: 'org_revoked_binding_only',
      deliveryRef: 'delivery-u6-inactive-binding',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(0)
  })

  it('U7: ambiguous org bindings refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
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
    await insertActiveMembershipRow(backend, { accountRef: ORG_ACCOUNT_REF })

    await expectRecordRefusal(
      () => recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
        deliveryRef: 'delivery-u7',
      })),
      'authority_conflict',
    )
  })

  it('U8: forged HMAC or created-scope token on updated command refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend)
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u8' })

    const wrongScopeAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_UPDATED_OPERATION,
      scope: RECORD_SCOPE,
      command,
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationMembershipUpdatedForServer(backend, command, wrongScopeAuth),
      'authority_conflict',
    )

    const forgedAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_UPDATED_OPERATION,
      scope: RECORD_UPDATED_SCOPE,
      command: { ...command, role: 'org:member' },
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationMembershipUpdatedForServer(backend, command, forgedAuth),
      'authority_conflict',
    )
  })

  it('U9: missing identity binding refuses then applies after bind', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    await insertActiveMembershipRow(backend, { accountRef })
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u9' })

    await expectRecordRefusal(
      () => recordOrganizationMembershipUpdatedForServer(backend, command),
      'identity_binding_missing',
    )
    await seedInviteePrincipalWithBinding(backend)
    expect(await recordOrganizationMembershipUpdatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
  })

  it('U10: workspace owner providerIdentifier is ignored even with stray owner membership row', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)
    await insertActiveMembershipRow(backend, {
      accountRef,
      memberPrincipalRef: PRINCIPAL_OWNER_REF,
      membershipRef: `mem_${'b'.repeat(32)}`,
      role: 'org:member',
    })

    const result = await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u10',
      providerIdentifier: OWNER_PROVIDER_IDENTIFIER,
      role: 'org:admin',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(0)
  })

  it('U11: no active membership or ended-only membership is ignored without insert', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)
    const beforeCount = (await listMembershipRows(backend, accountRef)).length

    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u11-none',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertActiveMembershipRow(backend, {
      accountRef,
      lifecycle: 'ended',
      membershipRef: ENDED_MEMBERSHIP_REF,
    })
    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u11-ended',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    expect(await listMembershipRows(backend, accountRef)).toHaveLength(beforeCount + 1)
    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(0)
  })

  it('U12: non-human principal or inactive user binding is ignored', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    await insertHumanPrincipal(backend, {
      principalRef: AGENT_PRINCIPAL_REF,
      displayName: 'Agent member',
      kind: 'agent',
    })
    await insertUserIdentityBinding(backend, {
      bindingRef: AGENT_BINDING_REF,
      principalRef: AGENT_PRINCIPAL_REF,
      providerIdentifier: 'https://clerk.example.test|user_agent_updated',
    })
    await insertActiveMembershipRow(backend, {
      accountRef,
      memberPrincipalRef: AGENT_PRINCIPAL_REF,
      membershipRef: `mem_${'a'.repeat(32)}`,
    })

    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u12-agent',
      providerIdentifier: 'https://clerk.example.test|user_agent_updated',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await seedInviteePrincipalWithBinding(backend, { bindingLifecycle: 'revoked' })
    await insertActiveMembershipRow(backend, { accountRef })
    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u12-revoked-binding',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })
  })

  it('U13: updated audit redactedPayload keys are bounded and contain no sensitive material', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend)
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u13', role: 'org:admin' })
    await recordOrganizationMembershipUpdatedForServer(backend, command)

    const [audit] = await listMembershipUpdatedAuditEvents(backend)
    expect(audit).toBeDefined()
    const payload = parseRedactedPayload(audit!)
    expect(Object.keys(payload).sort()).toEqual([
      'clerkOrgId',
      'memberPrincipalRef',
      'membershipRefHash',
      'role',
    ])
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('orgmem_')
    expect(serialized).not.toContain('user_')
    expect(serialized).not.toContain('http')
  })

  it('U14: updated audit beforeState reflects prior role and outcome reflects command role', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend, { role: 'org:member' })
    const command = updatedMembershipCommand({ deliveryRef: 'delivery-u14', role: 'org:admin' })
    await recordOrganizationMembershipUpdatedForServer(backend, command)

    const [audit] = await listMembershipUpdatedAuditEvents(backend)
    expect(audit?.beforeState).toBe('org:member')
    expect(audit?.outcome).toBe('org:admin')

    const backendLegacy = createBackend()
    await seedUpdatedObservationFixture(backendLegacy, { omitRole: true })
    await recordOrganizationMembershipUpdatedForServer(backendLegacy, updatedMembershipCommand({
      deliveryRef: 'delivery-u14-legacy',
      role: 'org:member',
    }))
    const [legacyAudit] = await listMembershipUpdatedAuditEvents(backendLegacy)
    expect(legacyAudit?.beforeState).toBe('unspecified')
    expect(legacyAudit?.outcome).toBe('org:member')
  })

  it('U15: org A update never writes membership or audit on org B', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
    const accountRefA = await provisionBoundOrgWorkspace(backend, CLERK_ORG_ID, 'Workspace A')
    const accountRefB = await provisionBoundOrgWorkspace(backend, OTHER_CLERK_ORG_ID, 'Workspace B')
    await insertActiveMembershipRow(backend, { accountRef: accountRefA })

    await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      clerkOrgId: CLERK_ORG_ID,
      deliveryRef: 'delivery-u15',
    }))

    expect((await listMembershipRows(backend, accountRefB))[0]?.role).toBeUndefined()
    const audits = await listMembershipUpdatedAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRefA)
  })

  it('U16: accountOwnerships and account revision are untouched', async () => {
    const backend = createBackend()
    const accountRef = await seedUpdatedObservationFixture(backend)
    const revisionBefore = await readAccountRevision(backend, accountRef)
    const ownershipsBefore = await countTable(backend, 'accountOwnerships')

    await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u16',
    }))

    expect(await readAccountRevision(backend, accountRef)).toBe(revisionBefore)
    expect(await countTable(backend, 'accountOwnerships')).toBe(ownershipsBefore)
  })

  it('U17: promote then demote applies twice with revision +2 and two updated audits', async () => {
    const backend = createBackend()
    await seedUpdatedObservationFixture(backend, { role: 'org:member', revision: 1 })

    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u17-promote',
      role: 'org:admin',
    }))).toEqual({ kind: 'accepted', status: 'applied' })
    expect(await recordOrganizationMembershipUpdatedForServer(backend, updatedMembershipCommand({
      deliveryRef: 'delivery-u17-demote',
      role: 'org:member',
    }))).toEqual({ kind: 'accepted', status: 'applied' })

    const [membership] = await listMembershipRows(backend)
    expect(membership?.role).toBe('org:member')
    expect(membership?.revision).toBe(3)
    expect(await listMembershipUpdatedAuditEvents(backend)).toHaveLength(2)
  })
})

describe('workspaceMemberships recordOrganizationMembershipDeletedForServer (W-19)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-membership-deleted-test-key-32'

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

  async function seedDeletedObservationFixture(
    backend: InteractiveAuthorityBackend,
    membershipInput: Readonly<{
      role?: 'org:admin' | 'org:member'
      revision?: number
    }> = {},
  ): Promise<string> {
    const accountRef = await seedMembershipObservationFixture(backend)
    await insertActiveMembershipRow(backend, {
      accountRef,
      role: membershipInput.role ?? 'org:member',
      ...(membershipInput.revision !== undefined ? { revision: membershipInput.revision } : {}),
    })
    return accountRef
  }

  it('D1: active membership ends with clerk actor audit and revision bump', async () => {
    const backend = createBackend()
    const accountRef = await seedDeletedObservationFixture(backend)
    const command = deletedMembershipCommand({ deliveryRef: 'delivery-d1', observedAt: NOW + 200 })

    const result = await recordOrganizationMembershipDeletedForServer(backend, command)
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })

    const [membership] = await listMembershipRows(backend, accountRef)
    expect(membership).toMatchObject({
      lifecycle: 'ended',
      endedAt: command.observedAt,
      revision: 2,
    })
    expect(membership?.endedBy?.actorPrincipalRef).toBe(CLERK_ORG_MEMBERSHIP_ACTOR_REF)

    const audits = await listMembershipDeletedAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRef)
    expect(audits[0]?.eventType).toBe('account.workspace_membership.deleted')

    const notices = await backend.run((ctx) => ctx.db.query('notificationDeliveries').collect())
    expect(notices.filter((row) => row.eventKind === 'team_membership_changed')).toEqual([
      expect.objectContaining({ state: 'suppressed', accountRef }),
    ])
  })

  it('D1b: removed member loses their agent and credentials while another member agent stays active', async () => {
    const backend = createBackend()
    const accountRef = await seedDeletedObservationFixture(backend)
    const agentRow = (principalId: string, ownerTokenIdentifier: string) => ({
      principalId, ownerId: accountRef, ownerTokenIdentifier, credentialId: `key_${principalId}`,
      applicationRef: 'agentic-economy', environment: 'sandbox' as const, scopes: ['market_tools:call'],
      authorityMode: 'read_only' as const, grantGeneration: 1, spendingPolicyDigest: 'sha256:x',
      lifecycle: 'active' as const, expiresAt: NOW + 100_000, recordedAt: NOW, lastSeenAt: NOW,
    })
    const credentialRow = (principalRef: string) => ({
      bindingRef: `eib_${principalRef}`, credentialRef: `crd_${principalRef}`, principalRef, type: 'api_key' as const,
      lifecycle: 'active' as const, generation: 1, issueIdempotencyRef: `issue:${principalRef}`, revision: 1,
      issuedAt: NOW, expiresAt: NOW + 100_000, updatedAt: NOW,
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessPrincipals', agentRow(REMOVED_AGENT_REF, INVITEE_PROVIDER_IDENTIFIER) as never)
      await ctx.db.insert('agentAccessPrincipals', agentRow(OTHER_AGENT_REF, OWNER_PROVIDER_IDENTIFIER) as never)
      await ctx.db.insert('credentials', credentialRow(REMOVED_AGENT_REF) as never)
      await ctx.db.insert('credentials', credentialRow(OTHER_AGENT_REF) as never)
    })

    const result = await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({ deliveryRef: 'delivery-d1b' }))
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })

    const state = await backend.run(async (ctx) => ({
      agents: await ctx.db.query('agentAccessPrincipals').collect(),
      credentials: await ctx.db.query('credentials').collect(),
    }))
    const lifecycleOf = (rows: ReadonlyArray<{ lifecycle: string }>, key: string, value: string) =>
      rows.find((row) => (row as Record<string, unknown>)[key] === value)?.lifecycle
    expect(lifecycleOf(state.agents, 'principalId', REMOVED_AGENT_REF)).toBe('revoked')
    expect(lifecycleOf(state.credentials, 'principalRef', REMOVED_AGENT_REF)).toBe('revoked')
    expect(lifecycleOf(state.agents, 'principalId', OTHER_AGENT_REF)).toBe('active')
    expect(lifecycleOf(state.credentials, 'principalRef', OTHER_AGENT_REF)).toBe('active')
  })

  it('D2: same deliveryRefHash replay returns replayed with one ended row and one audit', async () => {
    const backend = createBackend()
    const accountRef = await seedDeletedObservationFixture(backend)
    const command = deletedMembershipCommand({ deliveryRef: 'delivery-d2' })

    expect(await recordOrganizationMembershipDeletedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    expect(await recordOrganizationMembershipDeletedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })

    expect((await listMembershipRows(backend, accountRef)).filter((row) => row.lifecycle === 'ended')).toHaveLength(1)
    expect(await listMembershipDeletedAuditEvents(backend)).toHaveLength(1)
  })

  it('D3: same deliveryRefHash with conflicting digest refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedDeletedObservationFixture(backend)
    const command = deletedMembershipCommand({ deliveryRef: 'delivery-d3' })
    expect(await recordOrganizationMembershipDeletedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })

    await expectRecordRefusal(
      () => recordOrganizationMembershipDeletedForServer(backend, {
        ...command,
        role: 'org:admin',
      }),
      'authority_conflict',
    )
    expect(await listMembershipDeletedAuditEvents(backend)).toHaveLength(1)
  })

  it('D4: unknown org inactive binding or inactive account is ignored', async () => {
    const backend = createBackend()
    await seedDeletedObservationFixture(backend)

    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      clerkOrgId: 'org_unknown_deleted_membership',
      deliveryRef: 'delivery-d4-unknown',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: 'Suspended workspace',
      lifecycle: 'suspended',
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: OTHER_CLERK_ORG_ID,
    })
    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      clerkOrgId: OTHER_CLERK_ORG_ID,
      deliveryRef: 'delivery-d4-inactive-account',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: SECOND_ORG_ACCOUNT_REF,
      ownershipRef: SECOND_ORG_OWNERSHIP_REF,
      displayName: 'Revoked binding workspace',
    })
    await insertOrgBinding(backend, {
      bindingRef: SECOND_ORG_BINDING_REF,
      accountRef: SECOND_ORG_ACCOUNT_REF,
      providerIdentifier: 'org_revoked_binding_deleted',
      lifecycle: 'revoked',
    })
    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      clerkOrgId: 'org_revoked_binding_deleted',
      deliveryRef: 'delivery-d4-inactive-binding',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    expect(await listMembershipDeletedAuditEvents(backend)).toHaveLength(0)
  })

  it('D5: ambiguous org bindings refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
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
    await insertActiveMembershipRow(backend, { accountRef: ORG_ACCOUNT_REF })

    await expectRecordRefusal(
      () => recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
        deliveryRef: 'delivery-d5',
      })),
      'authority_conflict',
    )
  })

  it('D6: created-scope or updated-scope HMAC on deleted command refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedDeletedObservationFixture(backend)
    const command = deletedMembershipCommand({ deliveryRef: 'delivery-d6' })

    const createdScopeAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_DELETED_OPERATION,
      scope: RECORD_SCOPE,
      command,
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationMembershipDeletedForServer(backend, command, createdScopeAuth),
      'authority_conflict',
    )

    const updatedScopeAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_DELETED_OPERATION,
      scope: RECORD_UPDATED_SCOPE,
      command,
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationMembershipDeletedForServer(backend, command, updatedScopeAuth),
      'authority_conflict',
    )
  })

  it('D7: missing identity binding refuses then applies after bind', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    await insertActiveMembershipRow(backend, { accountRef })
    const command = deletedMembershipCommand({ deliveryRef: 'delivery-d7' })

    await expectRecordRefusal(
      () => recordOrganizationMembershipDeletedForServer(backend, command),
      'identity_binding_missing',
    )
    await seedInviteePrincipalWithBinding(backend)
    expect(await recordOrganizationMembershipDeletedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
  })

  it('D8: workspace owner providerIdentifier is ignored', async () => {
    const backend = createBackend()
    await seedMembershipObservationFixture(backend)

    const result = await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d8',
      providerIdentifier: OWNER_PROVIDER_IDENTIFIER,
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'ignored' })
    expect(await listMembershipDeletedAuditEvents(backend)).toHaveLength(0)
  })

  it('D9: no active membership or already ended membership is ignored without new audit', async () => {
    const backend = createBackend()
    const accountRef = await seedMembershipObservationFixture(backend)

    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d9-none',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertActiveMembershipRow(backend, {
      accountRef,
      lifecycle: 'ended',
      membershipRef: ENDED_MEMBERSHIP_REF,
    })
    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d9-ended',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    expect(await listMembershipDeletedAuditEvents(backend)).toHaveLength(0)
  })

  it('D10: non-human principal or inactive user binding is ignored', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    await insertHumanPrincipal(backend, {
      principalRef: AGENT_PRINCIPAL_REF,
      displayName: 'Agent member',
      kind: 'agent',
    })
    await insertUserIdentityBinding(backend, {
      bindingRef: AGENT_BINDING_REF,
      principalRef: AGENT_PRINCIPAL_REF,
      providerIdentifier: 'https://clerk.example.test|user_agent_deleted',
    })
    await insertActiveMembershipRow(backend, {
      accountRef,
      memberPrincipalRef: AGENT_PRINCIPAL_REF,
      membershipRef: `mem_${'d'.repeat(32)}`,
    })

    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d10-agent',
      providerIdentifier: 'https://clerk.example.test|user_agent_deleted',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await seedInviteePrincipalWithBinding(backend, { bindingLifecycle: 'revoked' })
    await insertActiveMembershipRow(backend, { accountRef })
    expect(await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d10-revoked-binding',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })
  })

  it('D11: deleted audit payload keys are bounded with beforeState role and ended outcome', async () => {
    const backend = createBackend()
    await seedDeletedObservationFixture(backend, { role: 'org:member' })
    const command = deletedMembershipCommand({ deliveryRef: 'delivery-d11' })
    await recordOrganizationMembershipDeletedForServer(backend, command)

    const [audit] = await listMembershipDeletedAuditEvents(backend)
    expect(audit).toBeDefined()
    const payload = parseRedactedPayload(audit!)
    expect(Object.keys(payload).sort()).toEqual([
      'clerkOrgId',
      'memberPrincipalRef',
      'membershipRefHash',
      'role',
    ])
    expect(audit?.beforeState).toBe('org:member')
    expect(audit?.outcome).toBe('ended')
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('orgmem_')
    expect(serialized).not.toContain('user_')
    expect(serialized).not.toContain('http')
  })

  it('D12: org A delete never writes membership or audit on org B', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedInviteePrincipalWithBinding(backend)
    const accountRefA = await provisionBoundOrgWorkspace(backend, CLERK_ORG_ID, 'Workspace A')
    const accountRefB = await provisionBoundOrgWorkspace(backend, OTHER_CLERK_ORG_ID, 'Workspace B')
    await insertActiveMembershipRow(backend, { accountRef: accountRefA })

    await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      clerkOrgId: CLERK_ORG_ID,
      deliveryRef: 'delivery-d12',
    }))

    expect((await listMembershipRows(backend, accountRefB))[0]?.lifecycle).not.toBe('ended')
    const audits = await listMembershipDeletedAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRefA)
  })

  it('D15: accountOwnerships count and accounts revision are unchanged', async () => {
    const backend = createBackend()
    const accountRef = await seedDeletedObservationFixture(backend)
    const revisionBefore = await readAccountRevision(backend, accountRef)
    const ownershipsBefore = await countTable(backend, 'accountOwnerships')

    await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d15',
    }))

    expect(await readAccountRevision(backend, accountRef)).toBe(revisionBefore)
    expect(await countTable(backend, 'accountOwnerships')).toBe(ownershipsBefore)
  })

  it('D16: after apply requireAccessFactForAccount throws account_access_missing', async () => {
    const backend = createBackend()
    const accountRef = await seedDeletedObservationFixture(backend)
    await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d16',
    }))

    await expect(backend.run(async (ctx) =>
      requireAccessFactForAccount(ctx.db, INVITEE_PRINCIPAL_REF as any, accountRef as any)))
      .rejects.toEqual(new InteractiveAuthorityError('account_access_missing'))
  })

  it('D17: listDirectory omits ended member', async () => {
    const backend = createBackend()
    await seedDeletedObservationFixture(backend)
    const before = await listDirectoryForOwner(backend)
    expect(before.members.some((member) => member.principalRef === INVITEE_PRINCIPAL_REF)).toBe(true)

    await recordOrganizationMembershipDeletedForServer(backend, deletedMembershipCommand({
      deliveryRef: 'delivery-d17',
    }))

    const after = await listDirectoryForOwner(backend)
    expect(after.members.some((member) => member.principalRef === INVITEE_PRINCIPAL_REF)).toBe(false)
  })
})
