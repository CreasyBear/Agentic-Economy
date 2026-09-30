import type { UserIdentity } from 'convex/server'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { internal } from '../../../convex/_generated/api'
import { accountRef } from '../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../src/modules/principal-account/principal/public'
import {
  InteractiveAuthorityError,
  requireAccessFactForAccount,
} from '../../../convex/interactiveAuthority'
import { samIdentity } from '../../helpers/interactive-authority-provisioning'
import {
  createInteractiveAuthorityBackend as createBackend,
  expectInteractiveMaterialize as expectMaterialize,
  resolveInteractiveContext as resolveContext,
  seededInteractiveAuthorityBackend as seededBackend,
  type InteractiveAuthorityBackend,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_A,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_MEMBERSHIP_REF as MEMBERSHIP_A,
  INTERACTIVE_OWNERSHIP_REF as OWNERSHIP_A,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const ACCOUNT_B = `acc_${'b'.repeat(32)}`
const ACCOUNT_C = `acc_${'c'.repeat(32)}`
const OWNERSHIP_B = `own_${'b'.repeat(32)}`
const MEMBERSHIP_B = `mem_${'b'.repeat(32)}`
const OTHER_OWNER_PRINCIPAL = `prn_${'8'.repeat(32)}`
const ORG_BINDING_A_REF = `eob_${'a'.repeat(32)}`
const ORG_BINDING_B_REF = `eob_${'c'.repeat(32)}`
const CLERK_ORG_A = 'org_test_workspace_a'
const CLERK_ORG_B = 'org_test_workspace_b'
const CLERK_ORG_INACCESSIBLE = 'org_test_inaccessible'

const setActiveWorkspaceRef = internal.interactiveSession.setActiveWorkspace


type RunCtx = Parameters<Parameters<InteractiveAuthorityBackend['run']>[0]>[0]

const identity = (overrides: Partial<UserIdentity> = {}) =>
  samIdentity(TOKEN_IDENTIFIER, overrides)

const correlationRef = (label: string) => `test:tenancy:${label}`


async function insertOrgBinding(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    bindingRef: string
    accountRef: string
    providerIdentifier: string
  }>,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert('accountExternalOrganizationBindings', {
      bindingRef: input.bindingRef,
      accountRef: input.accountRef,
      providerNamespace: 'clerk/organization',
      providerIdentifier: input.providerIdentifier,
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
    })
  })
}

async function insertAccountWithOwnership(
  ctx: RunCtx,
  input: Readonly<{
    accountRef: string
    ownershipRef: string
    displayName: string
    ownerPrincipalRef: string
    lifecycle?: 'active' | 'suspended'
    creationActorPrincipalRef?: string
    createdAt?: number
  }>,
): Promise<void> {
  await ctx.db.insert('accounts', {
    accountRef: input.accountRef,
    displayName: input.displayName,
    lifecycle: input.lifecycle ?? 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: input.creationActorPrincipalRef ?? input.ownerPrincipalRef,
    creationIdempotencyRef: `account:${input.accountRef}`,
    initialOwnershipRef: input.ownershipRef,
    currentOwnershipRef: input.ownershipRef,
    revision: 1,
    createdAt: input.createdAt ?? NOW,
    updatedAt: NOW,
    lastAction: {
      actorPrincipalRef: input.ownerPrincipalRef,
      activeAccountRef: input.accountRef,
      correlationRef: `account:${input.accountRef}`,
      idempotencyRef: `account:${input.accountRef}`,
    },
  })
  await ctx.db.insert('accountOwnerships', {
    ownershipRef: input.ownershipRef,
    accountRef: input.accountRef,
    ownerPrincipalRef: input.ownerPrincipalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: input.createdAt ?? NOW,
    createdBy: {
      actorPrincipalRef: input.ownerPrincipalRef,
      activeAccountRef: input.accountRef,
      correlationRef: `ownership:${input.ownershipRef}`,
      idempotencyRef: `ownership:${input.ownershipRef}`,
    },
  })
}

async function insertMembershipForPrincipal(
  ctx: RunCtx,
  input: Readonly<{
    membershipRef: string
    accountRef: string
    memberPrincipalRef: string
  }>,
): Promise<void> {
  await ctx.db.insert('memberships', {
    membershipRef: input.membershipRef,
    accountRef: input.accountRef,
    memberPrincipalRef: input.memberPrincipalRef,
    lifecycle: 'active',
    revision: 1,
    createdAt: NOW,
    createdBy: {
      actorPrincipalRef: input.memberPrincipalRef,
      activeAccountRef: input.accountRef,
      correlationRef: `membership:${input.membershipRef}`,
      idempotencyRef: `membership:${input.membershipRef}`,
    },
  })
}

async function ensureOtherOwnerPrincipal(ctx: RunCtx): Promise<void> {
  const existing = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', OTHER_OWNER_PRINCIPAL))
    .unique()
  if (existing !== null) return
  await ctx.db.insert('principals', {
    principalRef: OTHER_OWNER_PRINCIPAL,
    kind: 'human',
    displayName: 'Other workspace owner',
    lifecycle: 'active',
    revision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  })
}

async function seedOwnedAccountB(backend: InteractiveAuthorityBackend): Promise<void> {
  await backend.run(async (ctx) => {
    await insertAccountWithOwnership(ctx, {
      accountRef: ACCOUNT_B,
      ownershipRef: OWNERSHIP_B,
      displayName: 'Workspace B',
      ownerPrincipalRef: PRINCIPAL_REF,
    })
  })
}

async function seedMemberAccountB(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    createdAt?: number
    creationActorPrincipalRef?: string
  }> = {},
): Promise<void> {
  await backend.run(async (ctx) => {
    await ensureOtherOwnerPrincipal(ctx)
    await insertAccountWithOwnership(ctx, {
      accountRef: ACCOUNT_B,
      ownershipRef: OWNERSHIP_B,
      displayName: 'Workspace B',
      ownerPrincipalRef: OTHER_OWNER_PRINCIPAL,
      creationActorPrincipalRef: input.creationActorPrincipalRef ?? OTHER_OWNER_PRINCIPAL,
      createdAt: input.createdAt ?? NOW,
    })
    await insertMembershipForPrincipal(ctx, {
      membershipRef: MEMBERSHIP_B,
      accountRef: ACCOUNT_B,
      memberPrincipalRef: PRINCIPAL_REF,
    })
  })
}

async function seedCanonicalWithExtraOwnedB(
  backend: InteractiveAuthorityBackend,
): Promise<void> {
  await seedAuthority(backend)
  await seedOwnedAccountB(backend)
}

async function seedCanonicalWithMemberB(
  backend: InteractiveAuthorityBackend,
  input: Readonly<{
    createdAt?: number
    creationActorPrincipalRef?: string
  }> = {},
): Promise<void> {
  await seedAuthority(backend)
  await seedMemberAccountB(backend, input)
}

function clerkOrgIdentity(
  orgId: string,
  claim: 'org_id' | 'o.id' = 'org_id',
): UserIdentity {
  if (claim === 'org_id') return identity({ org_id: orgId })
  return identity({ ['o.id']: orgId })
}

describe('interactive authority tenancy (W-10)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Section A: auto-select (single Account)', () => {
    it('A1: single ownership resolves Account A', async () => {
      const backend = await seededBackend()
      const context = await resolveContext(backend)

      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance.accessKind).toBe('ownership')
      await expect(resolveContext(backend)).resolves.toMatchObject({ accountRef: ACCOUNT_A })
    })

    it('A2: single membership resolves with accessKind membership', async () => {
      const backend = await seededBackend({ access: 'membership' })
      const context = await resolveContext(backend)

      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance).toMatchObject({
        accessKind: 'membership',
        accessRef: MEMBERSHIP_A,
      })
    })

    it('A3: ownership and membership on one Account prefers ownership', async () => {
      const backend = await seededBackend({ addMembershipToOwnership: true })
      const context = await resolveContext(backend)

      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance).toMatchObject({
        accessKind: 'ownership',
        accessRef: OWNERSHIP_A,
      })
    })

    it('A4: an inaccessible saved workspace falls back to the sole accessible Account', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend)
      await backend.withIdentity(identity()).mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_B,
        correlationRef: correlationRef('a4'),
      })
      await backend.run(async (ctx) => {
        const membership = await ctx.db.query('memberships')
          .withIndex('by_membershipRef', (query) => query.eq('membershipRef', MEMBERSHIP_B))
          .unique()
        if (membership === null) throw new Error('membership B missing')
        await ctx.db.patch(membership._id, { lifecycle: 'ended' })
      })

      await expect(resolveContext(backend)).resolves.toMatchObject({ accountRef: ACCOUNT_A })
    })

    it('A5: zero access facts throws account_access_missing', async () => {
      const backend = await seededBackend({ omit: 'access' })
      await expect(resolveContext(backend)).rejects.toEqual(
        new InteractiveAuthorityError('account_access_missing'),
      )
    })
  })

  describe('Section B: deterministic multi-Account resolution', () => {
    it('B1: a saved workspace does not override the deterministic choice', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      await backend.withIdentity(identity()).mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_B,
        correlationRef: correlationRef('b1'),
      })

      const context = await resolveContext(backend)
      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance.accessKind).toBe('ownership')
    })

    it('B2: a saved membership workspace does not override the personal Account', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend)
      await backend.withIdentity(identity()).mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_B,
        correlationRef: correlationRef('b2'),
      })

      const context = await resolveContext(backend)
      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance.accessKind).toBe('ownership')
    })

    it('B3: personal Account wins over an accessible org-bound Account without an org claim', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend, {
        createdAt: NOW - 1,
        creationActorPrincipalRef: PRINCIPAL_REF,
      })
      await insertOrgBinding(backend, {
        bindingRef: ORG_BINDING_B_REF,
        accountRef: ACCOUNT_B,
        providerIdentifier: CLERK_ORG_B,
      })

      const context = await resolveContext(backend)
      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance.accessKind).toBe('ownership')
    })

    it('B4: setting an inaccessible workspace throws account_access_missing', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)

      await expect(backend.withIdentity(identity()).mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_C,
        correlationRef: correlationRef('b4'),
      })).rejects.toEqual(new InteractiveAuthorityError('account_access_missing'))
    })

    it('B5: an org claim overrides a saved workspace when its Account is accessible', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      await backend.withIdentity(identity()).mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_A,
        correlationRef: correlationRef('b5'),
      })
      await insertOrgBinding(backend, {
        bindingRef: ORG_BINDING_B_REF,
        accountRef: ACCOUNT_B,
        providerIdentifier: CLERK_ORG_B,
      })

      const context = await resolveContext(backend, clerkOrgIdentity(CLERK_ORG_B))
      expect(context.accountRef).toBe(ACCOUNT_B)
    })

    it('B6: selecting a suspended Account still throws account_inactive', async () => {
      const backend = createBackend()
      await seedAuthority(backend)
      await backend.run(async (ctx) => {
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT_A))
          .unique()
        if (account === null) throw new Error('account A missing')
        await ctx.db.patch(account._id, { lifecycle: 'suspended' })
      })
      await seedOwnedAccountB(backend)

      await expect(resolveContext(backend)).rejects.toEqual(
        new InteractiveAuthorityError('account_inactive'),
      )
    })
  })

  describe('Section C: Clerk org_id hint and personal fallback', () => {
    it('C1: org_id bound to owned Account A resolves Account A', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      await insertOrgBinding(backend, {
        bindingRef: ORG_BINDING_A_REF,
        accountRef: ACCOUNT_A,
        providerIdentifier: CLERK_ORG_A,
      })

      const context = await resolveContext(backend, clerkOrgIdentity(CLERK_ORG_A))
      expect(context.accountRef).toBe(ACCOUNT_A)
    })

    it('C2: Clerk v2 o.id claim bound to Account A resolves Account A', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      await insertOrgBinding(backend, {
        bindingRef: ORG_BINDING_A_REF,
        accountRef: ACCOUNT_A,
        providerIdentifier: CLERK_ORG_A,
      })

      const context = await resolveContext(backend, clerkOrgIdentity(CLERK_ORG_A, 'o.id'))
      expect(context.accountRef).toBe(ACCOUNT_A)
    })

    it('C3: an org claim selects the same accessible org Account despite personal fallback', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend, {
        createdAt: NOW - 1,
        creationActorPrincipalRef: PRINCIPAL_REF,
      })
      await insertOrgBinding(backend, {
        bindingRef: ORG_BINDING_B_REF,
        accountRef: ACCOUNT_B,
        providerIdentifier: CLERK_ORG_B,
      })

      const context = await resolveContext(backend, clerkOrgIdentity(CLERK_ORG_B))
      expect(context.accountRef).toBe(ACCOUNT_B)
      expect(context.provenance.accessKind).toBe('membership')
    })

    it('C4: principal-created Account wins over an older Account created by someone else', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend, { createdAt: NOW - 1_000 })

      const context = await resolveContext(backend)
      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance.accessKind).toBe('ownership')
    })

    it('C5: older Account wins when neither accessible Account was created by the principal', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend)
      await backend.run(async (ctx) => {
        const account = await ctx.db.query('accounts')
          .withIndex('by_accountRef', (query) => query.eq('accountRef', ACCOUNT_A))
          .unique()
        if (account === null) throw new Error('account A missing')
        await ctx.db.patch(account._id, {
          creationActorPrincipalRef: OTHER_OWNER_PRINCIPAL,
          createdAt: NOW - 1_000,
        })
      })

      const context = await resolveContext(backend)
      expect(context.accountRef).toBe(ACCOUNT_A)
    })

    it('C6: an org claim bound to an inaccessible Account falls through to personal', async () => {
      const backend = createBackend()
      await seedAuthority(backend)
      await backend.run(async (ctx) => {
        await ensureOtherOwnerPrincipal(ctx)
        await insertAccountWithOwnership(ctx, {
          accountRef: ACCOUNT_C,
          ownershipRef: `own_${'c'.repeat(32)}`,
          displayName: 'Inaccessible workspace',
          ownerPrincipalRef: OTHER_OWNER_PRINCIPAL,
        })
      })
      await insertOrgBinding(backend, {
        bindingRef: `eob_${'d'.repeat(32)}`,
        accountRef: ACCOUNT_C,
        providerIdentifier: CLERK_ORG_INACCESSIBLE,
      })

      const context = await resolveContext(
        backend,
        clerkOrgIdentity(CLERK_ORG_INACCESSIBLE),
      )
      expect(context.accountRef).toBe(ACCOUNT_A)
      expect(context.provenance.accessKind).toBe('ownership')
    })
  })

  describe('Section D: requireAccessFactForAccount', () => {
    it('D1: owner of target returns ownership fact', async () => {
      const backend = await seededBackend()
      const fact = await backend.run(async (ctx) =>
        requireAccessFactForAccount(ctx.db, principalRef(PRINCIPAL_REF), accountRef(ACCOUNT_A)))

      expect(fact.kind).toBe('ownership')
      expect(fact.row.accountRef).toBe(ACCOUNT_A)
    })

    it('D2: member of target returns membership fact', async () => {
      const backend = createBackend()
      await seedCanonicalWithMemberB(backend)
      const fact = await backend.run(async (ctx) =>
        requireAccessFactForAccount(ctx.db, principalRef(PRINCIPAL_REF), accountRef(ACCOUNT_B)))

      expect(fact.kind).toBe('membership')
      expect(fact.row.accountRef).toBe(ACCOUNT_B)
    })

    it('D3: neither ownership nor membership throws account_access_missing', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)

      await expect(backend.run(async (ctx) =>
        requireAccessFactForAccount(ctx.db, principalRef(PRINCIPAL_REF), accountRef(ACCOUNT_C))))
        .rejects.toEqual(new InteractiveAuthorityError('account_access_missing'))
    })
  })

  describe('Section E: setActiveWorkspace', () => {
    it('E1: switching to an owned Account returns revision 1', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      const session = backend.withIdentity(identity())

      const result = await session.mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_A,
        correlationRef: correlationRef('e1'),
      })

      expect(result).toMatchObject({
        principalRef: PRINCIPAL_REF,
        activeAccountRef: ACCOUNT_A,
        revision: 1,
        selectedAt: NOW,
      })
    })

    it('E2: switching again to the same Account is idempotent', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      const session = backend.withIdentity(identity())
      const args = { accountRef: ACCOUNT_A, correlationRef: correlationRef('e2') }

      await session.mutation(setActiveWorkspaceRef, args)
      const second = await session.mutation(setActiveWorkspaceRef, args)

      expect(second.revision).toBe(1)
    })

    it('E3: switching to another accessible Account bumps revision and selectedAt', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      const session = backend.withIdentity(identity())

      await session.mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_A,
        correlationRef: correlationRef('e3-first'),
      })

      vi.setSystemTime(NOW + 5_000)
      const result = await session.mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_B,
        correlationRef: correlationRef('e3-second'),
      })

      expect(result).toMatchObject({
        activeAccountRef: ACCOUNT_B,
        revision: 2,
        selectedAt: NOW + 5_000,
      })
    })

    it('E4: switching to inaccessible Account throws account_access_missing', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      const session = backend.withIdentity(identity())

      await expect(session.mutation(setActiveWorkspaceRef, {
        accountRef: ACCOUNT_C,
        correlationRef: correlationRef('e4'),
      })).rejects.toEqual(new InteractiveAuthorityError('account_access_missing'))
    })

    it('E5: materialize succeeds with two Accounts (identity armed)', async () => {
      const backend = createBackend()
      await seedCanonicalWithExtraOwnedB(backend)
      const session = backend.withIdentity(identity())

      await expectMaterialize(session, true)
    })
  })

})
