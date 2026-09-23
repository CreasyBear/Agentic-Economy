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
import {
  ORGANIZATION_INVITATION_CREATED_OPERATION,
  ORGANIZATION_INVITATION_CREATED_SCOPE,
} from '@/modules/workspace-invitation/organization-invitation-observation'
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

const RECORD_OPERATION = ORGANIZATION_INVITATION_CREATED_OPERATION
const RECORD_SCOPE = ORGANIZATION_INVITATION_CREATED_SCOPE
const RECORD_REVOKED_OPERATION = 'workspaceInvitations.recordOrganizationInvitationRevokedForServer'
const RECORD_REVOKED_SCOPE = 'workspace:record_organization_invitation_revoked'

const CLERK_ORG_ID = 'org_test_workspace_invitation'
const OTHER_CLERK_ORG_ID = 'org_test_workspace_invitation_other'
const INITIAL_WORKSPACE_NAME = 'Acme Invitation Lab'

const ORG_ACCOUNT_REF = `acc_${'i'.repeat(32)}`
const ORG_OWNERSHIP_REF = `own_${'i'.repeat(32)}`
const ORG_BINDING_REF = `aob_${'i'.repeat(32)}`
const SECOND_ORG_BINDING_REF = `aob_${'j'.repeat(32)}`
const SECOND_ORG_ACCOUNT_REF = `acc_${'j'.repeat(32)}`
const SECOND_ORG_OWNERSHIP_REF = `own_${'j'.repeat(32)}`

const INVITATION_ID = 'orginv_test_workspace_invitation_alpha'
const INVITEE_EMAIL = 'teammate@example.test'

type OrganizationInvitationCreatedCommand = Readonly<{
  clerkOrgId: string
  deliveryRefHash: string
  invitationRefHash: string
  emailHash: string
  role: 'org:admin' | 'org:member'
  observedAt: number
}>

type OrganizationInvitationCreatedResult = Readonly<
  | { kind: 'accepted'; status: 'applied' | 'replayed' | 'ignored' }
  | { kind: 'refused'; code: 'authority_conflict' }
>
type OrganizationInvitationRevokedCommand = OrganizationInvitationCreatedCommand
type OrganizationInvitationRevokedResult = OrganizationInvitationCreatedResult

const recordOrganizationInvitationCreatedForServerRef = makeFunctionReference<
  'mutation',
  OrganizationInvitationCreatedCommand & Readonly<{
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  OrganizationInvitationCreatedResult
>('workspaceInvitations:recordOrganizationInvitationCreatedForServer')

const recordOrganizationInvitationRevokedForServerRef = makeFunctionReference<
  'mutation',
  OrganizationInvitationRevokedCommand & Readonly<{
    serviceAuth: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>
  }>,
  OrganizationInvitationRevokedResult
>('workspaceInvitations:recordOrganizationInvitationRevokedForServer')

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

const correlationRef = (label: string) => `test:workspace-invitation:${label}`

function deliveryRefHash(deliveryRef: string): string {
  return canonicalDigest({
    contract: 'ae.clerk-webhook-delivery:v1',
    deliveryRef,
  })
}

function invitationRefHash(invitationRef: string): string {
  return canonicalDigest({
    contract: 'ae.clerk-organization-invitation-ref:v1',
    invitationRef,
  })
}

function emailHash(emailNormalized: string): string {
  return canonicalDigest({
    contract: 'ae.workspace-invitee-email:v1',
    emailNormalized,
  })
}

function invitationCommand(
  overrides: Partial<OrganizationInvitationCreatedCommand> & { deliveryRef?: string } = {},
): OrganizationInvitationCreatedCommand {
  const deliveryRef = overrides.deliveryRef ?? 'delivery-default'
  const { deliveryRef: _deliveryRef, ...rest } = overrides
  return {
    clerkOrgId: CLERK_ORG_ID,
    deliveryRefHash: deliveryRefHash(deliveryRef),
    invitationRefHash: invitationRefHash(INVITATION_ID),
    emailHash: emailHash(INVITEE_EMAIL),
    role: 'org:member',
    observedAt: NOW + 100,
    ...rest,
  }
}

async function buildRecordServiceAuth(command: OrganizationInvitationCreatedCommand) {
  return await createConvexServerFunctionAssertion({
    operation: RECORD_OPERATION,
    scope: RECORD_SCOPE,
    command,
    now: NOW,
  })
}

async function recordOrganizationInvitationCreatedForServer(
  backend: InteractiveAuthorityBackend,
  command: OrganizationInvitationCreatedCommand,
  serviceAuth?: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>,
): Promise<OrganizationInvitationCreatedResult> {
  return await backend.mutation(recordOrganizationInvitationCreatedForServerRef, {
    ...command,
    serviceAuth: serviceAuth ?? await buildRecordServiceAuth(command),
  })
}

function revokedInvitationCommand(
  overrides: Partial<OrganizationInvitationRevokedCommand> & { deliveryRef?: string } = {},
): OrganizationInvitationRevokedCommand {
  return invitationCommand(overrides)
}

async function buildRecordRevokedServiceAuth(command: OrganizationInvitationRevokedCommand) {
  return await createConvexServerFunctionAssertion({
    operation: RECORD_REVOKED_OPERATION,
    scope: RECORD_REVOKED_SCOPE,
    command,
    now: NOW,
  })
}

async function recordOrganizationInvitationRevokedForServer(
  backend: InteractiveAuthorityBackend,
  command: OrganizationInvitationRevokedCommand,
  serviceAuth?: Awaited<ReturnType<typeof createConvexServerFunctionAssertion>>,
): Promise<OrganizationInvitationRevokedResult> {
  return await backend.mutation(recordOrganizationInvitationRevokedForServerRef, {
    ...command,
    serviceAuth: serviceAuth ?? await buildRecordRevokedServiceAuth(command),
  })
}

async function listInvitationRevokedAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('auditEvents').collect()
    return rows.filter((row) => row.eventType === 'account.workspace_invitation.revoked')
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
    serviceAuth,
  })
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
      creationActorPrincipalRef: PRINCIPAL_REF,
      creationIdempotencyRef: `account:${input.accountRef}`,
      initialOwnershipRef: input.ownershipRef,
      currentOwnershipRef: input.ownershipRef,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
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

async function listInvitationAuditEvents(backend: InteractiveAuthorityBackend) {
  return await backend.run(async (ctx) => {
    const rows = await ctx.db.query('auditEvents').collect()
    return rows.filter((row) => row.eventType === 'account.workspace_invitation.created')
  })
}

const listInvitationCreatedAuditEvents = listInvitationAuditEvents

async function countTable(
  backend: InteractiveAuthorityBackend,
  table: 'memberships' | 'accountOwnerships' | 'interactiveSessionSelections',
): Promise<number> {
  return await backend.run(async (ctx) => (await ctx.db.query(table).collect()).length)
}

async function expectRecordRefusal(
  run: () => Promise<unknown>,
  code: 'authority_conflict',
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

describe('workspaceInvitations recordOrganizationInvitationCreatedForServer (W-16)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-invitation-test-key-material-32'

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

  it('C1: bound active org with valid HMAC applies and records one invitation audit', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)

    const command = invitationCommand({ deliveryRef: 'delivery-c1' })
    const result = await recordOrganizationInvitationCreatedForServer(backend, command)

    expect(result).toEqual({ kind: 'accepted', status: 'applied' })
    const audits = await listInvitationAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRef)
    expect(audits[0]?.eventType).toBe('account.workspace_invitation.created')
  })

  it('C2: replay with same deliveryRefHash returns replayed with one audit row', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = invitationCommand({ deliveryRef: 'delivery-c2' })

    expect(await recordOrganizationInvitationCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    expect(await recordOrganizationInvitationCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(await listInvitationAuditEvents(backend)).toHaveLength(1)
  })

  it('C3: replay with same deliveryRefHash but conflicting payload refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = invitationCommand({ deliveryRef: 'delivery-c3' })
    expect(await recordOrganizationInvitationCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })

    await expectRecordRefusal(
      () => recordOrganizationInvitationCreatedForServer(backend, {
        ...command,
        role: 'org:admin',
      }),
      'authority_conflict',
    )
    expect(await listInvitationAuditEvents(backend)).toHaveLength(1)
  })

  it('C4: unknown clerkOrgId is accepted ignored with zero invitation audits', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const command = invitationCommand({
      clerkOrgId: 'org_unknown_workspace_invitation',
      deliveryRef: 'delivery-c4',
    })

    expect(await recordOrganizationInvitationCreatedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'ignored',
    })
    expect(await listInvitationAuditEvents(backend)).toHaveLength(0)
  })

  it('C5: inactive binding or inactive account is accepted ignored with zero invitation audits', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
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

    const inactiveAccountCommand = invitationCommand({ deliveryRef: 'delivery-c5-account' })
    expect(await recordOrganizationInvitationCreatedForServer(backend, inactiveAccountCommand)).toEqual({
      kind: 'accepted',
      status: 'ignored',
    })

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

    const inactiveBindingCommand = invitationCommand({
      clerkOrgId: OTHER_CLERK_ORG_ID,
      deliveryRef: 'delivery-c5-binding',
    })
    expect(await recordOrganizationInvitationCreatedForServer(backend, inactiveBindingCommand)).toEqual({
      kind: 'accepted',
      status: 'ignored',
    })
    expect(await listInvitationAuditEvents(backend)).toHaveLength(0)
  })

  it('C6: multiple active bindings for one clerk org refuses authority_conflict', async () => {
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

    await expectRecordRefusal(
      () => recordOrganizationInvitationCreatedForServer(backend, invitationCommand({ deliveryRef: 'delivery-c6' })),
      'authority_conflict',
    )
    expect(await listInvitationAuditEvents(backend)).toHaveLength(0)
  })

  it('C7: invalid or forged HMAC refuses authority_conflict with zero invitation audits', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = invitationCommand({ deliveryRef: 'delivery-c7' })

    const wrongScopeAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_OPERATION,
      scope: 'workspace:provision_organization',
      command,
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationInvitationCreatedForServer(backend, command, wrongScopeAuth),
      'authority_conflict',
    )

    const forgedAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_OPERATION,
      scope: RECORD_SCOPE,
      command: { ...command, role: 'org:admin' },
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationInvitationCreatedForServer(backend, command, forgedAuth),
      'authority_conflict',
    )
    expect(await listInvitationAuditEvents(backend)).toHaveLength(0)
  })

  it('C8: audit redactedPayload contains only clerkOrgId, invitationRefHash, emailHash, role', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const command = invitationCommand({ deliveryRef: 'delivery-c8' })
    await provisionBoundOrgWorkspace(backend)
    await recordOrganizationInvitationCreatedForServer(backend, command)

    const [audit] = await listInvitationAuditEvents(backend)
    expect(audit).toBeDefined()
    const payload = parseRedactedPayload(audit!)
    expect(Object.keys(payload).sort()).toEqual([
      'clerkOrgId',
      'emailHash',
      'invitationRefHash',
      'role',
    ])
    expect(payload).toMatchObject({
      clerkOrgId: CLERK_ORG_ID,
      invitationRefHash: command.invitationRefHash,
      emailHash: command.emailHash,
      role: 'org:member',
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain(INVITEE_EMAIL)
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('http')
  })

  it('C9: memberships, accountOwnerships, and interactiveSessionSelections are untouched', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)

    const membershipsBefore = await countTable(backend, 'memberships')
    const ownershipsBefore = await countTable(backend, 'accountOwnerships')
    const selectionsBefore = await countTable(backend, 'interactiveSessionSelections')

    await recordOrganizationInvitationCreatedForServer(backend, invitationCommand({ deliveryRef: 'delivery-c9' }))

    expect(await countTable(backend, 'memberships')).toBe(membershipsBefore)
    expect(await countTable(backend, 'accountOwnerships')).toBe(ownershipsBefore)
    expect(await countTable(backend, 'interactiveSessionSelections')).toBe(selectionsBefore)
  })

  it('C10: invitation for org A never touches org B account audits', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRefA = await provisionBoundOrgWorkspace(backend, CLERK_ORG_ID, 'Workspace A')
    const accountRefB = await provisionBoundOrgWorkspace(backend, OTHER_CLERK_ORG_ID, 'Workspace B')

    await recordOrganizationInvitationCreatedForServer(backend, invitationCommand({
      clerkOrgId: CLERK_ORG_ID,
      deliveryRef: 'delivery-c10-a',
    }))

    const audits = await listInvitationAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRefA)
    expect(audits[0]?.activeAccountRef).not.toBe(accountRefB)
    expect(audits.every((row) => row.activeAccountRef !== accountRefB)).toBe(true)
  })
})

describe('workspaceInvitations recordOrganizationInvitationRevokedForServer (W-19)', () => {
  const previousServiceKey = process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN
  const SERVICE_KEY = 'workspace-invitation-revoked-test-key-32'

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

  it('R1: revoked observation applies one audit with pending beforeState and revoked outcome', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRef = await provisionBoundOrgWorkspace(backend)
    const command = revokedInvitationCommand({ deliveryRef: 'delivery-r1' })

    const result = await recordOrganizationInvitationRevokedForServer(backend, command)
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })

    const audits = await listInvitationRevokedAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      activeAccountRef: accountRef,
      eventType: 'account.workspace_invitation.revoked',
      beforeState: 'pending',
      outcome: 'revoked',
    })
  })

  it('R2: same delivery replay returns replayed with one audit row', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = revokedInvitationCommand({ deliveryRef: 'delivery-r2' })

    expect(await recordOrganizationInvitationRevokedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })
    expect(await recordOrganizationInvitationRevokedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'replayed',
    })
    expect(await listInvitationRevokedAuditEvents(backend)).toHaveLength(1)
  })

  it('R3: same delivery with conflicting payload refuses authority_conflict', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)
    const command = revokedInvitationCommand({ deliveryRef: 'delivery-r3' })
    expect(await recordOrganizationInvitationRevokedForServer(backend, command)).toEqual({
      kind: 'accepted',
      status: 'applied',
    })

    await expectRecordRefusal(
      () => recordOrganizationInvitationRevokedForServer(backend, {
        ...command,
        role: 'org:admin',
      }),
      'authority_conflict',
    )
    expect(await listInvitationRevokedAuditEvents(backend)).toHaveLength(1)
  })

  it('R4: unknown org inactive binding or inactive account is ignored', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)

    expect(await recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
      clerkOrgId: 'org_unknown_revoked_invitation',
      deliveryRef: 'delivery-r4-unknown',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: ORG_ACCOUNT_REF,
      ownershipRef: ORG_OWNERSHIP_REF,
      displayName: INITIAL_WORKSPACE_NAME,
      lifecycle: 'suspended',
    })
    await insertOrgBinding(backend, {
      bindingRef: ORG_BINDING_REF,
      accountRef: ORG_ACCOUNT_REF,
      providerIdentifier: OTHER_CLERK_ORG_ID,
    })
    expect(await recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
      clerkOrgId: OTHER_CLERK_ORG_ID,
      deliveryRef: 'delivery-r4-inactive-account',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    await insertOrgAccountWithOwnership(backend, {
      accountRef: SECOND_ORG_ACCOUNT_REF,
      ownershipRef: SECOND_ORG_OWNERSHIP_REF,
      displayName: 'Active workspace',
    })
    await insertOrgBinding(backend, {
      bindingRef: SECOND_ORG_BINDING_REF,
      accountRef: SECOND_ORG_ACCOUNT_REF,
      providerIdentifier: 'org_revoked_binding_revoked_invite',
      lifecycle: 'revoked',
    })
    expect(await recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
      clerkOrgId: 'org_revoked_binding_revoked_invite',
      deliveryRef: 'delivery-r4-inactive-binding',
    }))).toEqual({ kind: 'accepted', status: 'ignored' })

    expect(await listInvitationRevokedAuditEvents(backend)).toHaveLength(0)
  })

  it('R5: ambiguous bindings or forged HMAC refuses authority_conflict', async () => {
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

    await expectRecordRefusal(
      () => recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
        deliveryRef: 'delivery-r5-ambiguous',
      })),
      'authority_conflict',
    )

    const forgedBackend = createBackend()
    await seedAuthority(forgedBackend)
    await provisionBoundOrgWorkspace(forgedBackend)
    const command = revokedInvitationCommand({ deliveryRef: 'delivery-r5-forged' })
    const forgedAuth = await createConvexServerFunctionAssertion({
      operation: RECORD_REVOKED_OPERATION,
      scope: RECORD_SCOPE,
      command,
      now: NOW,
    })
    await expectRecordRefusal(
      () => recordOrganizationInvitationRevokedForServer(forgedBackend, command, forgedAuth),
      'authority_conflict',
    )
  })

  it('R6: revoked audit redactedPayload keys are bounded with no sensitive material', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const command = revokedInvitationCommand({ deliveryRef: 'delivery-r6' })
    await provisionBoundOrgWorkspace(backend)
    await recordOrganizationInvitationRevokedForServer(backend, command)

    const [audit] = await listInvitationRevokedAuditEvents(backend)
    expect(audit).toBeDefined()
    const payload = parseRedactedPayload(audit!)
    expect(Object.keys(payload).sort()).toEqual([
      'clerkOrgId',
      'emailHash',
      'invitationRefHash',
      'role',
    ])
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('@')
    expect(serialized).not.toContain('orginv_')
    expect(serialized).not.toContain('http')
    expect(serialized).not.toContain('token')
  })

  it('R7: memberships accountOwnerships and interactiveSessionSelections are untouched', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)

    const membershipsBefore = await countTable(backend, 'memberships')
    const ownershipsBefore = await countTable(backend, 'accountOwnerships')
    const selectionsBefore = await countTable(backend, 'interactiveSessionSelections')

    await recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
      deliveryRef: 'delivery-r7',
    }))

    expect(await countTable(backend, 'memberships')).toBe(membershipsBefore)
    expect(await countTable(backend, 'accountOwnerships')).toBe(ownershipsBefore)
    expect(await countTable(backend, 'interactiveSessionSelections')).toBe(selectionsBefore)
  })

  it('R8: org A revoke never writes org B audits', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    const accountRefA = await provisionBoundOrgWorkspace(backend, CLERK_ORG_ID, 'Workspace A')
    const accountRefB = await provisionBoundOrgWorkspace(backend, OTHER_CLERK_ORG_ID, 'Workspace B')

    await recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
      clerkOrgId: CLERK_ORG_ID,
      deliveryRef: 'delivery-r8-a',
    }))

    const audits = await listInvitationRevokedAuditEvents(backend)
    expect(audits).toHaveLength(1)
    expect(audits[0]?.activeAccountRef).toBe(accountRefA)
    expect(audits.every((row) => row.activeAccountRef !== accountRefB)).toBe(true)
  })

  it('R9: revoke without prior created audit still applies', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await provisionBoundOrgWorkspace(backend)

    const result = await recordOrganizationInvitationRevokedForServer(backend, revokedInvitationCommand({
      deliveryRef: 'delivery-r9',
    }))
    expect(result).toEqual({ kind: 'accepted', status: 'applied' })
    expect(await listInvitationCreatedAuditEvents(backend)).toHaveLength(0)
    expect(await listInvitationRevokedAuditEvents(backend)).toHaveLength(1)
  })
})
