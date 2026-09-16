import {
  makeFunctionReference,
  type UserIdentity,
} from 'convex/server'
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
  resolveInteractiveAuthorityContext,
} from '../../../convex/interactiveAuthority'
import {
  expectInitialProvisionedChain,
  insertProvisionedOwnerBusiness,
  provisionedIdentity as buildProvisionedIdentity,
  samIdentity,
  unpackSingleCanonicalChain,
} from '../../helpers/interactive-authority-provisioning'
import {
  collectAuthorityTables,
  createInteractiveAuthorityBackend as createBackend,
  expectInteractiveMaterialize as expectMaterialize,
  readMaterializeHandler as materializeHandler,
  readReconcileHandler as reconcileHandler,
  resolveInteractiveContext as resolveContext,
  revokeInteractiveCredential as revokeCanonicalCredential,
  runInteractiveBusinessActor as runBusinessActor,
  seededInteractiveAuthorityBackend as seededBackend,
  type InteractiveAuthoritySeedOptions as SeedOptions,
} from '../../helpers/interactive-authority-runtime'
import {
  INTERACTIVE_ACCOUNT_REF as ACCOUNT_REF,
  INTERACTIVE_AUTHORITY_NOW as NOW,
  INTERACTIVE_BINDING_REF as BINDING_REF,
  INTERACTIVE_CREDENTIAL_REF as CREDENTIAL_REF,
  INTERACTIVE_MEMBERSHIP_REF as MEMBERSHIP_REF,
  INTERACTIVE_OWNERSHIP_REF as OWNERSHIP_REF,
  INTERACTIVE_PRINCIPAL_REF as PRINCIPAL_REF,
  INTERACTIVE_TOKEN_IDENTIFIER as TOKEN_IDENTIFIER,
  seedInteractiveAuthority as seedAuthority,
} from '../../helpers/interactive-authority-seed'

const PROVISIONED_TOKEN = 'https://clerk.example.test|user_provisioned'
const identity = (overrides: Partial<UserIdentity> = {}) => samIdentity(TOKEN_IDENTIFIER, overrides)
const provisionedIdentity = (overrides: Partial<UserIdentity> = {}) =>
  buildProvisionedIdentity(PROVISIONED_TOKEN, overrides)
const ANONYMOUS_ACTOR = { kind: 'anonymous', anonymousBucket: 'convex:anonymous' } as const

const CANONICAL_REVISION = {
  binding: 7,
  credential: 6,
  principal: 5,
  account: 4,
  access: 3,
  currentOwnership: 3,
  currentOwnerPrincipal: 5,
} as const

const CANONICAL_PROVENANCE = {
  providerNamespace: 'clerk/user',
  bindingRef: BINDING_REF,
  credentialRef: CREDENTIAL_REF,
  credentialGeneration: 2,
  accessKind: 'ownership',
  accessRef: OWNERSHIP_REF,
  currentOwnershipRef: OWNERSHIP_REF,
  resolvedAt: NOW,
} as const

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

describe('interactive authority', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('canonical interactive authority', () => {
    it('resolves a frozen canonical owner context without treating Clerk claims as ownership', async () => {
      const backend = await seededBackend()
      const presented = identity({ subject: 'caller-shaped-subject' })
      const context = await resolveContext(backend, presented)

      expect(context).toEqual({
        principalRef: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF,
        revision: CANONICAL_REVISION,
        provenance: CANONICAL_PROVENANCE,
      })
      expect(context.principalRef).not.toBe('caller-shaped-subject')
      expect(context.accountRef).not.toBe(TOKEN_IDENTIFIER)

      const actor = await runBusinessActor(
        backend,
        async () => identity({ subject: 'caller-shaped-subject' }),
        true,
      )
      expect(actor).toStrictEqual({
        kind: 'authenticated_owner',
        canonicalPrincipalRef: PRINCIPAL_REF,
        canonicalAccountRef: ACCOUNT_REF,
        authorityRevision: context.revision,
        authorityProvenance: context.provenance,
      })
    })

    it('resolves exactly one active membership and preserves the current owner chain', async () => {
      const backend = await seededBackend({ access: 'membership' })
      const context = await resolveContext(backend)

      expect(context.provenance).toMatchObject({
        accessKind: 'membership',
        accessRef: MEMBERSHIP_REF,
      })
      expect(context.revision.access).toBe(8)
      expect(context.revision.currentOwnerPrincipal).toBe(2)
    })

    it('resolves current authenticated sessions only at the non-cached action boundary', async () => {
      const backend = createBackend()
      await expect(backend.withIdentity(identity()).action(resolveCurrentInteractiveAuthorityRef, {}))
        .resolves.toBeNull()
      await seedAuthority(backend)

      await expect(backend.action(resolveCurrentInteractiveAuthorityRef, {})).resolves.toBeNull()
      await expect(backend.withIdentity(identity()).action(resolveCurrentInteractiveAuthorityRef, {}))
        .resolves.toMatchObject({
          principalRef: PRINCIPAL_REF,
          accountRef: ACCOUNT_REF,
        })
    })

    it.each([
      ['owner', true, { access: 'ownership' }, identity()],
      ['member', true, { access: 'membership' }, identity()],
      ['workload', false, { principalKind: 'workload' }, identity()],
      ['missing_workload', false, { omit: 'principal' }, identity()],
      ['stranger', false, {}, identity({ tokenIdentifier: 'https://clerk.example.test|user_stranger' })],
      ['wrong_account', false, { currentOwnershipAccountRef: `acc_${'b'.repeat(32)}` }, identity()],
      ['stale_generation', false, { bindingGeneration: 3, credentialGeneration: 2 }, identity()],
    ] as const)(
      'evaluates %s through the registered trusted-time action without mutating authority facts',
      async (_caseKind, allowed, options, presentedIdentity) => {
        const backend = await seededBackend(options as SeedOptions)
        const before = await collectAuthorityTables(backend)
        const result = backend.withIdentity(presentedIdentity).action(
          resolveCurrentInteractiveAuthorityRef,
          {},
        )

        if (allowed) {
          await expect(result).resolves.toMatchObject({
            principalRef: PRINCIPAL_REF,
            accountRef: ACCOUNT_REF,
          })
        } else {
          await expect(result).resolves.toBeNull()
        }
        await expect(collectAuthorityTables(backend)).resolves.toEqual(before)
      },
    )

    it('expires authority after a cached fact read without accepting caller-shaped time', async () => {
      const backend = await seededBackend({ expiresAt: NOW + 1_000 })
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
      const backend = await seededBackend({ expiresAt: NOW + 1_000 })

      await expect(runBusinessActor(backend, async () => identity({ exp: 11 })))
        .resolves.toMatchObject({ kind: 'authenticated_owner' })

      vi.setSystemTime(NOW + 1_000)
      // Convex returns null once its verified Clerk JWT has expired, even if a
      // durable scheduled callback has not yet changed the credential row.
      await expect(runBusinessActor(backend, async () => null)).resolves.toEqual(ANONYMOUS_ACTOR)
      // A still-valid token cannot bridge the gap unless its verified expiry is
      // exactly the canonical credential expiry persisted for this generation.
      await expect(runBusinessActor(backend, async () => identity({ exp: 12 })))
        .resolves.toEqual(ANONYMOUS_ACTOR)
    })

    it('invalidates account-scoped reads when the canonical credential is revoked', async () => {
      const backend = await seededBackend()
      await expect(runBusinessActor(backend, async () => identity()))
        .resolves.toMatchObject({ kind: 'authenticated_owner' })
      await revokeCanonicalCredential(backend, NOW)
      await expect(runBusinessActor(backend, async () => identity())).resolves.toEqual(ANONYMOUS_ACTOR)
    })

    it.each([
      [
        'preserves authenticated account-scoped queries from materialized current facts',
        {},
        {
          kind: 'authenticated_owner',
          canonicalPrincipalRef: PRINCIPAL_REF,
          canonicalAccountRef: ACCOUNT_REF,
          authorityProvenance: { resolvedAt: 6 },
        },
      ],
      [
        'fails unmaterialized credential rollout rows closed without a legacy fallback',
        { omitExpiryMaterialization: true },
        ANONYMOUS_ACTOR,
      ],
    ] as const)('%s', async (_title, seedOptions, expected) => {
      const backend = await seededBackend(seedOptions)
      await expect(runBusinessActor(backend, async () => identity())).resolves.toMatchObject(expected)
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
      ['authority_fact_invalid', { bindingRevision: -1 }],
      ['authority_fact_invalid', { bindingRevision: 1.5 }],
      ['authority_fact_invalid', { bindingGeneration: 0 }],
    ] as const)('rejects %s authority facts', async (code, options) => {
      const backend = await seededBackend(options as SeedOptions)
      await expect(resolveContext(backend)).rejects.toMatchObject({
        name: 'InteractiveAuthorityError',
        code,
      })
    })

    it('rejects an identity without a stable token identifier before reading authority', async () => {
      const backend = createBackend()
      await expect(backend.run(async (ctx) => resolveInteractiveAuthorityContext(
        ctx.db,
        { subject: 'user_sam', issuer: 'https://clerk.example.test' } as UserIdentity,
      ))).rejects.toEqual(new InteractiveAuthorityError('identity_invalid'))
      await expect(backend.run(async (ctx) => resolveInteractiveAuthorityContext(
        ctx.db,
        identity({ tokenIdentifier: '   ' }),
      ))).rejects.toEqual(new InteractiveAuthorityError('identity_invalid'))
    })

    it('keeps the registered materializer fail closed across changing identity facts', async () => {
      const cases = [
        { secondToken: '   ', alternateBinding: false },
        { secondToken: 'https://clerk.example.test|user_missing_binding', alternateBinding: false },
        { secondToken: 'https://clerk.example.test|user_missing_credential', alternateBinding: true },
      ] as const
      const handler = materializeHandler()

      for (const testCase of cases) {
        const backend = await seededBackend({ omitExpiryMaterialization: true })
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
      const unexpected = new Error('database_unavailable')
      await expect(materializeHandler()({
        auth: { getUserIdentity: async () => identity() },
        db: { query: () => { throw unexpected } },
        scheduler: {},
      }, {})).rejects.toBe(unexpected)

      const backend = await seededBackend()
      const expected = await resolveContext(backend)
      const reconcile = reconcileHandler()
      await expect(backend.run(async (ctx) => reconcile(
        { db: ctx.db },
        { authority: expected },
      ))).resolves.toMatchObject({
        principalRef: PRINCIPAL_REF,
        accountRef: ACCOUNT_REF,
      })
      await expect(backend.run(async (ctx) => reconcile(
        { db: ctx.db },
        { authority: { ...expected, accountRef: `acc_${'9'.repeat(32)}` } },
      ))).resolves.toBeNull()
      await expect(backend.run(async (ctx) => reconcile(
        { db: ctx.db },
        { authority: { ...expected, provenance: { ...expected.provenance, bindingRef: 'invalid' } } },
      ))).resolves.toBeNull()
    })
  })

  describe('owner identity provisioning', () => {
    it('provisions a verified identity exactly once and resolves the full authority chain', async () => {
      const backend = createBackend()
      const owner = backend.withIdentity(provisionedIdentity())

      await expectMaterialize(owner, true)

      const provisioned = await collectAuthorityTables(backend)
      const chain = unpackSingleCanonicalChain(provisioned)
      expectInitialProvisionedChain(chain, PROVISIONED_TOKEN, 'user_provisioned')

      await expectMaterialize(owner, true)
      await expect(collectAuthorityTables(backend)).resolves.toEqual(provisioned)

      const context = await resolveContext(backend, provisionedIdentity())
      expect(context).toMatchObject({
        principalRef: chain.principal.principalRef,
        accountRef: chain.account.accountRef,
        provenance: {
          providerNamespace: 'clerk/user',
          bindingRef: chain.binding.bindingRef,
          credentialGeneration: 1,
          accessKind: 'ownership',
          currentOwnershipRef: chain.ownership.ownershipRef,
        },
      })

      await insertProvisionedOwnerBusiness(backend, chain.account.accountRef, PROVISIONED_TOKEN)
      await expect(runBusinessActor(
        backend,
        async () => provisionedIdentity(),
        true,
      )).resolves.toMatchObject({
        kind: 'authenticated_owner',
        canonicalPrincipalRef: chain.principal.principalRef,
        canonicalAccountRef: chain.account.accountRef,
      })
    })

    it('removes session access on sign-out and restores the same account on a later sign-in', async () => {
      // Requires: a verified owner identity with a stable Clerk tokenIdentifier
      // and a fresh, valid token window.
      // Ensures: sign-out has no current authority; a later valid sign-in resolves
      // the original canonical Account, Principal, Ownership, and binding.
      // Invariant: sign-out does not delete or rewrite durable identity facts.
      // On violation: materialization refuses or any duplicate canonical row is a
      // failing observable result.
      const backend = createBackend()
      const firstSession = backend.withIdentity(provisionedIdentity({ exp: 20 }))

      await expectMaterialize(firstSession, true)
      const beforeSignOut = await collectAuthorityTables(backend)
      const before = unpackSingleCanonicalChain(beforeSignOut)

      await expect(backend.mutation(
        api.interactiveAuthority.materializeCurrentInteractiveAuthority,
        {},
      )).resolves.toBe(false)
      await expect(backend.action(resolveCurrentInteractiveAuthorityRef, {}))
        .resolves.toBeNull()
      await expect(collectAuthorityTables(backend)).resolves.toEqual(beforeSignOut)

      const laterSession = backend.withIdentity(provisionedIdentity({ exp: 30 }))
      await expectMaterialize(laterSession, true)

      const afterSignIn = await collectAuthorityTables(backend)
      expect(afterSignIn.memberships).toEqual([])
      expect(afterSignIn.bindings).toHaveLength(1)
      expect(afterSignIn.principals).toHaveLength(1)
      expect(afterSignIn.accounts).toHaveLength(1)
      expect(afterSignIn.ownerships).toHaveLength(1)
      expect(afterSignIn.bindings[0]).toMatchObject({
        bindingRef: before.binding.bindingRef,
        principalRef: before.principal.principalRef,
        providerIdentifier: before.binding.providerIdentifier,
        credentialGeneration: 2,
      })
      expect(afterSignIn.principals[0]).toMatchObject({
        principalRef: before.principal.principalRef,
      })
      expect(afterSignIn.accounts[0]).toMatchObject({
        accountRef: before.account.accountRef,
      })
      expect(afterSignIn.ownerships[0]).toMatchObject({
        ownershipRef: before.ownership.ownershipRef,
        accountRef: before.account.accountRef,
        ownerPrincipalRef: before.principal.principalRef,
      })
      await expect(laterSession.action(resolveCurrentInteractiveAuthorityRef, {}))
        .resolves.toMatchObject({
          principalRef: before.principal.principalRef,
          accountRef: before.account.accountRef,
        })
    })

    it('keeps simultaneous first materializations on one canonical identity chain', async () => {
      // Requires: two verified sessions presenting the same stable Clerk
      // tokenIdentifier while no canonical authority rows exist.
      // Ensures: both calls succeed and converge on one Account, Principal,
      // Ownership, binding, and active credential chain.
      // Invariant: the first-login race never creates a second Account or
      // re-keys the canonical identity.
      // On violation: either call refuses or any duplicate canonical row fails.
      const backend = createBackend()
      const firstSession = backend.withIdentity(provisionedIdentity({ exp: 20 }))
      const simultaneousSession = backend.withIdentity(provisionedIdentity({ exp: 20 }))

      await expect(Promise.all([
        firstSession.mutation(
          api.interactiveAuthority.materializeCurrentInteractiveAuthority,
          {},
        ),
        simultaneousSession.mutation(
          api.interactiveAuthority.materializeCurrentInteractiveAuthority,
          {},
        ),
      ])).resolves.toEqual([true, true])

      const provisioned = await collectAuthorityTables(backend)
      const chain = unpackSingleCanonicalChain(provisioned)
      expect(chain.binding).toMatchObject({
        providerIdentifier: PROVISIONED_TOKEN,
        principalRef: chain.principal.principalRef,
        credentialGeneration: 1,
      })
      expect(chain.ownership).toMatchObject({
        accountRef: chain.account.accountRef,
        ownerPrincipalRef: chain.principal.principalRef,
      })
      expect(chain.credential).toMatchObject({
        bindingRef: chain.binding.bindingRef,
        principalRef: chain.principal.principalRef,
        generation: 1,
        lifecycle: 'active',
      })
      await expect(simultaneousSession.action(resolveCurrentInteractiveAuthorityRef, {}))
        .resolves.toMatchObject({
          principalRef: chain.principal.principalRef,
          accountRef: chain.account.accountRef,
        })
    })

    it('rotates the credential generation for a fresh verified token window without re-keying identity', async () => {
      const backend = createBackend()
      const owner = backend.withIdentity(provisionedIdentity())
      await expectMaterialize(owner, true)
      const provisioned = await collectAuthorityTables(backend)
      const chain = unpackSingleCanonicalChain(provisioned)

      await expectMaterialize(backend.withIdentity(provisionedIdentity({ exp: 40 })), true)

      const rotated = await collectAuthorityTables(backend)
      expect(rotated.bindings).toEqual([{
        ...chain.binding,
        credentialGeneration: 2,
        revision: chain.binding.revision + 1,
      }])
      expect(rotated.principals).toEqual(provisioned.principals)
      expect(rotated.accounts).toEqual(provisioned.accounts)
      expect(rotated.ownerships).toEqual(provisioned.ownerships)
      expect(rotated.credentials).toHaveLength(2)
      const previous = rotated.credentials.find(({ generation }) => generation === 1)
      const current = rotated.credentials.find(({ generation }) => generation === 2)
      expect(previous).toMatchObject({ lifecycle: 'stale', staleAt: NOW })
      expect(current).toMatchObject({
        bindingRef: chain.binding.bindingRef,
        principalRef: chain.principal.principalRef,
        type: 'provider_token',
        lifecycle: 'active',
        generation: 2,
        issuedAt: NOW,
        expiresAt: 40_000,
        predecessorCredentialRef: previous!.credentialRef,
      })
      expect(current!.expiryMaterialization).toMatchObject({
        state: 'scheduled',
        credentialGeneration: 2,
        credentialExpiresAt: 40_000,
      })

      const context = await resolveContext(backend, provisionedIdentity({ exp: 40 }))
      expect(context).toMatchObject({
        principalRef: chain.principal.principalRef,
        accountRef: chain.account.accountRef,
        provenance: {
          credentialGeneration: 2,
          currentOwnershipRef: chain.ownership.ownershipRef,
        },
      })
    })

    it('anchors the credential window on the server clock when the identity carries no exp claim', async () => {
      const backend = createBackend()
      const owner = backend.withIdentity(provisionedIdentity({ exp: undefined }))

      await expectMaterialize(owner, true)
      const provisioned = await collectAuthorityTables(backend)
      const chain = unpackSingleCanonicalChain(provisioned)
      expect(chain.credential).toMatchObject({
        bindingRef: chain.binding.bindingRef,
        type: 'provider_token',
        lifecycle: 'active',
        generation: 1,
        issuedAt: NOW,
        expiresAt: NOW + 60_000,
      })
      expect(chain.credential.expiryMaterialization).toMatchObject({
        state: 'scheduled',
        credentialGeneration: 1,
        credentialExpiresAt: NOW + 60_000,
      })

      // Two materialize calls within one page load observe the same live
      // window and must not churn the credential generation.
      vi.setSystemTime(NOW + 5_000)
      await expectMaterialize(owner, true)
      await expect(collectAuthorityTables(backend)).resolves.toEqual(provisioned)
      await expect(resolveContext(backend, provisionedIdentity({ exp: undefined })))
        .resolves.toMatchObject({ provenance: { credentialGeneration: 1 } })

      // Idle past the window: the next verified presentation re-issues the
      // generation with a fresh server-anchored window.
      vi.setSystemTime(NOW + 60_000)
      await expectMaterialize(owner, true)
      const rotated = await collectAuthorityTables(backend)
      expect(rotated.credentials).toHaveLength(2)
      const previous = rotated.credentials.find(({ generation }) => generation === 1)
      const current = rotated.credentials.find(({ generation }) => generation === 2)
      expect(previous).toMatchObject({ lifecycle: 'stale', staleAt: NOW + 60_000 })
      expect(current).toMatchObject({
        lifecycle: 'active',
        generation: 2,
        issuedAt: NOW + 60_000,
        expiresAt: NOW + 120_000,
      })
      await expect(resolveContext(backend, provisionedIdentity({ exp: undefined })))
        .resolves.toMatchObject({ provenance: { credentialGeneration: 2 } })

      // A lapsed window still denies wall-clock reads.
      vi.setSystemTime(NOW + 120_000)
      await expect(resolveContext(backend, provisionedIdentity({ exp: undefined })))
        .rejects.toEqual(new InteractiveAuthorityError('credential_not_current'))
    })
  })
})
