import type { fetch as UndiciFetch } from 'undici'
import { Response as UndiciResponse } from 'undici'
import { afterEach, describe, expect, it, vi } from 'vitest'

const providerFetch = vi.hoisted(() => vi.fn<typeof UndiciFetch>())
vi.mock('undici', async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  fetch: providerFetch,
}))

import { components, api, internal } from '../../convex/_generated/api'
import {
  convexTestWithWorkers,
  publishedBusinessOwner,
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import {
  admitPublication,
  capabilityPublicationInput,
  preparedPublicationArgs,
  seedCatalogOffering,
} from './capability-publication-harness'
import { withSourceWrite } from '../helpers/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { accountRefForOwner } from '@/modules/money/public'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { capabilitySupplyGraphPorts } from '../../convex/capabilitySupplyGraphPorts'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/internal/graph/qualify-candidate'

const INPUT = { request: 'lookup' } as const

type TestPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'production'
  scopes: readonly [string]
  authorityMode: 'bounded_mandate'
}>

async function seedKeylessLookup(backend: ConvexFixtureBackend): Promise<string> {
  const suffix = 'workpool-lookup'
  const { businessId, owner } = await publishedBusinessOwner(backend, suffix)
  await seedCatalogOffering(backend, businessId, suffix, '/lookup', 'GET')
  const source = capabilityPublicationInput(businessId, suffix)
  const published = await owner.mutation(
    api.capabilitySupply.publishPreparedCapability,
    await preparedPublicationArgs(backend, {
      ...source,
      offering: {
        ...source.offering,
        presentation: {
          ...source.offering.presentation,
          price: {
            kind: 'fixed',
            amount: { currency: 'USD', units: '0', exponent: 2 },
          },
        },
      },
      binding: {
        ...source.binding,
        endpointUrl: `https://${suffix}.example.test/lookup`,
        authority: { kind: 'keyless' },
        adapter: {
          adapterId: 'http-json:v1',
          config: {
            method: 'GET',
            query: [{ inputPointer: '/request', parameter: 'request' }],
            requestTimeoutMs: 5_000,
          },
        },
      },
    }),
  )
  if ('reason' in published) throw new Error(`publication_refused:${published.reason}`)
  await admitPublication(backend, published, suffix)
  await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  const publication = await backend.run(async (ctx) => (
    (await ctx.db.query('capabilityPublications').collect()).find((row) => (
      row.offeringId === published.offeringId && row.disposition === 'current'
    ))
  ))
  if (publication === undefined) throw new Error('workpool publication missing')
  const observed = await backend.mutation(internal.capabilitySupply.observeCapabilityReadiness, {
    publicationRef: publication.publicationRef,
    expectedRevision: publication.revision,
    credentialState: 'ready',
    healthState: 'healthy',
    validUntil: Date.now() + 3_600_000,
    operationKey: `test:operation-workpool:readiness:${publication.publicationRef}`,
    correlationId: 'test:operation-workpool',
    reasonCode: 'test_readiness',
    evidenceRefs: ['test:operation-workpool'],
  })
  if (observed.kind !== 'observed') throw new Error(`workpool readiness refused: ${observed.reason}`)
  const qualification = await backend.run(async (ctx) => qualifySuppliedCandidate(
    capabilitySupplyGraphPorts(ctx.db),
    {
      candidate: {
        publicationRef: publication.publicationRef,
        revision: publication.revision,
        networkId: publication.networkId,
        businessId: publication.businessId,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        contractRef: {
          capabilityId: publication.capabilityId,
          version: publication.version,
          contractDigest: publication.contractDigest,
        },
      },
      now: Date.now(),
    },
  ))
  expect(qualification).toMatchObject({ status: 'eligible', reasons: [] })
  const executable = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {}) as Array<{
    capabilityId: string
    operationRef: string
  }>
  const descriptor = executable.find((candidate) => candidate.capabilityId === publication.capabilityId)
  if (descriptor === undefined) throw new Error('workpool executable descriptor missing')
  return descriptor.operationRef
}

async function seedPrincipal(
  backend: ConvexFixtureBackend,
  suffix: string,
  now: number,
  operationRef: string,
): Promise<{ principal: TestPrincipal; grantRef: string }> {
  const ref = (kind: 'prn' | 'acc' | 'grt' | 'eid' | 'crd' | 'own', material: string) =>
    `${kind}_${canonicalDigest({ kind, material }).slice(7, 39)}`
  const principalId = ref('prn', suffix)
  const ownerId = ref('acc', suffix)
  const credentialId = `credential:operation-workpool:${suffix}`
  const principal = {
    principalId,
    ownerId,
    credentialId,
    applicationRef: 'agentic-economy',
    environment: 'production' as const,
    scopes: [MARKET_OPERATIONS_INVOKE_SCOPE] as const,
    authorityMode: 'bounded_mandate' as const,
  }
  const amount = { currency: 'USD', units: '0', exponent: 2 }
  const policy = {
    format: 'ae.agent-access-policy:v1' as const,
    operationAccess: 'all_admitted' as const,
    environment: 'production' as const,
    budget: {
      budgetPolicyRef: `budget-policy:operation-workpool:${suffix}`,
      generation: 1,
      currency: 'USD',
      exponent: 2,
      maximumSpendPerInvocation: amount,
      maximumDailySpend: amount,
      maximumMonthlySpend: amount,
      maximumConcurrentInvocations: 4,
    },
    rate: {
      ratePolicyRef: `rate-policy:operation-workpool:${suffix}`,
      generation: 1,
      maximumCallsPerMinute: 100,
      maximumCallsPerHour: 1000,
    },
  }
  const grantRef = ref('grt', suffix)
  const grant = {
    format: 'ae.agent-access-grant:v1' as const,
    grantRef,
    principalId: principal.principalId,
    ownerId: principal.ownerId,
    applicationRef: principal.applicationRef,
    credentialId: principal.credentialId,
    environment: principal.environment,
    operationAccess: 'all_admitted' as const,
    authorityMode: principal.authorityMode,
    policy,
    budgetPolicyRef: policy.budget.budgetPolicyRef,
    ratePolicyRef: policy.rate.ratePolicyRef,
    lifecycle: 'active' as const,
    generation: 1,
    policyDigest: canonicalDigest(policy as never),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + 7 * 24 * 60 * 60 * 1_000,
  }
  const bindingRef = ref('eid', suffix)
  const canonicalCredentialRef = ref('crd', suffix)
  const ownershipRef = ref('own', suffix)
  const action = {
    actorPrincipalRef: principalId,
    activeAccountRef: ownerId,
    correlationRef: `correlation:operation-workpool:${suffix}`,
    idempotencyRef: `idempotency:operation-workpool:${suffix}`,
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('externalIdentityBindings', {
      bindingRef,
      principalRef: principalId,
      providerNamespace: 'clerk/api-key',
      providerIdentifier: credentialId,
      providerState: { kind: 'known', value: 'active' },
      lifecycle: 'active',
      credentialGeneration: 1,
      bindIdempotencyRef: `bind:operation-workpool:${suffix}`,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('credentials', {
      credentialRef: canonicalCredentialRef,
      bindingRef,
      principalRef: principalId,
      type: 'api_key',
      lifecycle: 'active',
      generation: 1,
      issueIdempotencyRef: `issue:operation-workpool:${suffix}`,
      revision: 1,
      issuedAt: now,
      expiresAt: grant.expiresAt,
      updatedAt: now,
    })
    await ctx.db.insert('principals', {
      principalRef: principalId,
      kind: 'agent',
      displayName: `Operation worker ${suffix}`,
      lifecycle: 'active',
      revision: 1,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert('accounts', {
      accountRef: ownerId,
      displayName: `Operation worker account ${suffix}`,
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: principalId,
      creationIdempotencyRef: `account:operation-workpool:${suffix}`,
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      lastAction: action,
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: ownerId,
      ownerPrincipalRef: principalId,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: now,
      createdBy: action,
    })
    await ctx.db.insert('authorityDelegationGrants', {
      grantRef,
      accountRef: ownerId,
      actorPrincipalRef: principalId,
      subjectPrincipalRef: principalId,
      scopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
      resourceRefs: [operationRef, 'surface:http:agent-operation-invoke'].sort(),
      budgetLimit: 1,
      budgetUsed: 0,
      expiresAt: grant.expiresAt,
      generation: 1,
      revision: 1,
      lifecycle: 'active',
      createdAt: now,
      createdBy: action,
    })
  })
  const recordedPrincipal = await backend.mutation(internal.agentAccessPrincipals.recordAgentPrincipal, {
    ...principal,
    scopes: [...principal.scopes],
    ownerTokenIdentifier: `token:operation-workpool:${suffix}`,
    grantGeneration: 1,
    policyDigest: grant.policyDigest,
    lifecycle: 'active',
    seenAt: now,
  })
  if (recordedPrincipal.kind !== 'recorded') throw new Error(`principal fixture failed: ${recordedPrincipal.kind}`)
  const recordedGrant = await backend.mutation(internal.agentAccessPolicy.upsertGrant, { grant })
  if (recordedGrant.kind !== 'recorded') throw new Error(`grant fixture failed: ${recordedGrant.kind}`)
  await backend.run(async (ctx) => {
    await ctx.db.insert('moneyAccounts', {
      accountRef: accountRefForOwner(principal.ownerId, 'USD'),
      accountKind: 'operator_credit',
      accountId: principal.ownerId,
      currency: 'USD',
      exponent: 2,
      balanceUnits: '0',
      heldUnits: '0',
      recoveryDueUnits: '0',
      version: 1,
      state: 'active',
      createdAt: now,
      updatedAt: now,
    })
  })
  return { principal, grantRef }
}

async function invokeOperation(
  backend: ConvexFixtureBackend,
  principal: TestPrincipal,
  operationRef: string,
  idempotencyKey: string,
  suffix: string,
  sourcePrincipal: TestPrincipal = principal,
) {
  const command = {
    operationKey: `test:operation-workpool:invoke:${suffix}`,
    correlationId: `test:operation-workpool:${suffix}`,
    principal: { ...principal, scopes: [...principal.scopes] },
    operationRef,
    input: INPUT,
    idempotencyKey,
  }
  const signed = await withSourceWrite('protected_action', {
    ...command,
    principal: { ...sourcePrincipal, scopes: [...sourcePrincipal.scopes] },
  })
  return await backend.action(
    api.capabilityOperationInvocations.invoke,
    { ...signed, principal: command.principal },
  )
}

async function readEvidence(
  backend: ConvexFixtureBackend,
  invocationRef: string,
  principalId: string,
) {
  return await backend.run(async (ctx) => {
    const invocation = await ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique()
    const control = await ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique()
    const attempt = await ctx.db.query('actionInvocationAttempts')
      .withIndex('by_invocationRef_and_attemptRef', (query) => (
        query.eq('invocationRef', invocationRef).eq('attemptRef', invocation?.attemptRef ?? '')
      ))
      .unique()
    const transactions = (await ctx.db.query('moneyTransactions')
      .withIndex('by_principalId_and_createdAt', (query) => query.eq('principalId', principalId))
      .collect())
      .filter((transaction) => transaction.transactionRef.startsWith(`operation-money:${invocationRef}:`))
    const usage = await ctx.db.query('moneyUsageEvents')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .collect()
    const history = await ctx.db.query('actionInvocationHistory')
      .withIndex('by_invocationRef_and_invocationVersion', (query) => query.eq('invocationRef', invocationRef))
      .order('asc')
      .collect()
    return {
      invocation,
      control,
      attempt,
      history,
      transactions,
      usage,
    }
  })
}

afterEach(() => {
  providerFetch.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('capability operation Workpool lifecycle', () => {
  it('executes once, replays without another effect, and refuses a revoked grant before claim', async () => {
    const signingSecretSentinel = 'operation-workpool-signing-secret-sentinel-32-bytes'
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_SECRET', signingSecretSentinel)
    vi.stubEnv('AE_ROUTE_CALL_SIGNING_KEY_ID', 'route-calls:test')
    vi.spyOn(defaultDnsResolver, 'lookup').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-12T00:00:00Z'))

    const backend = convexTestWithWorkers()
    const operationRef = await seedKeylessLookup(backend)
    const now = Date.now()
    const first = await seedPrincipal(backend, 'success', now, operationRef)
    await expect(backend.query(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef },
    )).resolves.toMatchObject({ operationJson: expect.any(String) })
    const revoked = await seedPrincipal(backend, 'revoked', now, operationRef)
    await expect(backend.query(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: first.principal.credentialId,
      environment: first.principal.environment,
      principalId: first.principal.principalId,
      applicationRef: first.principal.applicationRef,
      now,
    })).resolves.toMatchObject({ grantRef: first.grantRef })

    const providerOutput = { result: 'ok' }
    let historyObservedDuringProvider: string[] = []
    let pendingInvocationRef: string | undefined
    providerFetch.mockImplementation(async (input) => {
      expect(String(input)).toContain('workpool-lookup.example.test')
      const providerInvocationRef = pendingInvocationRef
      if (providerInvocationRef === undefined) {
        throw new Error('operation invocation not assigned before provider transport')
      }
      historyObservedDuringProvider = await backend.run(async (ctx) => (
        (await ctx.db.query('actionInvocationHistory')
          .withIndex('by_invocationRef_and_invocationVersion', (query) => (
            query.eq('invocationRef', providerInvocationRef)
          ))
          .order('asc')
          .collect())
          .map((row) => row.kind)
      ))
      return new UndiciResponse(JSON.stringify(providerOutput), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    providerFetch.mockClear()

    await expect(invokeOperation(
      backend,
      first.principal,
      operationRef,
      'operation-workpool-forged',
      'forged',
      {
        ...first.principal,
      principalId: revoked.principal.principalId,
      ownerId: revoked.principal.ownerId,
      },
    )).rejects.toThrow(
      'operation_invoke_source_write_rejected:source_write_command_mismatch',
    )
    expect(providerFetch).not.toHaveBeenCalled()

    const pending = await invokeOperation(backend, first.principal, operationRef, 'operation-workpool-success', 'success')
    expect(pending.kind).toBe('pending')
    if (pending.kind !== 'pending') throw new Error('successful operation did not enqueue')
    const successfulInvocationRef = pending.invocationRef
    pendingInvocationRef = successfulInvocationRef
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const completed = await readEvidence(backend, successfulInvocationRef, first.principal.principalId)
    const completedResult = completed.invocation?.result
    expect(completedResult).toMatchObject({ kind: 'completed' })
    if (completedResult?.kind !== 'completed') throw new Error('completed operation result missing')
    expect(completed.invocation).toMatchObject({
      state: 'completed',
      dispatchState: 'completed',
      workId: expect.any(String),
      result: { kind: 'completed', operationRef },
    })
    expect(completed.control?.control.control).toMatchObject({ state: 'terminal' })
    expect(completed.attempt?.release).toMatchObject({ state: 'released' })
    expect(completed.attempt?.outcome).toMatchObject({ state: 'returned' })
    expect(completed.history.map((row) => row.kind)).toEqual([
      'claim_before_effect',
      'release_fence_before_network',
      'terminal_returned',
    ])
    expect(completed.history.map((row) => row.invocationVersion)).toEqual([1, 2, 3])
    expect(completedResult.output).toEqual(providerOutput)
    const canonicalCommandJson = JSON.stringify({
      control: completed.control,
      attempt: completed.attempt,
      history: completed.history,
    })
    expect(canonicalCommandJson).not.toContain(JSON.stringify(providerOutput))
    expect(canonicalCommandJson).not.toContain(signingSecretSentinel)
    expect(completed.transactions).toHaveLength(1)
    expect(completed.transactions[0]).toMatchObject({
      kind: 'charge',
      state: 'applied',
      amountUnits: '0',
      idempotencyKey: `operation-money:${pendingInvocationRef}:${completed.attempt?.attemptRef}:1`,
    })
    expect(completed.usage).toHaveLength(1)
    expect(completed.usage[0]).toMatchObject({
      invocationRef: pendingInvocationRef,
      chargeState: 'free_tier',
      amountUnits: '0',
    })
    expect(historyObservedDuringProvider).toEqual([
      'claim_before_effect',
      'release_fence_before_network',
    ])
    expect(providerFetch).toHaveBeenCalledTimes(1)
    const workId = completed.invocation?.workId

    const replay = await invokeOperation(backend, first.principal, operationRef, 'operation-workpool-success', 'replay')
    expect(replay).toEqual(completedResult)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    const replayed = await readEvidence(backend, successfulInvocationRef, first.principal.principalId)
    expect(replayed.invocation?.workId).toBe(workId)
    expect(replayed.history).toHaveLength(3)
    expect(replayed.transactions).toHaveLength(1)
    expect(replayed.usage).toHaveLength(1)
    expect(providerFetch).toHaveBeenCalledTimes(1)

    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 0 })
    })
    const revokedPending = await invokeOperation(backend, revoked.principal, operationRef, 'operation-workpool-revoked', 'revoked')
    expect(revokedPending.kind).toBe('pending')
    if (revokedPending.kind !== 'pending') throw new Error('revoked operation did not enqueue')
    const revokedGrant = await backend.mutation(internal.agentAccessPolicy.revokeGrant, {
      grantRef: revoked.grantRef,
      ownerId: revoked.principal.ownerId,
      credentialId: revoked.principal.credentialId,
      principalId: revoked.principal.principalId,
      updatedAt: Date.now(),
    })
    expect(revokedGrant.kind).toBe('revoked')
    await backend.run(async (ctx) => {
      await ctx.runMutation(components.workpool.config.update, { maxParallelism: 1 })
    })
    vi.advanceTimersByTime(120_000)
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const refused = await readEvidence(backend, revokedPending.invocationRef, revoked.principal.principalId)
    expect(refused.invocation).toMatchObject({
      state: 'refused',
      dispatchState: 'failed',
      result: {
        kind: 'refused',
        operationRef,
        code: 'grant_not_found',
      },
    })
    expect(refused.control).toBeNull()
    expect(refused.attempt).toBeNull()
    expect(refused.transactions).toHaveLength(0)
    expect(refused.usage).toHaveLength(0)
    expect(providerFetch).toHaveBeenCalledTimes(1)
  })
})
