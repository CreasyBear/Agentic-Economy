import {
  makeFunctionReference,
  type UserIdentity,
} from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import schema from '../../../convex/schema'
import {
  InteractiveAuthorityError,
  materializeCurrentInteractiveAuthority,
  reconcileScheduledInteractiveAuthority,
  resolveInteractiveAuthorityContext,
} from '../../../convex/interactiveAuthority'
import { interactiveCredentialExpiryNonce } from '../../../convex/interactiveCredentialLifecycle'
import { resolveBusinessActor } from '../../../convex/authz'
import { convexModules as modules } from '../../helpers/convex-fixtures'

const NOW = 10_000
const PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
const ACCOUNT_REF = `acc_${'2'.repeat(32)}`
const OWNERSHIP_REF = `own_${'3'.repeat(32)}`
const MEMBERSHIP_REF = `mem_${'4'.repeat(32)}`
const BINDING_REF = `eib_${'5'.repeat(32)}`
const CREDENTIAL_REF = `crd_${'6'.repeat(32)}`
const TOKEN_IDENTIFIER = 'https://clerk.example.test|user_sam'
const resolveCurrentInteractiveAuthorityRef = makeFunctionReference<
  'action',
  Record<string, never>,
  unknown
>('interactiveAuthority:resolveCurrentInteractiveAuthority')
const readCurrentInteractiveAuthorityFactsRef = makeFunctionReference<
  'query',
  Record<string, never>,
  unknown
>('interactiveAuthority:readCurrentInteractiveAuthorityFacts')

describe('canonical interactive authority', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves a frozen canonical owner context without treating Clerk claims as ownership', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend)

    const context = await backend.run(async (ctx) =>
      resolveInteractiveAuthorityContext(ctx.db, identity({ subject: 'caller-shaped-subject' })))

    expect(context).toEqual({
      principalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
      legacyOwnerId: expect.any(String),
      legacyOwnerLocator: 'legacy-owner-row',
      displayName: 'Canonical owner',
      emailHash: 'sha256:canonical',
      revision: {
        binding: 7,
        credential: 6,
        principal: 5,
        account: 4,
        access: 3,
        currentOwnership: 3,
        currentOwnerPrincipal: 5,
        compatibilityUpdatedAt: 9,
      },
      provenance: {
        providerNamespace: 'clerk/user',
        bindingRef: BINDING_REF,
        credentialRef: CREDENTIAL_REF,
        credentialGeneration: 2,
        accessKind: 'ownership',
        accessRef: OWNERSHIP_REF,
        currentOwnershipRef: OWNERSHIP_REF,
        resolvedAt: NOW,
      },
    })
    expect(context.principalRef).not.toBe('caller-shaped-subject')
    expect(context.accountRef).not.toBe(TOKEN_IDENTIFIER)
    expect(context.legacyOwnerLocator).not.toBe('caller-shaped-subject')

    const actor = await backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      scheduler: ctx.scheduler,
      auth: {
        getUserIdentity: async () => identity({ subject: 'caller-shaped-subject' }),
      },
    }))
    expect(actor).toMatchObject({
      kind: 'authenticated_owner',
      clerkUserId: 'legacy-owner-row',
      canonicalPrincipalRef: PRINCIPAL_REF,
      canonicalAccountRef: ACCOUNT_REF,
      authorityProvenance: {
        providerNamespace: 'clerk/user',
        bindingRef: BINDING_REF,
        credentialRef: CREDENTIAL_REF,
      },
    })
  })

  it('resolves exactly one active membership and preserves the current owner chain', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend, { access: 'membership' })

    const context = await backend.run(async (ctx) =>
      resolveInteractiveAuthorityContext(ctx.db, identity()))

    expect(context.provenance).toMatchObject({
      accessKind: 'membership',
      accessRef: MEMBERSHIP_REF,
    })
    expect(context.revision.access).toBe(8)
    expect(context.revision.currentOwnerPrincipal).toBe(2)
  })

  it('resolves current authenticated sessions only at the non-cached action boundary', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.withIdentity(identity()).action(resolveCurrentInteractiveAuthorityRef, {}))
      .resolves.toBeNull()
    await seedAuthority(backend, { omitOwnerProfile: true })

    await expect(backend.action(resolveCurrentInteractiveAuthorityRef, {})).resolves.toBeNull()
    await expect(backend.withIdentity(identity()).action(resolveCurrentInteractiveAuthorityRef, {}))
      .resolves.toMatchObject({
        principalRef: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF,
      })
  })

  it('expires authority after a cached fact read without accepting caller-shaped time', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend, { expiresAt: NOW + 1_000 })
    const authenticated = backend.withIdentity(identity({ exp: 11 }))

    await expect(authenticated.query(readCurrentInteractiveAuthorityFactsRef, {}))
      .resolves.toMatchObject({
        context: { provenance: { resolvedAt: 0 } },
        credentialExpiresAt: NOW + 1_000,
        authorityMaterializedAt: 6,
      })
    await expect(authenticated.action(resolveCurrentInteractiveAuthorityRef, {}))
      .resolves.toMatchObject({ provenance: { resolvedAt: NOW } })

    vi.setSystemTime(NOW + 1_000)
    await expect(authenticated.query(readCurrentInteractiveAuthorityFactsRef, {}))
      .resolves.toMatchObject({ credentialExpiresAt: NOW + 1_000 })
    await expect(authenticated.action(resolveCurrentInteractiveAuthorityRef, {})).resolves.toBeNull()
  })

  it('denies a late-callback read through platform token expiry while durable state is still scheduled', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend, { expiresAt: NOW + 1_000 })

    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => identity({ exp: 11 }) },
    }))).resolves.toMatchObject({ kind: 'authenticated_owner' })

    vi.setSystemTime(NOW + 1_000)
    // Convex returns null once its verified Clerk JWT has expired, even if a
    // durable scheduled callback has not yet changed the credential row.
    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => null },
    }))).resolves.toEqual({ kind: 'anonymous', anonymousBucket: 'convex:anonymous' })
    // A still-valid token cannot bridge the gap unless its verified expiry is
    // exactly the canonical credential expiry persisted for this generation.
    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => identity({ exp: 12 }) },
    }))).resolves.toEqual({ kind: 'anonymous', anonymousBucket: 'convex:anonymous' })
  })

  it('invalidates account-scoped reads when the canonical credential is revoked', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend)
    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => identity() },
    }))).resolves.toMatchObject({ kind: 'authenticated_owner' })
    await backend.run(async (ctx) => {
      const row = await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', CREDENTIAL_REF)).unique()
      if (row === null) throw new Error('credential missing')
      await ctx.db.patch(row._id, { lifecycle: 'revoked', revokedAt: NOW, revision: row.revision + 1 })
    })
    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => identity() },
    }))).resolves.toEqual({ kind: 'anonymous', anonymousBucket: 'convex:anonymous' })
  })

  it('preserves authenticated account-scoped queries from materialized current facts', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend)

    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => identity() },
    }))).resolves.toMatchObject({
      kind: 'authenticated_owner',
      canonicalPrincipalRef: PRINCIPAL_REF,
      canonicalAccountRef: ACCOUNT_REF,
      authorityProvenance: { resolvedAt: 6 },
    })
  })

  it('fails unmaterialized credential rollout rows closed without a legacy fallback', async () => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend, { omitExpiryMaterialization: true })

    await expect(backend.run(async (ctx) => resolveBusinessActor({
      db: ctx.db,
      auth: { getUserIdentity: async () => identity() },
    }))).resolves.toEqual({ kind: 'anonymous', anonymousBucket: 'convex:anonymous' })
  })

  it.each([
    ['binding_missing', { omit: 'binding' }],
    ['binding_ambiguous', { duplicate: 'binding' }],
    ['binding_inactive', { bindingLifecycle: 'revoked' }],
    ['binding_untrusted', { providerState: 'disabled' }],
    ['binding_untrusted', { providerState: 'unknown' }],
    ['credential_missing', { omit: 'credential' }],
    ['credential_ambiguous', { duplicate: 'credential' }],
    ['credential_missing', { credentialBindingRef: `eib_${'7'.repeat(32)}` }],
    ['credential_mismatch', { credentialPrincipalRef: `prn_${'7'.repeat(32)}` }],
    ['credential_missing', { credentialGeneration: 9 }],
    ['credential_missing', { credentialLifecycle: 'stale' }],
    ['credential_type_invalid', { credentialType: 'api_key' }],
    ['credential_not_current', { issuedAt: 1.5 }],
    ['credential_not_current', { expiresAt: Number.NaN }],
    ['credential_not_current', { issuedAt: -1 }],
    ['credential_not_current', { issuedAt: 5, expiresAt: 5 }],
    ['credential_not_current', { issuedAt: NOW + 1 }],
    ['credential_not_current', { expiresAt: NOW }],
    ['principal_missing', { omit: 'principal' }],
    ['principal_ambiguous', { duplicate: 'principal' }],
    ['principal_inactive', { principalLifecycle: 'suspended' }],
    ['principal_kind_invalid', { principalKind: 'agent' }],
    ['account_access_missing', { omit: 'access' }],
    ['account_access_ambiguous', { duplicate: 'access' }],
    ['account_access_ambiguous', { addMembershipToOwnership: true }],
    ['account_missing', { omit: 'account' }],
    ['account_ambiguous', { duplicate: 'account' }],
    ['account_inactive', { accountLifecycle: 'suspended' }],
    ['ownership_missing', { access: 'membership', omit: 'currentOwnership' }],
    ['ownership_ambiguous', { access: 'membership', duplicate: 'currentOwnership' }],
    ['ownership_missing', { access: 'membership', accountCurrentOwnershipRef: `own_${'9'.repeat(32)}` }],
    ['ownership_mismatch', { access: 'membership', currentOwnershipAccountRef: `acc_${'9'.repeat(32)}` }],
    ['ownership_mismatch', { access: 'membership', currentOwnershipLifecycle: 'ended' }],
    ['ownership_mismatch', { access: 'membership', currentOwnerPrincipalRef: `prn_${'9'.repeat(32)}` }],
    ['authority_fact_invalid', { access: 'membership', currentOwnerPrincipalRef: 'not-a-principal-ref' }],
    ['ownership_mismatch', { access: 'membership', currentOwnerLifecycle: 'suspended' }],
    ['ownership_mismatch', { staleActiveFormerOwner: true }],
    ['compatibility_missing', { omit: 'owner' }],
    ['compatibility_ambiguous', { duplicate: 'owner' }],
    ['compatibility_mismatch', { ownerPrincipalRef: `prn_${'9'.repeat(32)}` }],
    ['compatibility_mismatch', { ownerAccountRef: `acc_${'9'.repeat(32)}` }],
    ['authority_fact_invalid', { bindingRevision: -1 }],
    ['authority_fact_invalid', { bindingRevision: 1.5 }],
    ['authority_fact_invalid', { bindingGeneration: 0 }],
    ['authority_fact_invalid', { ownerUpdatedAt: Number.NaN }],
    ['authority_fact_invalid', { ownerLocator: '   ' }],
  ] as const)('rejects %s authority facts', async (code, options) => {
    const backend = convexTest(schema, modules)
    await seedAuthority(backend, options as SeedOptions)

    await expect(backend.run(async (ctx) =>
      resolveInteractiveAuthorityContext(ctx.db, identity())))
      .rejects.toMatchObject({ name: 'InteractiveAuthorityError', code })
  })

  it('rejects an identity without a stable token identifier before reading authority', async () => {
    const backend = convexTest(schema, modules)
    await expect(backend.run(async (ctx) => resolveInteractiveAuthorityContext(
      ctx.db,
      { subject: 'user_sam', issuer: 'https://clerk.example.test' } as UserIdentity,
    ))).rejects.toEqual(new InteractiveAuthorityError('identity_invalid'))

    await expect(backend.run(async (ctx) => resolveInteractiveAuthorityContext(
      ctx.db,
      identity({ tokenIdentifier: '   ' }),
    ))).rejects.toEqual(new InteractiveAuthorityError('identity_invalid'))

    await seedAuthority(backend)
    await expect(backend.run(async (ctx) => resolveInteractiveAuthorityContext(
      ctx.db,
      identity({ exp: undefined }),
    ))).rejects.toEqual(new InteractiveAuthorityError('credential_not_current'))
  })

  it('keeps the registered materializer fail closed across changing identity facts', async () => {
    const cases = [
      { secondToken: '   ', alternateBinding: false },
      { secondToken: 'https://clerk.example.test|user_missing_binding', alternateBinding: false },
      { secondToken: 'https://clerk.example.test|user_missing_credential', alternateBinding: true },
    ] as const
    const handler = (materializeCurrentInteractiveAuthority as unknown as {
      _handler: (ctx: unknown, args: Record<string, never>) => Promise<boolean>
    })._handler

    for (const testCase of cases) {
      const backend = convexTest(schema, modules)
      await seedAuthority(backend, { omitExpiryMaterialization: true })
      if (testCase.alternateBinding) {
        await backend.run(async (ctx) => {
          await ctx.db.insert('externalIdentityBindings', {
            bindingRef: `eib_${'8'.repeat(32)}`,
            principalRef: PRINCIPAL_REF,
            providerNamespace: 'clerk/user',
            providerIdentifier: testCase.secondToken,
            providerState: { kind: 'known', value: 'active' },
            lifecycle: 'active',
            credentialGeneration: 99,
            bindIdempotencyRef: 'bind:missing-credential',
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
          })
        })
      }
      let reads = 0
      const changingIdentity = {
        ...identity(),
        get tokenIdentifier() {
          reads += 1
          return reads === 2 ? testCase.secondToken : TOKEN_IDENTIFIER
        },
      }

      await expect(backend.run(async (ctx) => await handler({
        auth: { getUserIdentity: async () => changingIdentity },
        db: ctx.db,
        scheduler: ctx.scheduler,
      }, {}))).resolves.toBe(false)
    }
  })

  it('rethrows unexpected failures from the registered materializer and invokes registered reconciliation', async () => {
    const materializeHandler = (materializeCurrentInteractiveAuthority as unknown as {
      _handler: (ctx: unknown, args: Record<string, never>) => Promise<boolean>
    })._handler
    const unexpected = new Error('database_unavailable')
    await expect(materializeHandler({
      auth: { getUserIdentity: async () => identity() },
      db: { query: () => { throw unexpected } },
      scheduler: {},
    }, {})).rejects.toBe(unexpected)

    const backend = convexTest(schema, modules)
    await seedAuthority(backend)
    const expected = await backend.run(async (ctx) =>
      resolveInteractiveAuthorityContext(ctx.db, identity()))
    const reconcileHandler = (reconcileScheduledInteractiveAuthority as unknown as {
      _handler: (ctx: unknown, args: { authority: unknown }) => Promise<unknown>
    })._handler
    await expect(backend.run(async (ctx) => reconcileHandler(
      { db: ctx.db },
      { authority: expected },
    ))).resolves.toMatchObject({
      principalRef: PRINCIPAL_REF,
      accountRef: ACCOUNT_REF,
    })
    await expect(backend.run(async (ctx) => reconcileHandler(
      { db: ctx.db },
      { authority: { ...expected, accountRef: `acc_${'9'.repeat(32)}` } },
    ))).resolves.toBeNull()
    await expect(backend.run(async (ctx) => reconcileHandler(
      { db: ctx.db },
      { authority: { ...expected, provenance: { ...expected.provenance, bindingRef: 'invalid' } } },
    ))).resolves.toBeNull()
  })
})

type SeedOptions = Readonly<{
  access?: 'ownership' | 'membership'
  omit?: 'binding' | 'credential' | 'principal' | 'access' | 'account' | 'currentOwnership' | 'owner'
  duplicate?: 'binding' | 'credential' | 'principal' | 'access' | 'account' | 'currentOwnership' | 'owner'
  bindingLifecycle?: 'active' | 'revoked'
  bindingGeneration?: number
  bindingRevision?: number
  providerState?: 'active' | 'disabled' | 'unknown'
  credentialBindingRef?: string
  credentialPrincipalRef?: string
  credentialGeneration?: number
  credentialLifecycle?: 'active' | 'stale'
  credentialType?: 'provider_token' | 'api_key'
  omitExpiryMaterialization?: boolean
  issuedAt?: number
  expiresAt?: number
  principalLifecycle?: 'active' | 'suspended'
  principalKind?: 'human' | 'agent'
  addMembershipToOwnership?: boolean
  accountLifecycle?: 'active' | 'suspended'
  accountCurrentOwnershipRef?: string
  currentOwnershipAccountRef?: string
  currentOwnershipLifecycle?: 'active' | 'ended'
  currentOwnerPrincipalRef?: string
  currentOwnerLifecycle?: 'active' | 'suspended'
  ownerPrincipalRef?: string
  ownerAccountRef?: string
  omitOwnerProfile?: boolean
  ownerUpdatedAt?: number
  ownerLocator?: string
  staleActiveFormerOwner?: boolean
}>

type Backend = TestConvex<typeof schema>

async function seedAuthority(backend: Backend, options: SeedOptions = {}): Promise<void> {
  await backend.run(async (ctx) => {
    const providerState = options.providerState === 'unknown'
      ? { kind: 'unknown' as const, value: 'future-state' }
      : { kind: 'known' as const, value: options.providerState ?? 'active' }

    if (options.omit !== 'binding') {
      await ctx.db.insert('externalIdentityBindings', {
        bindingRef: BINDING_REF,
        principalRef: PRINCIPAL_REF,
        providerNamespace: 'clerk/user',
        providerIdentifier: TOKEN_IDENTIFIER,
        providerState,
        lifecycle: options.bindingLifecycle ?? 'active',
        credentialGeneration: options.bindingGeneration ?? 2,
        bindIdempotencyRef: 'bind:sam',
        revision: options.bindingRevision ?? 7,
        createdAt: 1,
        updatedAt: 2,
      })
      if (options.duplicate === 'binding') {
        await ctx.db.insert('externalIdentityBindings', {
          bindingRef: `eib_${'7'.repeat(32)}`,
          principalRef: PRINCIPAL_REF,
          providerNamespace: 'clerk/user',
          providerIdentifier: TOKEN_IDENTIFIER,
          providerState: { kind: 'known', value: 'active' },
          lifecycle: 'active',
          credentialGeneration: 2,
          bindIdempotencyRef: 'bind:sam:duplicate',
          revision: 1,
          createdAt: 1,
          updatedAt: 2,
        })
      }
    }

    if (options.omit !== 'credential') {
      const credential = {
        credentialRef: CREDENTIAL_REF,
        bindingRef: options.credentialBindingRef ?? BINDING_REF,
        principalRef: options.credentialPrincipalRef ?? PRINCIPAL_REF,
        type: options.credentialType ?? 'provider_token' as const,
        lifecycle: options.credentialLifecycle ?? 'active' as const,
        generation: options.credentialGeneration ?? options.bindingGeneration ?? 2,
        issueIdempotencyRef: 'credential:sam',
        revision: 6,
        issuedAt: options.issuedAt ?? 5,
        expiresAt: options.expiresAt ?? 20_000,
        ...(options.omitExpiryMaterialization === true ? {} : {
          expiryMaterialization: {
            state: 'scheduled' as const,
            credentialGeneration: options.credentialGeneration ?? options.bindingGeneration ?? 2,
            credentialExpiresAt: options.expiresAt ?? 20_000,
            scheduleNonce: Number.isFinite(options.expiresAt ?? 20_000)
              ? interactiveCredentialExpiryNonce({
                  bindingRef: options.credentialBindingRef ?? BINDING_REF,
                  credentialRef: CREDENTIAL_REF,
                  generation: options.credentialGeneration ?? options.bindingGeneration ?? 2,
                  expiresAt: options.expiresAt ?? 20_000,
                } as never)
              : 'sha256:invalid-expiry-fixture',
            scheduleRef: 'scheduled:interactive-credential-expiry',
            materializedAt: 6,
          },
        }),
        updatedAt: 5,
      }
      await ctx.db.insert('credentials', credential)
      if (options.duplicate === 'credential') {
        await ctx.db.insert('credentials', {
          ...credential,
          credentialRef: `crd_${'7'.repeat(32)}`,
          issueIdempotencyRef: 'credential:sam:duplicate',
        })
      }
    }

    if (options.omit !== 'principal') {
      const principal = {
        principalRef: PRINCIPAL_REF,
        kind: options.principalKind ?? 'human' as const,
        displayName: 'Sam canonical principal',
        lifecycle: options.principalLifecycle ?? 'active' as const,
        revision: 5,
        createdAt: 1,
        updatedAt: 4,
      }
      await ctx.db.insert('principals', principal)
      if (options.duplicate === 'principal') await ctx.db.insert('principals', principal)
    }

    const access = options.access ?? 'ownership'
    if ((access === 'membership' || options.staleActiveFormerOwner === true)
      && options.currentOwnerPrincipalRef === undefined) {
      await ctx.db.insert('principals', {
        principalRef: `prn_${'8'.repeat(32)}`,
        kind: 'human',
        displayName: 'Current owner principal',
        lifecycle: options.currentOwnerLifecycle ?? 'active',
        revision: 2,
        createdAt: 1,
        updatedAt: 2,
      })
    }

    if (options.omit !== 'access') {
      if (access === 'ownership') {
        await insertOwnership(ctx, options)
        if (options.duplicate === 'access') await insertOwnership(ctx, options, `own_${'7'.repeat(32)}`)
      } else {
        await insertMembership(ctx)
        if (options.duplicate === 'access') await insertMembership(ctx, `mem_${'7'.repeat(32)}`)
      }
    }
    if (options.addMembershipToOwnership === true) await insertMembership(ctx)

    if (options.omit !== 'account') {
      const account = {
        accountRef: ACCOUNT_REF,
        displayName: 'Canonical account',
        lifecycle: options.accountLifecycle ?? 'active' as const,
        recoveryPolicy: { kind: 'no_transfer' as const, revision: 1 },
        creationActorPrincipalRef: PRINCIPAL_REF,
        creationIdempotencyRef: 'account:sam',
        initialOwnershipRef: OWNERSHIP_REF,
        currentOwnershipRef: options.accountCurrentOwnershipRef
          ?? (options.staleActiveFormerOwner === true ? `own_${'9'.repeat(32)}` : OWNERSHIP_REF),
        revision: 4,
        createdAt: 1,
        updatedAt: 4,
        lastAction: {
          actorPrincipalRef: PRINCIPAL_REF,
          activeAccountRef: ACCOUNT_REF,
          correlationRef: 'account:sam',
          idempotencyRef: 'account:sam',
        },
      }
      await ctx.db.insert('accounts', account)
      if (options.duplicate === 'account') await ctx.db.insert('accounts', account)
    }

    if (access === 'membership' && options.omit !== 'currentOwnership') {
      await insertOwnership(ctx, options)
      if (options.duplicate === 'currentOwnership') {
        await insertOwnership(ctx, options, OWNERSHIP_REF)
      }
    }
    if (options.staleActiveFormerOwner === true) {
      await insertOwnership(ctx, {
        ...options,
        currentOwnerPrincipalRef: `prn_${'8'.repeat(32)}`,
      }, `own_${'9'.repeat(32)}`)
    }

    if (options.omit !== 'owner') {
      const owner = {
        clerkUserId: options.ownerLocator ?? 'legacy-owner-row',
        ...(options.omitOwnerProfile === true ? {} : {
          displayName: 'Canonical owner',
          emailHash: 'sha256:canonical',
        }),
        canonicalPrincipalRef: options.ownerPrincipalRef ?? PRINCIPAL_REF,
        canonicalAccountRef: options.ownerAccountRef ?? ACCOUNT_REF,
        createdAt: 1,
        updatedAt: options.ownerUpdatedAt ?? 9,
      }
      await ctx.db.insert('owners', owner)
      if (options.duplicate === 'owner') await ctx.db.insert('owners', owner)
    }
  })
}

async function insertOwnership(
  ctx: Parameters<Parameters<Backend['run']>[0]>[0],
  options: SeedOptions,
  ref = OWNERSHIP_REF,
): Promise<void> {
  await ctx.db.insert('accountOwnerships', {
    ownershipRef: ref,
    accountRef: options.currentOwnershipAccountRef ?? ACCOUNT_REF,
    ownerPrincipalRef: options.currentOwnerPrincipalRef
      ?? (options.access === 'membership' ? `prn_${'8'.repeat(32)}` : PRINCIPAL_REF),
    lifecycle: options.currentOwnershipLifecycle ?? 'active',
    changeKind: 'creation',
    revision: 3,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      correlationRef: 'ownership:sam',
      idempotencyRef: 'ownership:sam',
    },
  })
}

async function insertMembership(
  ctx: Parameters<Parameters<Backend['run']>[0]>[0],
  ref = MEMBERSHIP_REF,
): Promise<void> {
  await ctx.db.insert('memberships', {
    membershipRef: ref,
    accountRef: ACCOUNT_REF,
    memberPrincipalRef: PRINCIPAL_REF,
    lifecycle: 'active',
    revision: 8,
    createdAt: 1,
    createdBy: {
      actorPrincipalRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      correlationRef: 'membership:sam',
      idempotencyRef: 'membership:sam',
    },
  })
}

function identity(overrides: Partial<UserIdentity> = {}): UserIdentity {
  return {
    subject: 'user_sam',
    issuer: 'https://clerk.example.test',
    tokenIdentifier: TOKEN_IDENTIFIER,
    exp: 20,
    ...overrides,
  }
}
