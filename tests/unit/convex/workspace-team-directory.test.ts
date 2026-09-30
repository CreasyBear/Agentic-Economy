import { makeFunctionReference, type UserIdentity } from 'convex/server'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  collectAuthorityTables,
  createInteractiveAuthorityBackend as createBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_MEMBERSHIP_REF as MEMBERSHIP_REF,
  INTERACTIVE_OWNERSHIP_REF as OWNERSHIP_REF,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const ACCOUNT_B = `acc_${'b'.repeat(32)}`
const OWNERSHIP_B = `own_${'b'.repeat(32)}`
const MEMBER_PRINCIPAL = `prn_${'a'.repeat(32)}`
const MEMBER_MEMBERSHIP = `mem_${'a'.repeat(32)}`
const FOREIGN_MEMBERSHIP = `mem_${'f'.repeat(32)}`
const SECOND_OWNERSHIP = `own_${'d'.repeat(32)}`
const ENDED_OWNERSHIP = `own_${'e'.repeat(32)}`
const AGENT_PRINCIPAL = `prn_${'g'.repeat(32)}`
const WORKLOAD_PRINCIPAL = `prn_${'w'.repeat(32)}`

type DirectoryOwner = Readonly<{
  kind: 'owner'
  principalRef: string
  displayName: string
  email: string | null
  ownershipRef: string
  joinedAt: number
}>

type DirectoryMember = Readonly<{
  kind: 'member'
  principalRef: string
  displayName: string
  email: string | null
  membershipRef: string
  role: 'member' | 'admin'
  lifecycle: 'active'
  joinedAt: number
}>

type DirectoryView = Readonly<{
  accountRef: string
  owner: DirectoryOwner
  members: DirectoryMember[]
}>

const listDirectoryRef = makeFunctionReference<
  'query',
  Record<string, never>,
  DirectoryView
>('workspaceTeam:listDirectory')

type RunCtx = Parameters<Parameters<InteractiveAuthorityBackend['run']>[0]>[0]

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

async function expectDirectoryRefusal(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  await expect(run()).rejects.toMatchObject({
    name: 'InteractiveAuthorityError',
    code,
  })
}

async function listDirectory(
  backend: InteractiveAuthorityBackend,
  presentedIdentity: UserIdentity = identity(),
): Promise<DirectoryView> {
  const session = backend.withIdentity(presentedIdentity)
  return await session.query(listDirectoryRef, {})
}


async function insertAccountBWithOwnership(
  backend: InteractiveAuthorityBackend,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accounts', {
      accountRef: ACCOUNT_B,
      displayName: 'Workspace B',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: MEMBER_PRINCIPAL,
      creationIdempotencyRef: `account:${ACCOUNT_B}`,
      initialOwnershipRef: OWNERSHIP_B,
      currentOwnershipRef: OWNERSHIP_B,
      revision: 1,
      createdAt: NOW - 1,
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

async function insertHumanPrincipal(
  ctx: RunCtx,
  input: Readonly<{
    principalRef: string
    displayName: string
    kind?: 'human' | 'agent' | 'workload'
    lifecycle?: 'active' | 'suspended'
    createdAt?: number
  }>,
): Promise<void> {
  await ctx.db.insert('principals', {
    principalRef: input.principalRef,
    kind: input.kind ?? 'human',
    displayName: input.displayName,
    lifecycle: input.lifecycle ?? 'active',
    revision: 1,
    createdAt: input.createdAt ?? NOW,
    updatedAt: NOW,
  })
}

async function insertMembership(
  ctx: RunCtx,
  input: Readonly<{
    membershipRef: string
    accountRef: string
    memberPrincipalRef: string
    lifecycle?: 'active' | 'ended'
    createdAt?: number
    role?: 'org:admin' | 'org:member'
  }>,
): Promise<void> {
  await ctx.db.insert('memberships', {
    membershipRef: input.membershipRef,
    accountRef: input.accountRef,
    memberPrincipalRef: input.memberPrincipalRef,
    lifecycle: input.lifecycle ?? 'active',
    revision: 1,
    createdAt: input.createdAt ?? NOW,
    createdBy: {
      actorPrincipalRef: PRINCIPAL_REF,
      activeAccountRef: input.accountRef,
      correlationRef: `membership:${input.membershipRef}`,
      idempotencyRef: `membership:${input.membershipRef}`,
    },
    ...(input.role !== undefined ? { role: input.role } : {}),
  })
}

async function seedHumanMember(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    principalRef: string
    membershipRef: string
    displayName: string
    accountRef?: string
    lifecycle?: 'active' | 'ended'
    principalLifecycle?: 'active' | 'suspended'
    principalKind?: 'human' | 'agent' | 'workload'
    createdAt?: number
    membershipRole?: 'org:admin' | 'org:member'
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await insertHumanPrincipal(ctx, {
      principalRef: input.principalRef,
      displayName: input.displayName,
      ...(input.principalKind !== undefined ? { kind: input.principalKind } : {}),
      ...(input.principalLifecycle !== undefined ? { lifecycle: input.principalLifecycle } : {}),
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
    })
    await insertMembership(ctx, {
      membershipRef: input.membershipRef,
      accountRef: input.accountRef ?? ACCOUNT_REF,
      memberPrincipalRef: input.principalRef,
      ...(input.lifecycle !== undefined ? { lifecycle: input.lifecycle } : {}),
      ...(input.createdAt !== undefined ? { createdAt: input.createdAt } : {}),
      ...(input.membershipRole !== undefined ? { role: input.membershipRole } : {}),
    })
  })
}

async function seedNotificationEmail(
  backend: InteractiveAuthorityBackend,
  principalRef: string,
  email: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('principalNotificationEmails', {
      principalRef,
      email,
      revision: 1,
      observedAt: NOW,
      sourceRef: 'test:team-directory',
    })
  })
}

describe('workspaceTeam:listDirectory (W-15)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Q1: unauthenticated throws identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    await expectDirectoryRefusal(
      () => backend.query(listDirectoryRef, {}),
      'identity_invalid',
    )
  })

  it('Q2: binding missing throws identity_invalid', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { omit: 'binding' })

    await expectDirectoryRefusal(
      () => listDirectory(backend),
      'identity_invalid',
    )
  })

  it('Q3: caller has no ownership or membership throws account_access_missing', async () => {
    const backend = createBackend()
    await seedAuthority(backend, { omit: 'access' })

    await expectDirectoryRefusal(
      () => listDirectory(backend),
      'account_access_missing',
    )
  })

  it('Q4: the principal-created Account wins over an older Account', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertAccountBWithOwnership(backend)

    const result = await listDirectory(backend)
    expect(result.accountRef).toBe(ACCOUNT_REF)
    expect(result.owner.principalRef).toBe(PRINCIPAL_REF)
  })

  it('Q5: owner on active workspace with no extra members returns owner and empty members', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const result = await listDirectory(backend)

    expect(result.accountRef).toBe(ACCOUNT_REF)
    expect(result.owner).toMatchObject({
      kind: 'owner',
      principalRef: PRINCIPAL_REF,
      ownershipRef: OWNERSHIP_REF,
    })
    expect(result.members).toEqual([])
  })

  it('Q6: owner plus one human membership returns active member row', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Alex Worker',
      createdAt: NOW + 1,
    })

    const result = await listDirectory(backend)
    expect(result.members).toHaveLength(1)
    expect(result.members[0]).toMatchObject({
      kind: 'member',
      principalRef: MEMBER_PRINCIPAL,
      displayName: 'Alex Worker',
      membershipRef: MEMBER_MEMBERSHIP,
      role: 'member',
      lifecycle: 'active',
      joinedAt: NOW + 1,
    })
  })

  it('Q7: active member caller sees the same directory as owner', async () => {
    const memberToken = 'https://clerk.example.test|user_alex'
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Alex Worker',
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef: `eib_${'m'.repeat(32)}`,
        principalRef: MEMBER_PRINCIPAL,
        providerNamespace: 'clerk/user',
        providerIdentifier: memberToken,
        providerState: { kind: 'known', value: 'active' },
        lifecycle: 'active',
        credentialGeneration: 2,
        bindIdempotencyRef: 'bind:alex',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      })
      await ctx.db.insert('credentials', {
        credentialRef: `crd_${'m'.repeat(32)}`,
        bindingRef: `eib_${'m'.repeat(32)}`,
        principalRef: MEMBER_PRINCIPAL,
        type: 'provider_token',
        lifecycle: 'active',
        generation: 2,
        issueIdempotencyRef: 'credential:alex',
        revision: 1,
        issuedAt: 1,
        expiresAt: 20_000,
        updatedAt: NOW,
      })
    })

    const ownerView = await listDirectory(backend)
    const memberView = await listDirectory(backend, samIdentity(memberToken))

    expect(memberView).toEqual(ownerView)
  })

  it('Q8: foreign-account membership never appears in directory', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await insertAccountBWithOwnership(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: FOREIGN_MEMBERSHIP,
      displayName: 'Foreign member',
      accountRef: ACCOUNT_B,
    })

    const result = await listDirectory(backend)
    expect(result.members).toEqual([])
  })

  it('Q9: ended membership is omitted', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Former member',
      lifecycle: 'ended',
    })

    const result = await listDirectory(backend)
    expect(result.members).toEqual([])
  })

  it('Q10: ended predecessor ownership omitted; current owner only', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await backend.run(async (ctx) => {
      await ctx.db.insert('accountOwnerships', {
        ownershipRef: ENDED_OWNERSHIP,
        accountRef: ACCOUNT_REF,
        ownerPrincipalRef: MEMBER_PRINCIPAL,
        lifecycle: 'ended',
        changeKind: 'transfer',
        revision: 1,
        createdAt: NOW - 10,
        createdBy: {
          actorPrincipalRef: PRINCIPAL_REF,
          activeAccountRef: ACCOUNT_REF,
          correlationRef: 'ownership:ended',
          idempotencyRef: 'ownership:ended',
        },
        endedAt: NOW - 5,
      })
      await insertHumanPrincipal(ctx, {
        principalRef: MEMBER_PRINCIPAL,
        displayName: 'Former owner',
      })
    })

    const result = await listDirectory(backend)
    expect(result.owner.principalRef).toBe(PRINCIPAL_REF)
    expect(result.owner.ownershipRef).toBe(OWNERSHIP_REF)
  })

  it('Q11: agent membership on same account is omitted', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: AGENT_PRINCIPAL,
      membershipRef: `mem_${'g'.repeat(32)}`,
      displayName: 'Agent member',
      principalKind: 'agent',
    })

    const result = await listDirectory(backend)
    expect(result.members).toEqual([])
  })

  it('Q12: workload membership on same account is omitted', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: WORKLOAD_PRINCIPAL,
      membershipRef: `mem_${'w'.repeat(32)}`,
      displayName: 'Workload member',
      principalKind: 'workload',
    })

    const result = await listDirectory(backend)
    expect(result.members).toEqual([])
  })

  it('Q13: owner membership row omitted from members', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const result = await listDirectory(backend)
    expect(result.members.some((row) => row.membershipRef === MEMBERSHIP_REF)).toBe(false)
    expect(result.members.some((row) => row.principalRef === PRINCIPAL_REF)).toBe(false)
  })

  it('Q14: owner principal missing throws directory_principal_missing', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await backend.run(async (ctx) => {
      const owner = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', PRINCIPAL_REF))
        .unique()
      if (owner !== null) await ctx.db.delete(owner._id)
    })

    await expectDirectoryRefusal(
      () => listDirectory(backend),
      'directory_principal_missing',
    )
  })

  it('Q15: two active ownerships for account throws ownership_ambiguous', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await backend.run(async (ctx) => {
      await insertHumanPrincipal(ctx, {
        principalRef: MEMBER_PRINCIPAL,
        displayName: 'Second owner principal',
      })
      await ctx.db.insert('accountOwnerships', {
        ownershipRef: SECOND_OWNERSHIP,
        accountRef: ACCOUNT_REF,
        ownerPrincipalRef: MEMBER_PRINCIPAL,
        lifecycle: 'active',
        changeKind: 'transfer',
        revision: 1,
        createdAt: NOW,
        createdBy: {
          actorPrincipalRef: PRINCIPAL_REF,
          activeAccountRef: ACCOUNT_REF,
          correlationRef: 'ownership:second',
          idempotencyRef: 'ownership:second',
        },
      })
    })

    await expectDirectoryRefusal(
      () => listDirectory(backend),
      'ownership_ambiguous',
    )
  })

  it('Q16: ownership ref mismatching currentOwnershipRef throws ownership_mismatch', async () => {
    const backend = createBackend()
    await seedAuthority(backend, {
      accountCurrentOwnershipRef: SECOND_OWNERSHIP,
    })

    await expectDirectoryRefusal(
      () => listDirectory(backend),
      'ownership_mismatch',
    )
  })

  it('Q17: principalNotificationEmails fills email; otherwise null', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Alex Worker',
    })
    await seedNotificationEmail(backend, PRINCIPAL_REF, 'owner@example.test')
    await seedNotificationEmail(backend, MEMBER_PRINCIPAL, 'alex@work.dev')

    const withEmails = await listDirectory(backend)
    expect(withEmails.owner.email).toBe('owner@example.test')
    expect(withEmails.members[0]?.email).toBe('alex@work.dev')

    await backend.run(async (ctx) => {
      const rows = await ctx.db.query('principalNotificationEmails').collect()
      for (const row of rows) {
        await ctx.db.delete(row._id)
      }
    })

    const withoutEmails = await listDirectory(backend)
    expect(withoutEmails.owner.email).toBeNull()
    expect(withoutEmails.members[0]?.email).toBeNull()
  })

  it('Q18: result has no invitations key', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const result = await listDirectory(backend)
    expect('invitations' in result).toBe(false)
  })

  it('Q19: member role is only member', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Alex Worker',
    })

    const result = await listDirectory(backend)
    expect(result.members.every((row) => row.role === 'member')).toBe(true)
  })

  it('W-18: membership with role org:admin maps to directory role admin', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Admin Worker',
      membershipRole: 'org:admin',
    })

    const result = await listDirectory(backend)
    expect(result.members).toHaveLength(1)
    expect(result.members[0]?.role).toBe('admin')
  })

  it('W-18: membership with role undefined maps to directory role member', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Legacy Worker',
    })

    const result = await listDirectory(backend)
    expect(result.members).toHaveLength(1)
    expect(result.members[0]?.role).toBe('member')
  })

  it('Q20: directory query is read-only', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const before = await collectAuthorityTables(backend)
    await listDirectory(backend)
    const after = await collectAuthorityTables(backend)

    expect(after).toEqual(before)
  })

  it('Q21: suspended or closed account throws account_inactive', async () => {
    const suspendedBackend = createBackend()
    await seedAuthority(suspendedBackend, { accountLifecycle: 'suspended' })
    await expectDirectoryRefusal(
      () => listDirectory(suspendedBackend),
      'account_inactive',
    )

    const closedBackend = createBackend()
    await seedAuthority(closedBackend, { accountLifecycle: 'closed' })
    await expectDirectoryRefusal(
      () => listDirectory(closedBackend),
      'account_inactive',
    )
  })

  it('Q22: workspace without Clerk org binding still returns directory', async () => {
    const backend = createBackend()
    await seedAuthority(backend)

    const bindings = await backend.run(async (ctx) =>
      await ctx.db.query('accountExternalOrganizationBindings').collect())
    expect(bindings).toHaveLength(0)

    const result = await listDirectory(backend)
    expect(result.accountRef).toBe(ACCOUNT_REF)
    expect(result.owner.kind).toBe('owner')
  })

  it('Q23: active membership with inactive human principal throws directory_principal_missing', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Inactive member',
      principalLifecycle: 'suspended',
    })

    await expectDirectoryRefusal(
      () => listDirectory(backend),
      'directory_principal_missing',
    )
  })
})

describe('workspaceTeam:invitationContext', () => {
  const invitationRef = makeFunctionReference<
    'query',
    Record<string, never>,
    | { kind: 'available'; organizationId: string }
    | { kind: 'role_restricted' | 'organization_unset' | 'binding_unavailable' }
  >('workspaceTeam:invitationContext')
  const memberToken = 'https://clerk.example.test|user_team_invitee'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  async function bindOrganization(
    backend: InteractiveAuthorityBackend,
    bindingRef: string,
    organizationId: string,
    lifecycle: 'active' | 'revoked' = 'active',
  ) {
    await backend.run(async (ctx) => {
      await ctx.db.insert('accountExternalOrganizationBindings', {
        bindingRef,
        accountRef: ACCOUNT_REF,
        providerNamespace: 'clerk/organization',
        providerIdentifier: organizationId,
        lifecycle,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      })
    })
  }

  async function bindMember(backend: InteractiveAuthorityBackend, role: 'org:admin' | 'org:member') {
    await seedHumanMember(backend, {
      principalRef: MEMBER_PRINCIPAL,
      membershipRef: MEMBER_MEMBERSHIP,
      displayName: 'Team member',
      membershipRole: role,
    })
    await backend.run(async (ctx) => {
      const bindingRef = `eib_${'m'.repeat(32)}`
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef,
        principalRef: MEMBER_PRINCIPAL,
        providerNamespace: 'clerk/user',
        providerIdentifier: memberToken,
        providerState: { kind: 'known', value: 'active' },
        lifecycle: 'active',
        credentialGeneration: 1,
        bindIdempotencyRef: 'bind:team-member',
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
      })
      await ctx.db.insert('credentials', {
        credentialRef: `crd_${'m'.repeat(32)}`,
        bindingRef,
        principalRef: MEMBER_PRINCIPAL,
        type: 'provider_token',
        lifecycle: 'active',
        generation: 1,
        issueIdempotencyRef: 'credential:team-member',
        revision: 1,
        issuedAt: 1,
        expiresAt: 20_000,
        updatedAt: NOW,
      })
    })
  }

  async function invitation(backend: InteractiveAuthorityBackend, actor: UserIdentity = identity()) {
    return backend.withIdentity(actor).query(invitationRef, {})
  }

  it('owner is eligible only with exactly one active Clerk organization binding', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    expect(await invitation(backend)).toEqual({ kind: 'organization_unset' })

    await bindOrganization(backend, 'aob_revoked', 'org_old', 'revoked')
    expect(await invitation(backend)).toEqual({ kind: 'organization_unset' })

    await bindOrganization(backend, 'aob_active', 'org_current')
    expect(await invitation(backend)).toEqual({ kind: 'available', organizationId: 'org_current' })

    await bindOrganization(backend, 'aob_second', 'org_other')
    expect(await invitation(backend)).toEqual({ kind: 'binding_unavailable' })
  })

  it('admin can invite; member receives only a role reason even with a linked organization', async () => {
    const adminBackend = createBackend()
    await seedAuthority(adminBackend)
    await bindOrganization(adminBackend, 'aob_active', 'org_current')
    await bindMember(adminBackend, 'org:admin')
    expect(await invitation(adminBackend, samIdentity(memberToken))).toEqual({
      kind: 'available', organizationId: 'org_current',
    })

    const memberBackend = createBackend()
    await seedAuthority(memberBackend)
    await bindOrganization(memberBackend, 'aob_active', 'org_secret')
    await bindMember(memberBackend, 'org:member')
    const memberResult = await invitation(memberBackend, samIdentity(memberToken))
    expect(memberResult).toEqual({ kind: 'role_restricted' })
    expect(JSON.stringify(memberResult)).not.toContain('org_secret')
  })

  it('rechecks eligibility after an allowed view when the binding or admin role changes', async () => {
    const backend = createBackend()
    await seedAuthority(backend)
    await bindOrganization(backend, 'aob_active', 'org_current')
    await bindMember(backend, 'org:admin')
    const admin = samIdentity(memberToken)
    expect(await invitation(backend, admin)).toEqual({ kind: 'available', organizationId: 'org_current' })

    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('accountExternalOrganizationBindings')
        .withIndex('by_accountRef_and_lifecycle', (q) => q.eq('accountRef', ACCOUNT_REF).eq('lifecycle', 'active'))
        .unique()
      if (binding === null) throw new Error('Missing bound organization')
      await ctx.db.patch(binding._id, { lifecycle: 'revoked' })
    })
    expect(await invitation(backend, admin)).toEqual({ kind: 'organization_unset' })

    await bindOrganization(backend, 'aob_relinked', 'org_new')
    await backend.run(async (ctx) => {
      const membership = await ctx.db.query('memberships')
        .withIndex('by_membershipRef', (q) => q.eq('membershipRef', MEMBER_MEMBERSHIP))
        .unique()
      if (membership === null) throw new Error('Missing admin membership')
      await ctx.db.patch(membership._id, { role: 'org:member' })
    })
    expect(await invitation(backend, admin)).toEqual({ kind: 'role_restricted' })
  })
})
