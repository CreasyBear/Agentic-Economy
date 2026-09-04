/// <reference types="vite/client" />
import { makeFunctionReference } from 'convex/server'
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MutationCtx } from '../../../convex/_generated/server'
import {
  resolveCanonicalAgentBinding,
  type CanonicalAgentBinding,
} from '../../../convex/authorityBoundary'
import schema from '../../../convex/schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { DelegationService } from '@/modules/authority/delegation/public'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
  sourceWriteCommandDigest,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const resolveAgentBinding = makeFunctionReference<'mutation', MutationArgs, CanonicalAgentBinding | null>(
  'authorityBoundary:resolveAgentBinding',
)

const NOW = 1_900_000_000_000
const PRINCIPAL_REF = `prn_${'1'.repeat(32)}`
const OTHER_PRINCIPAL_REF = `prn_${'2'.repeat(32)}`
const ACCOUNT_REF = `acc_${'3'.repeat(32)}`
const OTHER_ACCOUNT_REF = `acc_${'4'.repeat(32)}`
const BINDING_REF = `eib_${'5'.repeat(32)}`
const CREDENTIAL_REF = `crd_${'6'.repeat(32)}`
const GRANT_REF = `grt_${'7'.repeat(32)}`
const PARENT_GRANT_REF = `grt_${'a'.repeat(32)}`
const OWNERSHIP_REF = `own_${'9'.repeat(32)}`
const SECRET = 'authority-boundary-source-write-secret-32-bytes'
const ACCESS_POLICY = {
  format: 'ae.agent-access-policy:v2' as const,
  operationAccess: 'all_admitted' as const,
  operationRefs: [] as string[],
  environment: 'production' as const,
  budget: {
    budgetPolicyRef: 'budget:authority-boundary',
    generation: 4,
    currency: 'USD',
    exponent: 2,
    maximumSpendPerInvocation: { currency: 'USD', units: '100', exponent: 2 },
    maximumDailySpend: { currency: 'USD', units: '1000', exponent: 2 },
    maximumMonthlySpend: { currency: 'USD', units: '10000', exponent: 2 },
    maximumConcurrentInvocations: 2,
  },
  rate: {
    ratePolicyRef: 'rate:authority-boundary',
    generation: 4,
    maximumCallsPerMinute: 10,
    maximumCallsPerHour: 100,
  },
}
const ACCESS_POLICY_DIGEST = canonicalDigest(ACCESS_POLICY as never)

type MutationArgs = Readonly<{
  credentialId: string
  applicationRef: string
  environment: 'sandbox' | 'production'
  scopes: readonly string[]
  requiredScopes: readonly string[]
  authorityMode: 'inspect_only' | 'approve_each' | 'bounded_mandate' | 'full_yolo'
  operationKey: string
  correlationId: string
  sourceWrite?: Readonly<Record<string, unknown>>
  sourceWriteRequest?: Readonly<Record<string, unknown>>
}>

type SeedOverrides = Readonly<{
  accessKind?: 'owner' | 'member'
  binding?: Readonly<Record<string, unknown>> | null
  credential?: Readonly<Record<string, unknown>> | null
  principal?: Readonly<Record<string, unknown>> | null
  grant?: Readonly<Record<string, unknown>> | null
  parentGrant?: Readonly<Record<string, unknown>> | null
  secondGrant?: Readonly<Record<string, unknown>> | null
  account?: Readonly<Record<string, unknown>> | null
  admission?: Readonly<Record<string, unknown>> | null
  accessGrant?: Readonly<Record<string, unknown>> | null
}>

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('canonical agent authority boundary', () => {
  it.each([
    ['owner', { accessKind: 'owner', principal: { kind: 'human' } }, {}],
    ['member', { accessKind: 'member', principal: { kind: 'human' } }, {}],
    ['workload', {}, {}],
    ['missing_workload', { binding: null }, {}],
    ['stranger', {}, { credentialId: 'ak_live_stranger' }],
    ['wrong_account', { grant: { accountRef: OTHER_ACCOUNT_REF } }, {}],
    ['stale_generation', { binding: { credentialGeneration: 2 } }, {}],
  ] satisfies readonly (readonly [
    'owner' | 'member' | 'workload' | 'missing_workload' | 'stranger' | 'wrong_account' | 'stale_generation',
    SeedOverrides,
    Partial<MutationArgs>,
  ])[])(
    'drives the %s isolation case through the registered mutation and commits no denied authority snapshot',
    async (caseKind, overrides, inputPatch) => {
      vi.stubEnv('AE_SOURCE_WRITE_SECRET', SECRET)
      const backend = testBackend()
      await seedCanonicalChain(backend, overrides)
      const args = await signedMutationArgs(inputPatch, `authority-boundary-isolation:${caseKind}`)

      const result = await backend.mutation(resolveAgentBinding, args)
      const allowed = caseKind === 'workload'
      if (allowed) {
        expect(result).toMatchObject({
          principalId: PRINCIPAL_REF,
          ownerId: ACCOUNT_REF,
          grantGeneration: 4,
        })
      } else {
        expect(result).toBeNull()
      }

      const durable = await backend.run(async (ctx) => ({
        snapshots: await ctx.db.query('authorityDelegationSnapshots').collect(),
        nonces: await ctx.db.query('sourceWriteNonces').collect(),
      }))
      expect(durable.snapshots).toHaveLength(allowed ? 1 : 0)
      expect(durable.nonces).toHaveLength(1)
    },
  )

  it('resolves an API-key locator through canonical current authority without caller-selected ownership', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend)

    const result = await runResolver(backend, {
      scopes: ['operations:read', 'operations:invoke'],
      requiredScopes: ['operations:invoke'],
    })

    expect(result).toEqual({
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      credentialId: 'ak_live_locator',
      canonicalCredentialRef: CREDENTIAL_REF,
      grantRef: GRANT_REF,
      grantGeneration: 4,
      snapshotRef: expect.stringMatching(/^das_[0-9a-f]{32}$/u),
      applicationRef: 'agent-application',
      environment: 'production',
      scopes: ['operations:invoke'],
      authorityMode: 'bounded_mandate',
    })
    expect(result?.principalId).not.toBe(OTHER_PRINCIPAL_REF)
    expect(result?.ownerId).not.toBe(OTHER_ACCOUNT_REF)
  })

  it('coarsens successful credential evidence to one timestamp and audit event per 15 minutes', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend, {
      credential: { expiresAt: NOW + 3_600_000 },
      admission: { expiresAt: NOW + 3_600_000 },
      grant: { expiresAt: NOW + 3_600_000 },
      parentGrant: { expiresAt: NOW + 7_200_000 },
    })

    await expect(runResolver(backend, { correlationId: 'correlation:auth:first' }))
      .resolves.toMatchObject({ canonicalCredentialRef: CREDENTIAL_REF })
    vi.setSystemTime(NOW + 14 * 60 * 1_000)
    await expect(runResolver(backend, { correlationId: 'correlation:auth:within-window' }))
      .resolves.toMatchObject({ canonicalCredentialRef: CREDENTIAL_REF })

    const withinWindow = await backend.run(async (ctx) => ({
      credential: await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', CREDENTIAL_REF)).unique(),
      events: await ctx.db.query('auditEvents').collect(),
    }))
    expect(withinWindow.credential?.lastAuthenticatedAt).toBe(NOW)
    expect(withinWindow.events).toEqual([expect.objectContaining({
      eventType: 'agent.credential.authenticated',
      actorKind: 'agent',
      actorRef: PRINCIPAL_REF,
      targetRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      afterState: 'authenticated',
    })])

    vi.setSystemTime(NOW + 15 * 60 * 1_000)
    await expect(runResolver(backend, { correlationId: 'correlation:auth:next-window' }))
      .resolves.toMatchObject({ canonicalCredentialRef: CREDENTIAL_REF })
    const nextWindow = await backend.run(async (ctx) => ({
      credential: await ctx.db.query('credentials')
        .withIndex('by_credentialRef', (query) => query.eq('credentialRef', CREDENTIAL_REF)).unique(),
      events: await ctx.db.query('auditEvents').order('asc').collect(),
    }))
    expect(nextWindow.credential?.lastAuthenticatedAt).toBe(NOW + 15 * 60 * 1_000)
    expect(nextWindow.events).toHaveLength(2)
    expect(JSON.stringify(nextWindow.events)).not.toContain('ak_live_locator')
  })

  it('coarsens known-credential denials by canonical credential and five-minute bucket', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend, {
      credential: { expiresAt: NOW + 3_600_000 },
      admission: { expiresAt: NOW + 3_600_000 },
      grant: { scopes: ['operations:read'], expiresAt: NOW + 3_600_000 },
      parentGrant: { expiresAt: NOW + 7_200_000 },
    })

    await expect(runResolver(backend, { correlationId: 'correlation:deny:scope' })).resolves.toBeNull()
    await backend.run(async (ctx) => {
      const binding = await ctx.db.query('externalIdentityBindings')
        .withIndex('by_bindingRef', (query) => query.eq('bindingRef', BINDING_REF)).unique()
      if (binding === null) throw new Error('binding_missing')
      await ctx.db.patch(binding._id, { providerState: { kind: 'known', value: 'disabled' } })
    })
    vi.setSystemTime(NOW + 1_000)
    await expect(runResolver(backend, { correlationId: 'correlation:deny:authentication' })).resolves.toBeNull()

    const firstBucket = await backend.run(async (ctx) => await ctx.db.query('auditEvents').collect())
    expect(firstBucket).toEqual([expect.objectContaining({
      eventType: 'agent.credential.denied',
      actorKind: 'agent',
      actorRef: PRINCIPAL_REF,
      targetRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      reasonCode: 'scope_required',
      afterState: 'denied',
    })])
    expect(JSON.stringify(firstBucket)).not.toContain('ak_live_locator')

    const nextBucket = (Math.floor(NOW / (5 * 60 * 1_000)) + 1) * 5 * 60 * 1_000
    vi.setSystemTime(nextBucket)
    await expect(runResolver(backend, { correlationId: 'correlation:deny:next-bucket' })).resolves.toBeNull()
    await expect(backend.run(async (ctx) => await ctx.db.query('auditEvents').collect()))
      .resolves.toHaveLength(2)
  })

  it('creates no credential, audit, or authority row for an unknown credential locator', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend)
    const before = await durableCounts(backend)

    await expect(runResolver(backend, {
      credentialId: 'ak_live_unknown_locator',
      correlationId: 'correlation:unknown-key',
    })).resolves.toBeNull()

    expect(await durableCounts(backend)).toEqual(before)
  })

  it('admits a concrete operation surface through a wildcard resource grant', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend, {
      grant: { parentGrantRef: undefined, parentGeneration: undefined, resourceRefs: ['*'] },
      parentGrant: null,
    })

    await expect(runResolver(backend, {
      operationKey: 'surface:http:operations-call',
    })).resolves.toMatchObject({
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      grantRef: GRANT_REF,
    })
  })

  it.each([
    ['credential locator', { credentialId: '' }],
    ['application ref', { applicationRef: '../application' }],
    ['operation key', { operationKey: 'bad operation' }],
    ['correlation id', { correlationId: '' }],
    ['duplicate scopes', { scopes: ['operations:invoke', 'operations:invoke'] }],
    ['invalid scope', { scopes: ['operations invoke'] }],
    ['empty required scopes', { requiredScopes: [] }],
    ['missing requested required scope', { scopes: ['operations:read'] }],
    ['too many scopes', { scopes: Array.from({ length: 65 }, (_, index) => `scope:${index}`) }],
    ['unknown environment', { environment: 'staging' }],
    ['unknown authority mode', { authorityMode: 'root' }],
  ])('rejects malformed %s before the first database read', async (_name, patch) => {
    const query = vi.fn(() => {
      throw new Error('database_must_not_be_read')
    })
    const result = await resolveCanonicalAgentBinding(
      { db: { query } } as unknown as MutationCtx,
      { ...validInput(), ...patch } as Parameters<typeof resolveCanonicalAgentBinding>[1],
    )

    expect(result).toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects an invalid server clock before reading authority state', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Number.NaN)
    const query = vi.fn(() => {
      throw new Error('database_must_not_be_read')
    })

    await expect(resolveCanonicalAgentBinding(
      { db: { query } } as unknown as MutationCtx,
      validInput(),
    )).resolves.toBeNull()
    expect(query).not.toHaveBeenCalled()
  })

  it.each([
    ['missing binding', { binding: null }],
    ['revoked binding', { binding: { lifecycle: 'revoked' } }],
    ['unknown provider state', { binding: { providerState: { kind: 'unknown', value: 'provider_pending' } } }],
    ['disabled provider state', { binding: { providerState: { kind: 'known', value: 'disabled' } } }],
    ['invalid current credential generation', {
      binding: { credentialGeneration: -1 },
      credential: { generation: -1 },
    }],
    ['missing current credential generation', { credential: null }],
    ['credential principal mismatch', { credential: { principalRef: OTHER_PRINCIPAL_REF } }],
    ['wrong credential type', { credential: { type: 'provider_token' } }],
    ['expired credential', { credential: { expiresAt: NOW } }],
    ['missing principal', { principal: null }],
    ['suspended principal', { principal: { lifecycle: 'suspended' } }],
    ['missing live grant', { grant: null }],
    ['stale admission grant generation', { admission: { grantGeneration: 3 } }],
    ['expired grant', { grant: { expiresAt: NOW } }],
    ['grant missing required scope', { grant: { scopes: ['operations:read'] } }],
    ['grant missing required resource', { grant: { resourceRefs: ['operations:read'] } }],
    ['invalid grant generation', { grant: { generation: -1 } }],
    ['missing account', { account: null }],
    ['suspended account', { account: { lifecycle: 'suspended' } }],
  ] satisfies readonly (readonly [string, SeedOverrides])[])(
    'fails closed for %s',
    async (_name, overrides) => {
      const backend = testBackend()
      await seedCanonicalChain(backend, overrides)
      await expect(runResolver(backend)).resolves.toBeNull()
    },
  )

  it('uses the exact current access grant when another delegation also authorizes the consequence', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend, {
      secondGrant: {
        grantRef: `grt_${'8'.repeat(32)}`,
        generation: 2,
      },
    })

    await expect(runResolver(backend)).resolves.toMatchObject({
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      grantRef: GRANT_REF,
      grantGeneration: 4,
    })
  })

  it.each([
    ['revoked ancestor', {
      parentGrant: {
        lifecycle: 'revoked',
        revokedAt: NOW - 1_000,
        revokedBy: {
          actorPrincipalRef: OTHER_PRINCIPAL_REF,
          activeAccountRef: ACCOUNT_REF,
          correlationRef: 'correlation:revoke',
          idempotencyRef: 'idempotency:revoke',
        },
      },
    }],
    ['stale ancestor generation', { grant: { parentGeneration: 1 } }],
  ] satisfies readonly (readonly [string, SeedOverrides])[])(
    'rejects a %s instead of trusting only the live leaf',
    async (_name, overrides) => {
      const backend = testBackend()
      await seedCanonicalChain(backend, overrides)
      await expect(runResolver(backend)).resolves.toBeNull()
    },
  )

  it('uses consequence-time server authority rather than an admission-start timestamp', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend, {
      credential: { expiresAt: NOW + 500 },
      grant: { expiresAt: NOW + 500 },
    })
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 1_000)

    await expect(runResolver(backend)).resolves.toBeNull()
  })

  it('fails closed when the pinned snapshot does not match the selected current generation', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend)
    vi.spyOn(DelegationService.prototype, 'admitConsequence').mockResolvedValue({
      snapshotRef: `das_${'c'.repeat(32)}`,
      grantRef: GRANT_REF,
      generation: 5,
      accountRef: ACCOUNT_REF,
      accountRevision: 1,
      actorPrincipalRef: PRINCIPAL_REF,
      subjectPrincipalRef: PRINCIPAL_REF,
      scopes: ['operations:invoke'],
      resourceRefs: ['operations:invoke'],
      budgetAmount: 0,
      admittedAt: NOW,
      expiresAt: NOW + 1_000,
      correlationRef: 'correlation:invoke:1',
      idempotencyRef: 'correlation:invoke:1',
      ancestry: [],
    } as never)

    await expect(runResolver(backend)).resolves.toBeNull()
  })

  it('propagates non-domain persistence failures so the mutation transaction rolls back', async () => {
    const backend = testBackend()
    await seedCanonicalChain(backend)
    vi.spyOn(DelegationService.prototype, 'admitConsequence')
      .mockRejectedValue(new Error('persistence_unavailable'))

    await expect(runResolver(backend)).rejects.toThrow('persistence_unavailable')
  })

  it.each([
    ['principal', { principal: { principalRef: 'caller-principal' } }],
    ['account', { account: { accountRef: 'caller-account' } }],
    ['credential', { credential: { credentialRef: 'caller-credential' } }],
    ['grant', { grant: { grantRef: 'caller-grant' } }],
  ] satisfies readonly (readonly [string, SeedOverrides])[])(
    'fails closed for malformed persisted %s provenance',
    async (_name, overrides) => {
      const backend = testBackend()
      await seedCanonicalChain(backend, overrides)
      await expect(runResolver(backend)).resolves.toBeNull()
    },
  )

  it('requires exact source-write admission for the registered production mutation', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', SECRET)
    const backend = testBackend()
    await seedCanonicalChain(backend)

    await expect(backend.mutation(resolveAgentBinding, validInput())).rejects.toThrow(
      'canonical_agent_binding_source_write_rejected:missing_source_write_admission',
    )
    await expect(backend.mutation(resolveAgentBinding, {
      ...validInput(),
      applicationRef: 'invalid application',
    })).resolves.toBeNull()

    const args = await signedMutationArgs()
    await expect(backend.mutation(resolveAgentBinding, args)).resolves.toMatchObject({
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      grantGeneration: 4,
    })
  })
})

function testBackend() {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  return convexTest(schema, convexModules)
}

function validInput(): MutationArgs {
  return {
    credentialId: 'ak_live_locator',
    applicationRef: 'agent-application',
    environment: 'production',
    scopes: ['operations:invoke'],
    requiredScopes: ['operations:invoke'],
    authorityMode: 'bounded_mandate',
    operationKey: 'operations:invoke',
    correlationId: 'correlation:invoke:1',
  }
}

async function runResolver(
  backend: ReturnType<typeof testBackend>,
  patch: Partial<MutationArgs> = {},
): Promise<CanonicalAgentBinding | null> {
  return await backend.run((ctx) => resolveCanonicalAgentBinding(
    ctx as unknown as MutationCtx,
    { ...validInput(), ...patch },
  ))
}

async function durableCounts(backend: ReturnType<typeof testBackend>) {
  return await backend.run(async (ctx) => ({
    credentials: (await ctx.db.query('credentials').collect()).length,
    audits: (await ctx.db.query('auditEvents').collect()).length,
    principals: (await ctx.db.query('principals').collect()).length,
    admissions: (await ctx.db.query('agentAccessPrincipals').collect()).length,
    snapshots: (await ctx.db.query('authorityDelegationSnapshots').collect()).length,
  }))
}

async function seedCanonicalChain(
  backend: ReturnType<typeof testBackend>,
  overrides: SeedOverrides = {},
): Promise<void> {
  await backend.run(async (ctx) => {
    const action = {
      actorPrincipalRef: PRINCIPAL_REF,
      activeAccountRef: ACCOUNT_REF,
      correlationRef: 'correlation:seed',
      idempotencyRef: 'idempotency:seed',
    }
    const grantAction = {
      ...action,
      actorPrincipalRef: OTHER_PRINCIPAL_REF,
    }
    const binding = mergeRow({
      bindingRef: BINDING_REF,
      principalRef: PRINCIPAL_REF,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: 'ak_live_locator',
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 3,
      bindIdempotencyRef: 'idempotency:binding',
      revision: 1,
      createdAt: NOW - 10_000,
      updatedAt: NOW - 10_000,
    }, overrides.binding)
    const credential = mergeRow({
      credentialRef: CREDENTIAL_REF,
      bindingRef: BINDING_REF,
      principalRef: PRINCIPAL_REF,
      type: 'api_key',
      lifecycle: 'active',
      generation: 3,
      issueIdempotencyRef: 'idempotency:credential',
      revision: 1,
      issuedAt: NOW - 9_000,
      expiresAt: NOW + 60_000,
      updatedAt: NOW - 9_000,
    }, overrides.credential)
    const principal = mergeRow({
      principalRef: PRINCIPAL_REF,
      kind: 'agent',
      displayName: 'Canonical Agent',
      lifecycle: 'active',
      revision: 1,
      createdAt: NOW - 20_000,
      updatedAt: NOW - 20_000,
    }, overrides.principal)
    const grant = mergeRow({
      grantRef: GRANT_REF,
      accountRef: ACCOUNT_REF,
      actorPrincipalRef: OTHER_PRINCIPAL_REF,
      subjectPrincipalRef: PRINCIPAL_REF,
      parentGrantRef: PARENT_GRANT_REF,
      parentGeneration: 2,
      scopes: ['operations:invoke', 'operations:read'],
      resourceRefs: ['operations:invoke'],
      budgetLimit: 100,
      budgetUsed: 0,
      expiresAt: NOW + 30_000,
      generation: 4,
      revision: 4,
      lifecycle: 'active',
      createdAt: NOW - 8_000,
      createdBy: grantAction,
    }, overrides.grant)
    const parentGrant = mergeRow({
      grantRef: PARENT_GRANT_REF,
      accountRef: ACCOUNT_REF,
      actorPrincipalRef: OTHER_PRINCIPAL_REF,
      subjectPrincipalRef: OTHER_PRINCIPAL_REF,
      scopes: ['operations:invoke', 'operations:read'],
      resourceRefs: ['operations:invoke'],
      budgetLimit: 200,
      budgetUsed: 0,
      expiresAt: NOW + 40_000,
      generation: 2,
      revision: 2,
      lifecycle: 'active',
      createdAt: NOW - 9_000,
      createdBy: grantAction,
    }, overrides.parentGrant)
    const secondGrant = mergeRow({
      ...grant,
      grantRef: `grt_${'8'.repeat(32)}`,
      generation: 1,
      revision: 1,
      createdAt: NOW - 7_000,
    }, overrides.secondGrant)
    const accessKind = overrides.accessKind ?? 'member'
    const currentOwnerPrincipalRef = accessKind === 'owner' ? PRINCIPAL_REF : OTHER_PRINCIPAL_REF
    const account = mergeRow({
      accountRef: ACCOUNT_REF,
      displayName: 'Canonical Account',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: PRINCIPAL_REF,
      creationIdempotencyRef: 'idempotency:account',
      initialOwnershipRef: OWNERSHIP_REF,
      currentOwnershipRef: OWNERSHIP_REF,
      revision: 1,
      createdAt: NOW - 20_000,
      updatedAt: NOW - 20_000,
      lastAction: action,
    }, overrides.account)
    const admission = mergeRow({
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      credentialId: 'ak_live_locator',
      applicationRef: 'agent-application',
      environment: 'production',
      scopes: ['operations:invoke'],
      authorityMode: 'bounded_mandate',
      grantGeneration: 4,
      policyDigest: ACCESS_POLICY_DIGEST,
      lifecycle: 'active',
      expiresAt: NOW + 60_000,
      recordedAt: NOW - 9_000,
      lastSeenAt: NOW - 9_000,
    }, overrides.admission)
    const accessGrant = mergeRow({
      format: 'ae.agent-access-grant:v2',
      grantRef: GRANT_REF,
      principalId: PRINCIPAL_REF,
      ownerId: ACCOUNT_REF,
      applicationRef: 'agent-application',
      credentialId: 'ak_live_locator',
      environment: 'production',
      operationAccess: 'all_admitted',
      operationRefs: [],
      authorityMode: 'bounded_mandate',
      policy: ACCESS_POLICY,
      budgetPolicyRef: ACCESS_POLICY.budget.budgetPolicyRef,
      ratePolicyRef: ACCESS_POLICY.rate.ratePolicyRef,
      lifecycle: 'active',
      generation: 4,
      policyDigest: ACCESS_POLICY_DIGEST,
      createdAt: NOW - 9_000,
      updatedAt: NOW - 9_000,
      expiresAt: NOW + 7_200_000,
    }, overrides.accessGrant)

    if (binding !== null) await ctx.db.insert('externalIdentityBindings', binding as never)
    if (credential !== null) await ctx.db.insert('credentials', credential as never)
    if (admission !== null) await ctx.db.insert('agentAccessPrincipals', admission as never)
    if (accessGrant !== null) await ctx.db.insert('agentAccessGrants', accessGrant as never)
    if (principal !== null) await ctx.db.insert('principals', principal as never)
    if (parentGrant !== null) await ctx.db.insert('authorityDelegationGrants', parentGrant as never)
    if (grant !== null) await ctx.db.insert('authorityDelegationGrants', grant as never)
    if (overrides.secondGrant !== undefined && secondGrant !== null) {
      await ctx.db.insert('authorityDelegationGrants', secondGrant as never)
    }
    if (account !== null) await ctx.db.insert('accounts', account as never)
    if (account !== null) {
      await ctx.db.insert('accountOwnerships', {
        ownershipRef: OWNERSHIP_REF,
        accountRef: ACCOUNT_REF,
        ownerPrincipalRef: currentOwnerPrincipalRef,
        lifecycle: 'active',
        changeKind: 'creation',
        revision: 1,
        createdAt: NOW - 20_000,
        createdBy: grantAction,
      })
      if (accessKind === 'member') {
        await ctx.db.insert('memberships', {
          membershipRef: `mem_${'b'.repeat(32)}`,
          accountRef: ACCOUNT_REF,
          memberPrincipalRef: PRINCIPAL_REF,
          lifecycle: 'active',
          revision: 1,
          createdAt: NOW - 10_000,
          createdBy: grantAction,
        })
      }
    }
  })
}

function mergeRow(
  base: Readonly<Record<string, unknown>>,
  override: Readonly<Record<string, unknown>> | null | undefined,
): Record<string, unknown> | null {
  if (override === null) return null
  return { ...base, ...override }
}

async function signedMutationArgs(
  patch: Partial<MutationArgs> = {},
  nonce = 'authority-boundary-valid',
): Promise<MutationArgs> {
  const command = { ...validInput(), ...patch }
  const request: SourceWriteAdmissionRequest = {
    method: 'POST',
    initiatorOrigin: 'https://app.example.test',
    targetOrigin: 'https://api.example.test',
    targetPath: '/v1/agent-authority',
    targetQuery: '',
    bodyDigest: sourceWriteBodyDigest(JSON.stringify(command)),
  }
  const sourceWrite = await createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: SECRET },
    request,
    scope: 'agent_identity',
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    nonce,
  })
  return { ...command, sourceWriteRequest: request, sourceWrite }
}
