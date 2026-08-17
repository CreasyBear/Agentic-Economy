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
  type ConvexFixtureBackend,
} from '../helpers/convex-fixtures'
import { withSourceWrite } from '../helpers/source-write-admission'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { accountRefForOwner } from '@/modules/money/public'
import { defaultDnsResolver } from '@/modules/network-guard/public'
import { capabilitySupplyGraphPorts } from '../../convex/capabilitySupplyGraphPorts'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/internal/graph/qualify-candidate'

const OPERATION_REF = 'frankfurter.single-rate'
const INPUT = { base: 'EUR', quote: 'USD' } as const

type TestPrincipal = Readonly<{
  principalId: string
  ownerId: string
  credentialId: string
  applicationRef: string
  environment: 'sandbox'
  scopes: readonly [string]
  authorityMode: 'full_yolo'
}>

async function seedFrankfurterSupply(backend: ConvexFixtureBackend): Promise<string> {
  const seeded = await backend.mutation(internal.devSeed.seedDevCatalog, {})
  if (seeded.kind !== 'seeded') throw new Error(`curated seed unavailable: ${seeded.kind}`)
  await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
  const publication = await backend.run(async (ctx) => (
    (await ctx.db.query('capabilityPublications').collect()).find((row) => (
      row.capabilityId === OPERATION_REF && row.disposition === 'current'
    ))
  ))
  if (publication === undefined) throw new Error('Frankfurter publication missing')
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
  if (observed.kind !== 'observed') throw new Error(`Frankfurter readiness refused: ${observed.reason}`)
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
  const executable = await backend.query(api.capabilitySupplyOperations.listKeylessExecutable, {})
  const descriptor = executable.find((candidate) => candidate.capabilityId === OPERATION_REF)
  if (descriptor === undefined) throw new Error('Frankfurter executable descriptor missing')
  return descriptor.operationRef
}

async function seedPrincipal(
  backend: ConvexFixtureBackend,
  suffix: string,
  now: number,
): Promise<{ principal: TestPrincipal; grantRef: string }> {
  const principal = {
    principalId: `principal:operation-workpool:${suffix}`,
    ownerId: `owner:operation-workpool:${suffix}`,
    credentialId: `credential:operation-workpool:${suffix}`,
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: [MARKET_OPERATIONS_INVOKE_SCOPE] as const,
    authorityMode: 'full_yolo' as const,
  }
  const amount = { currency: 'USD', units: '0', exponent: 2 }
  const policy = {
    format: 'ae.agent-access-policy:v1' as const,
    operationAccess: 'all_admitted' as const,
    environment: 'sandbox' as const,
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
  const grantRef = `grant:operation-workpool:${suffix}`
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
) {
  const command = {
    operationKey: `test:operation-workpool:invoke:${suffix}`,
    correlationId: `test:operation-workpool:${suffix}`,
    principal: { ...principal, scopes: [...principal.scopes] },
    operationRef,
    input: INPUT,
    idempotencyKey,
  }
  return await backend.action(
    api.capabilityOperationInvocations.invoke,
    await withSourceWrite('protected_action', command),
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
    const operationRef = await seedFrankfurterSupply(backend)
    const now = Date.now()
    const first = await seedPrincipal(backend, 'success', now)
    await expect(backend.query(
      internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
      { operationRef },
    )).resolves.toMatchObject({ operationJson: expect.any(String) })
    const revoked = await seedPrincipal(backend, 'revoked', now)
    await expect(backend.query(internal.agentAccessPolicy.readActiveGrant, {
      credentialId: first.principal.credentialId,
      environment: first.principal.environment,
      principalId: first.principal.principalId,
      applicationRef: first.principal.applicationRef,
      now,
    })).resolves.toMatchObject({ grantRef: first.grantRef })

    const providerOutput = [{ date: '2099-12-31', base: 'EUR', quote: 'USD', rate: 1.08123456789 }]
    let historyObservedDuringProvider: string[] = []
    let pendingInvocationRef: string | undefined
    providerFetch.mockImplementation(async (input) => {
      expect(String(input)).toContain('api.frankfurter.dev')
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

    const pending = await invokeOperation(backend, first.principal, operationRef, 'operation-workpool-success', 'success')
    expect(pending.kind).toBe('pending')
    if (pending.kind !== 'pending') throw new Error('successful operation did not enqueue')
    pendingInvocationRef = pending.invocationRef
    await backend.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))

    const completed = await readEvidence(backend, pendingInvocationRef, first.principal.principalId)
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
    const replayed = await readEvidence(backend, pendingInvocationRef, first.principal.principalId)
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
