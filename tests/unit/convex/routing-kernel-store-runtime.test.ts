import { beforeEach, describe, expect, it, vi } from 'vitest'

import { authorizeProviderRelease, claimExecution, claimProviderCancellation, completeExecution, getProviderCancellation, putAuthorization, reconcileRun, requestCancellation, resolveDisclosureAttempt, resolveProviderCancellation } from '../../../convex/routingKernelStore'
import { canonicalAuthorityDigest, createDisclosureGrant, createStepGrant, type DisclosureGrant, type RootRunSnapshot, type StepGrant } from '@/modules/routing-kernel/public'
import { signIncidentFact } from '@/modules/routing-kernel/public'

const quoteDigest = canonicalAuthorityDigest({ quote: 1 })
const requestDigest = canonicalAuthorityDigest({ request: 1 })
const incidentEpochDigest = canonicalAuthorityDigest({ incidentEpochs: [] })
const incidentSigningKey = { keyId: 'incident-facts:test', privateKey: '1f'.repeat(32) }

beforeEach(() => {
  vi.stubEnv('ROUTING_KERNEL_FACT_SIGNING_KEY', `${incidentSigningKey.keyId}:${incidentSigningKey.privateKey}`)
  vi.stubEnv('ROUTING_KERNEL_FACT_PREVIOUS_PUBLIC_KEYS', '')
})

type AuthorizationRow = {
  _id: string
  authorizationRef: string
  budgetAuthorityRef: string
  budgetMaximumGrossMinor: number
  quoteId: string
  quoteDigest: string
  principalId: string
  agentId: string
  maximumSpendMinor: number
  currency: string
  expiresAt: number
  consumedAt?: number
  incidentEpochDigest: string
  incidentContract: 'epoch_v1'
}

type ExecutionClaimRow = {
  _id: string
  executionScope: string
  rootRunId: string
  authorizationRef: string
  state: 'pending' | 'completed'
  createdAt: number
  completedAt?: number
  agentId: string
  principalId: string
  requestDigest?: string
  dataDigest?: string
}

type StepReleaseRow = {
  _id: string
  rootRunId: string
  leafRunId: string
  stepGrantId: string
  bindingId: string
  releasedAt: number
}
type StepReleaseArgs = { grant: StepGrant; disclosureGrant?: DisclosureGrant; releasedAt: number; run: RootRunSnapshot; canaryRecoveryGrantId?: string }

type Row = Record<string, unknown> & { _id: string }
type TableName = 'routingKernelAuthorizations' | 'routingKernelBudgetAuthorities' | 'routingKernelSpendReservations' | 'routingKernelDataAuthorizationBudgets' | 'routingKernelDataAllocations' | 'routingKernelDisclosureAttempts' | 'routingKernelProviderCancellations' | 'routingKernelExecutionClaims' | 'routingKernelStepReleases' | 'routingKernelRootRuns' | 'routingKernelLeafRuns' | 'routingKernelProtocolRecords' | 'routingKernelQuoteGraphSteps' | 'routingKernelIncidentScopeControls' | 'routingKernelIncidentFreezeOrders' | 'routingKernelIncidentRecoveryGrants' | 'routingKernelIncidentRecoveryUses'
type ClaimArgs = {
  executionScope: string
  rootRunId: string
  authorizationRef: string
  consumedAt: number
  caller: { agentId: string; principalId: string }
  requestDigest: string
  run: RootRunSnapshot
}
type ClaimHandler = (ctx: { db: FakeDb }, args: ClaimArgs) => Promise<unknown>

const claimHandler = (claimExecution as unknown as { _handler: ClaimHandler })._handler
const releaseHandler = (authorizeProviderRelease as unknown as { _handler: (ctx: { db: FakeDb }, args: StepReleaseArgs) => Promise<unknown> })._handler
const cancelHandler = (requestCancellation as unknown as { _handler: (ctx: { db: FakeDb }, args: { rootRunId: string; caller: { agentId: string; principalId: string }; requestedAt: number }) => Promise<unknown> })._handler
const completeHandler = (completeExecution as unknown as { _handler: (ctx: { db: FakeDb }, args: { executionScope: string; run: RootRunSnapshot }) => Promise<unknown> })._handler
const putAuthorizationHandler = (putAuthorization as unknown as { _handler: (ctx: { db: FakeDb }, args: { authorization: Record<string, unknown> }) => Promise<unknown> })._handler
const reconcileHandler = (reconcileRun as unknown as { _handler: (ctx: { db: FakeDb }, args: { rootRunId: string; leafRunId: string; run: RootRunSnapshot }) => Promise<unknown> })._handler
const resolveDisclosureHandler = (resolveDisclosureAttempt as unknown as { _handler: (ctx: { db: FakeDb }, args: { disclosureGrantId: string; disposition: 'not_released' | 'released'; resolvedAt: number }) => Promise<unknown> })._handler
const claimCancellationHandler = (claimProviderCancellation as unknown as { _handler: (ctx: { db: FakeDb }, args: any) => Promise<unknown> })._handler
const resolveCancellationHandler = (resolveProviderCancellation as unknown as { _handler: (ctx: { db: FakeDb }, args: any) => Promise<unknown> })._handler
const getCancellationHandler = (getProviderCancellation as unknown as { _handler: (ctx: { db: FakeDb }, args: any) => Promise<unknown> })._handler

describe('Convex routing-kernel execution claim', () => {
  it('treats an exact authorization replay as identical despite persistence-only incident metadata', async () => {
    const persisted = authorizationRow()
    const { _id: _ignoredId, incidentContract: _ignoredContract, ...authorization } = persisted
    const db = new FakeDb([persisted])

    await expect(putAuthorizationHandler({ db }, { authorization })).resolves.toBeNull()
    expect(db.rows('routingKernelAuthorizations')).toHaveLength(1)
  })

  it('atomically consumes one authorization and returns the existing pending claim to a concurrent duplicate', async () => {
    const db = new FakeDb([authorizationRow(), budgetAuthorityRow(), quoteStepRow('primary')])
    const first = await claimHandler({ db }, {
      executionScope: 'agent:principal:execute-1',
      rootRunId: 'root-run:1',
      authorizationRef: 'route-authorization:1',
      consumedAt: 1_000,
      caller: { agentId: 'agent:1', principalId: 'principal:1' },
      requestDigest, run: runCheckpoint('pending', 'not_released'),
    })
    const duplicate = await claimHandler({ db }, {
      executionScope: 'agent:principal:execute-1',
      rootRunId: 'root-run:2',
      authorizationRef: 'route-authorization:1',
      consumedAt: 1_001,
      caller: { agentId: 'agent:1', principalId: 'principal:1' },
      requestDigest, run: { ...runCheckpoint('pending', 'not_released'), rootRunId: 'root-run:2' },
    })
    const secondScope = await claimHandler({ db }, {
      executionScope: 'agent:principal:execute-2',
      rootRunId: 'root-run:3',
      authorizationRef: 'route-authorization:1',
      consumedAt: 1_002,
      caller: { agentId: 'agent:1', principalId: 'principal:1' },
      requestDigest: 'request:2', run: { ...runCheckpoint('pending', 'not_released'), rootRunId: 'root-run:3' },
    })

    expect(first).toMatchObject({
      kind: 'claimed',
      authorization: { authorizationRef: 'route-authorization:1', consumedAt: 1_000 },
    })
    expect(duplicate).toEqual({ kind: 'pending', rootRunId: 'root-run:1', authorizationRef: 'route-authorization:1', requestDigest, claimedAt: 1_000, caller: { agentId: 'agent:1', principalId: 'principal:1' } })
    expect(secondScope).toEqual({ kind: 'refused', reason: 'authorization_consumed' })
    expect(db.rows('routingKernelExecutionClaims')).toEqual([
      expect.objectContaining({
        executionScope: 'agent:principal:execute-1',
        rootRunId: 'root-run:1',
        state: 'pending',
      }),
    ])
    expect(db.rows('routingKernelAuthorizations')).toEqual([
      expect.objectContaining({ authorizationRef: 'route-authorization:1', consumedAt: 1_000 }),
    ])
  })

  it('refuses frozen root admission and provider release inside the authoritative mutation', async () => {
    const admissionDb = new FakeDb([authorizationRow(), budgetAuthorityRow(), quoteStepRow('primary'), ...incidentRows(['root_admission'])])
    await expect(claimHandler({ db: admissionDb }, {
      executionScope: 'scope:incident', rootRunId: 'root-run:1', authorizationRef: 'route-authorization:1',
      consumedAt: 1_000, caller: { agentId: 'agent:1', principalId: 'principal:1' }, requestDigest,
      run: runCheckpoint('pending', 'not_released'),
    })).resolves.toEqual({ kind: 'refused', reason: 'incident_frozen' })
    expect(admissionDb.rows('routingKernelExecutionClaims')).toEqual([])

    const fallbackFreezeDb = new FakeDb([
      authorizationRow(), budgetAuthorityRow(), quoteStepRow('primary'), quoteStepRow('fallback'),
      ...incidentRows(['root_admission'], 'binding:fallback'),
    ])
    await expect(claimHandler({ db: fallbackFreezeDb }, {
      executionScope: 'scope:fallback-incident', rootRunId: 'root-run:1', authorizationRef: 'route-authorization:1',
      consumedAt: 1_000, caller: { agentId: 'agent:1', principalId: 'principal:1' }, requestDigest,
      run: runCheckpoint('pending', 'not_released'),
    })).resolves.toEqual({ kind: 'refused', reason: 'incident_frozen' })
    expect(fallbackFreezeDb.rows('routingKernelExecutionClaims')).toEqual([])
    expect(fallbackFreezeDb.rows('routingKernelSpendReservations')).toEqual([])
    expect(fallbackFreezeDb.rows('routingKernelRootRuns')).toEqual([])

    const releaseDb = new FakeDb([
      authorizationRow(), executionClaimRow(), { ...quoteStepRow('primary'), incidentEpochDigest: incidentEpochDigestForAtomicScope() },
      ...persistedRunRows(runCheckpoint('pending', 'not_released')),
      ...incidentRows(['provider_release']),
    ])
    await expect(releaseHandler({ db: releaseDb }, {
      grant: exactGrant(), releasedAt: 1_001, run: runCheckpoint('released', 'released'),
    })).resolves.toMatchObject({
      kind: 'incident_frozen', freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic',
    })
    expect(releaseDb.rows('routingKernelStepReleases')).toEqual([])

    const canaryEpochDigest = incidentEpochDigestForAtomicScope()
    const canaryDb = new FakeDb([
      authorizationRow(), executionClaimRow(), { ...quoteStepRow('primary'), incidentEpochDigest: incidentEpochDigestForAtomicScope() },
      ...persistedRunRows({ ...runCheckpoint('pending', 'not_released'), incidentEpochDigest: canaryEpochDigest }),
      ...incidentRows(['provider_release']), ...canaryRecoveryRows(),
    ])
    await expect(releaseHandler({ db: canaryDb }, {
      grant: exactGrant({ incidentEpochDigest: canaryEpochDigest }), releasedAt: 1_001,
      run: { ...runCheckpoint('released', 'released'), rootRunId: 'root-run:wrong', incidentEpochDigest: canaryEpochDigest },
      canaryRecoveryGrantId: 'recovery-grant:atomic-canary',
    })).rejects.toThrow('invalid_provider_release_checkpoint')
    expect(canaryDb.rows('routingKernelIncidentRecoveryUses')).toEqual([])
    await expect(releaseHandler({ db: canaryDb }, {
      grant: exactGrant({ incidentEpochDigest: canaryEpochDigest }), releasedAt: 1_001,
      run: { ...runCheckpoint('released', 'released'), incidentEpochDigest: canaryEpochDigest },
      canaryRecoveryGrantId: 'recovery-grant:atomic-canary',
    })).resolves.toBe('released')
    expect(canaryDb.rows('routingKernelIncidentRecoveryUses')).toEqual([
      expect.objectContaining({ recoveryGrantId: 'recovery-grant:atomic-canary', operationRef: 'grant:primary', lane: 'canary' }),
    ])
    expect(canaryDb.rows('routingKernelStepReleases')).toHaveLength(1)

    const fallbackRaceDb = new FakeDb([
      authorizationRow(), executionClaimRow(), quoteStepRow('primary'),
      { ...quoteStepRow('fallback'), incidentEpochDigest: incidentEpochDigestForAtomicScope('binding:fallback') },
      ...persistedRunRows(runCheckpoint('pending', 'not_released')),
      ...incidentRows(['root_admission'], 'binding:fallback'),
    ])
    await expect(releaseHandler({ db: fallbackRaceDb }, {
      grant: exactGrant(), releasedAt: 1_001, run: runCheckpoint('released', 'released'),
    })).resolves.toMatchObject({
      kind: 'incident_frozen', freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic',
    })
    expect(fallbackRaceDb.rows('routingKernelStepReleases')).toEqual([])

    const fallbackStaleDb = new FakeDb([
      authorizationRow(), executionClaimRow(), quoteStepRow('primary'), quoteStepRow('fallback'),
      ...persistedRunRows(runCheckpoint('pending', 'not_released')),
      ...incidentRows([], 'binding:fallback'),
    ])
    await expect(releaseHandler({ db: fallbackStaleDb }, {
      grant: exactGrant(), releasedAt: 1_001, run: runCheckpoint('released', 'released'),
    })).resolves.toMatchObject({ kind: 'incident_epoch_stale' })
    expect(fallbackStaleDb.rows('routingKernelStepReleases')).toEqual([])
  })

  it('refuses caller and provider cancellation inside the authoritative mutation when cancellation is frozen', async () => {
    const running = runCheckpoint('pending', 'not_released')
    const callerCancellationDb = new FakeDb([
      executionClaimRow(), ...persistedRunRows(running), ...incidentRows(['cancel']),
    ])
    await expect(cancelHandler({ db: callerCancellationDb }, {
      rootRunId: running.rootRunId, caller: running.caller, requestedAt: 1_003,
    })).resolves.toMatchObject({
      kind: 'incident_frozen', freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic',
    })
    expect(callerCancellationDb.rows('routingKernelExecutionClaims')).toEqual([
      expect.not.objectContaining({ cancellationRequestedAt: expect.any(Number) }),
    ])

    const completed = terminalRun(runCheckpoint('released', 'released'), [
      ...baseRecords(), terminalRecord(),
    ])
    const providerCancellationDb = new FakeDb([
      ...persistedRunRows(completed), ...incidentRows(['cancel']),
    ])
    const cancellation = {
      cancellationRequestId: 'provider-cancellation:frozen', rootRunId: completed.rootRunId,
      leafRunId: completed.leaves[0]!.leafRunId, stepGrantId: completed.leaves[0]!.stepGrantId,
      bindingId: completed.leaves[0]!.bindingId, idempotencyKey: 'cancel:frozen',
      disposition: 'pending', requestedAt: 1_003,
    }
    await expect(claimCancellationHandler({ db: providerCancellationDb }, {
      cancellation, run: completed,
    })).resolves.toMatchObject({
      kind: 'incident_frozen', freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic',
    })
    expect(providerCancellationDb.rows('routingKernelProviderCancellations')).toEqual([])
  })

  it('atomically prevents cumulative oversubscription and releases only definite non-commitment', async () => {
    const firstAuthorization = { ...authorizationRow(), budgetMaximumGrossMinor: 150 }
    const secondAuthorization = { ...authorizationRow(), _id: 'routingKernelAuthorizations:2', authorizationRef: 'route-authorization:2', budgetMaximumGrossMinor: 150 }
    const db = new FakeDb([firstAuthorization, secondAuthorization, { ...budgetAuthorityRow(), maximumGrossMinor: 150 }, quoteStepRow('primary')])
    const running = runCheckpoint('pending', 'not_released')
    await expect(claimHandler({ db }, {
      executionScope: 'scope:budget-1', rootRunId: 'root-run:1', authorizationRef: 'route-authorization:1',
      consumedAt: 1_000, caller: running.caller, requestDigest, run: running,
    })).resolves.toMatchObject({ kind: 'claimed' })
    await expect(claimHandler({ db }, {
      executionScope: 'scope:budget-2', rootRunId: 'root-run:2', authorizationRef: 'route-authorization:2',
      consumedAt: 1_001, caller: running.caller, requestDigest: canonicalAuthorityDigest({ request: 2 }),
      run: { ...running, rootRunId: 'root-run:2', records: running.records.map((record) => ({ ...record, recordId: `${record.recordId}:2`, rootRunId: 'root-run:2' })) },
    })).resolves.toEqual({ kind: 'refused', reason: 'budget_capacity_exceeded' })
    expect(db.rows('routingKernelBudgetAuthorities')[0]).toMatchObject({ reservedGrossMinor: 100, committedGrossMinor: 0 })

    const failed = {
      ...running, state: 'failed' as const, effectState: 'not_committed' as const,
      leaves: [{ ...running.leaves[0]!, state: 'failed' as const, effectState: 'not_committed' as const, failureReason: 'declined' }],
      records: [...running.records, { recordId: 'record:failed', type: 'root_run_failed' as const, rootRunId: 'root-run:1', incidentEpochDigest, occurredAt: 1_010 }],
    }
    await completeHandler({ db }, { executionScope: 'scope:budget-1', run: failed })
    expect(db.rows('routingKernelBudgetAuthorities')[0]).toMatchObject({ reservedGrossMinor: 0, committedGrossMinor: 0 })

    await expect(claimHandler({ db }, {
      executionScope: 'scope:budget-2', rootRunId: 'root-run:2', authorizationRef: 'route-authorization:2',
      consumedAt: 1_020, caller: running.caller, requestDigest: canonicalAuthorityDigest({ request: 2 }),
      run: { ...running, rootRunId: 'root-run:2', records: running.records.map((record) => ({ ...record, recordId: `${record.recordId}:2`, rootRunId: 'root-run:2' })) },
    })).resolves.toMatchObject({ kind: 'claimed' })
  })

  it('atomically prevents cumulative disclosure oversubscription at root admission and releases unused allocation on terminal completion', async () => {
    const dataAuthority = {
      dataAuthorizationBudgetRef: 'data-budget:shared', protectedFieldSetId: 'field-set:shared:v1',
      dataBudgetMaximumAttempts: 1, dataBudgetMaximumExposures: 1,
      allowedRecipientBindingIds: ['binding:primary'], allowedDisclosurePurposes: ['capability:1'],
      maximumDisclosureAttempts: 1, maximumDisclosureExposures: 1, allowedDataFields: ['recipient_address'],
    }
    const firstAuthorization = { ...authorizationRow(), ...dataAuthority }
    const secondAuthorization = { ...authorizationRow(), ...dataAuthority, _id: 'routingKernelAuthorizations:2', authorizationRef: 'route-authorization:2' }
    const dataBudget = {
      _id: 'routingKernelDataAuthorizationBudgets:shared', dataContract: 'cumulative_v1', dataAuthorizationBudgetRef: 'data-budget:shared', sourceGrantId: 'grant:shared',
      agentId: 'agent:1', principalId: 'principal:1', networkId: 'network:1', protectedFieldSetId: 'field-set:shared:v1',
      permittedFields: ['recipient_address'], permittedRecipientBindingIds: ['binding:primary'], permittedPurposes: ['capability:1'],
      maximumAttempts: 1, maximumExposures: 1, reservedAttempts: 0, reservedExposures: 0, consumedAttempts: 0, consumedExposures: 0,
      expiresAt: 2_000, status: 'active', revision: 0, createdAt: 900, updatedAt: 900,
    }
    const db = new FakeDb([firstAuthorization, secondAuthorization, budgetAuthorityRow(), dataBudget, quoteStepRow('primary')])
    const running = runCheckpoint('pending', 'not_released')

    await expect(claimHandler({ db }, {
      executionScope: 'scope:data-1', rootRunId: 'root-run:1', authorizationRef: 'route-authorization:1',
      consumedAt: 1_000, caller: running.caller, requestDigest, run: running,
    })).resolves.toMatchObject({ kind: 'claimed' })
    await expect(claimHandler({ db }, {
      executionScope: 'scope:data-2', rootRunId: 'root-run:2', authorizationRef: 'route-authorization:2',
      consumedAt: 1_001, caller: running.caller, requestDigest: canonicalAuthorityDigest({ request: 2 }),
      run: { ...running, rootRunId: 'root-run:2', records: running.records.map((record) => ({ ...record, recordId: `${record.recordId}:2`, rootRunId: 'root-run:2' })) },
    })).resolves.toEqual({ kind: 'refused', reason: 'data_authority_capacity_exceeded' })
    expect(db.rows('routingKernelDataAuthorizationBudgets')[0]).toMatchObject({ reservedAttempts: 1, reservedExposures: 1, consumedAttempts: 0, consumedExposures: 0 })

    const failed = {
      ...running, state: 'failed' as const, effectState: 'not_committed' as const,
      leaves: [{ ...running.leaves[0]!, state: 'failed' as const, effectState: 'not_committed' as const, failureReason: 'cancelled_before_release' }],
      records: [...running.records, { recordId: 'record:data-failed', type: 'root_run_failed' as const, rootRunId: 'root-run:1', incidentEpochDigest, occurredAt: 1_010 }],
    }
    await completeHandler({ db }, { executionScope: 'scope:data-1', run: failed })
    expect(db.rows('routingKernelDataAuthorizationBudgets')[0]).toMatchObject({ reservedAttempts: 0, reservedExposures: 0, consumedAttempts: 0, consumedExposures: 0 })
    await expect(claimHandler({ db }, {
      executionScope: 'scope:data-2', rootRunId: 'root-run:2', authorizationRef: 'route-authorization:2',
      consumedAt: 1_020, caller: running.caller, requestDigest: canonicalAuthorityDigest({ request: 2 }),
      run: { ...running, rootRunId: 'root-run:2', records: running.records.map((record) => ({ ...record, recordId: `${record.recordId}:2`, rootRunId: 'root-run:2' })) },
    })).resolves.toMatchObject({ kind: 'claimed' })
  })

  it('persists exact single-use step releases and closes cancellation after the first release', async () => {
    const db = new FakeDb([authorizationRow(), executionClaimRow(), quoteStepRow('primary'), quoteStepRow('fallback'), ...persistedRunRows(runCheckpoint('pending', 'not_released'))])
    const primary = { grant: exactGrant(), releasedAt: 1_001, run: runCheckpoint('released', 'released') }

    await expect(releaseHandler({ db }, primary)).resolves.toBe('released')
    await expect(releaseHandler({ db }, primary)).resolves.toBe('already_released')
    await expect(releaseHandler({ db }, { ...primary, grant: { ...primary.grant, requestDigest: 'request:mutated' } })).resolves.toBe('release_conflict')
    await expect(releaseHandler({ db }, { ...primary, grant: createStepGrant({ ...primary.grant, leafRunId: 'leaf:fallback', bindingId: 'binding:fallback' }) })).resolves.toBe('release_conflict')
    const fallbackRun = { ...runCheckpoint('released', 'released'), leaves: [{ ...runCheckpoint('released', 'released').leaves[0]!, leafRunId: 'leaf:fallback', stepGrantId: 'grant:fallback', bindingId: 'binding:fallback' }] }
    await expect(releaseHandler({ db }, { grant: createStepGrant({ ...primary.grant, stepGrantId: 'grant:fallback', leafRunId: 'leaf:fallback', bindingId: 'binding:fallback' }), releasedAt: 1_002, run: fallbackRun })).resolves.toBe('released')
    await expect(cancelHandler({ db }, { rootRunId: 'root-run:1', caller: { agentId: 'agent:1', principalId: 'principal:1' }, requestedAt: 1_003 })).resolves.toBe('not_possible')
    expect(db.rows('routingKernelStepReleases')).toHaveLength(2)
    expect(db.rows('routingKernelStepReleases')[0]).toMatchObject({
      quoteDigest, requestDigest, maximumCostCurrency: 'AUD', maximumCostAmountMinor: 100,
      attempt: 1, enforcementPoint: 'provider_release', grantDigest: primary.grant.grantDigest,
    })
  })

  it('atomically consumes an exact disclosure grant and restores exposure only for proven not-released', async () => {
    const authorization = {
      ...authorizationRow(), allowedDataFields: ['recipient_address'], dataAuthorizationBudgetRef: 'data-budget:1',
      protectedFieldSetId: 'field-set:parcel:v1', dataBudgetMaximumAttempts: 1, dataBudgetMaximumExposures: 1,
      allowedRecipientBindingIds: ['binding:primary'], allowedDisclosurePurposes: ['capability:1'],
      maximumDisclosureAttempts: 1, maximumDisclosureExposures: 1,
    }
    const dataBudget = {
      _id: 'routingKernelDataAuthorizationBudgets:1', dataContract: 'cumulative_v1', dataAuthorizationBudgetRef: 'data-budget:1', sourceGrantId: 'grant:1',
      agentId: 'agent:1', principalId: 'principal:1', networkId: 'network:1', protectedFieldSetId: 'field-set:parcel:v1',
      permittedFields: ['recipient_address'], permittedRecipientBindingIds: ['binding:primary'], permittedPurposes: ['capability:1'],
      maximumAttempts: 1, maximumExposures: 1, reservedAttempts: 1, reservedExposures: 1, consumedAttempts: 0, consumedExposures: 0,
      expiresAt: 2_000, status: 'active', revision: 0, createdAt: 900, updatedAt: 900,
    }
    const dataAllocation = {
      _id: 'routingKernelDataAllocations:1', dataAuthorizationBudgetRef: 'data-budget:1', rootRunId: 'root-run:1',
      allocatedAttempts: 1, allocatedExposures: 1, remainingAttempts: 1, remainingExposures: 1,
      state: 'active', createdAt: 1_000,
    }
    const step = { ...quoteStepRow('primary'), dataFields: ['recipient_address'] }
    const db = new FakeDb([authorization, dataBudget, dataAllocation, executionClaimRow(), step, ...persistedRunRows(runCheckpoint('pending', 'not_released'))])
    const grant = createStepGrant({ ...exactGrant(), disclosedDataFields: ['recipient_address'] })
    const disclosureGrant = createDisclosureGrant({
      disclosureGrantId: 'disclosure:1', dataAuthorizationBudgetRef: 'data-budget:1', rootRunId: grant.rootRunId,
      leafRunId: grant.leafRunId, stepGrantId: grant.stepGrantId, quoteId: grant.quoteId, quoteDigest: grant.quoteDigest,
      requestDigest: grant.requestDigest, recipientBindingId: grant.bindingId, purpose: grant.capabilityContractId,
      fields: ['recipient_address'], projectionDigest: canonicalAuthorityDigest({ recipient_address: '1 Main St' }),
      attempt: 1, issuedAt: 1_000, expiresAt: 2_000, incidentEpochDigest,
    })
    await expect(releaseHandler({ db }, { grant, disclosureGrant, releasedAt: 1_001, run: runCheckpoint('released', 'released') })).resolves.toBe('released')
    expect(db.rows('routingKernelDataAuthorizationBudgets')[0]).toMatchObject({ consumedAttempts: 1, consumedExposures: 1 })
    expect(db.rows('routingKernelDisclosureAttempts')[0]).toMatchObject({ disclosureGrantId: 'disclosure:1', disposition: 'indeterminate' })
    await expect(resolveDisclosureHandler({ db }, { disclosureGrantId: 'disclosure:1', disposition: 'not_released', resolvedAt: 1_002 })).resolves.toBe('resolved')
    expect(db.rows('routingKernelDataAuthorizationBudgets')[0]).toMatchObject({ consumedAttempts: 1, consumedExposures: 0 })
  })

  it('preserves existing protocol rows and appends only the new suffix on completion', async () => {
    const running = runWithRecords(baseRecords())
    const db = new FakeDb([authorizationRow(), executionClaimRow(), ...persistedRunRows(running)])
    const existingId = db.rows('routingKernelProtocolRecords')[0]?._id
    const completed = terminalRun(running, [...running.records, terminalRecord()])

    await expect(completeHandler({ db }, { executionScope: 'scope:1', run: completed })).resolves.toBeNull()

    const rows = db.rows('routingKernelProtocolRecords')
    expect(rows).toHaveLength(3)
    expect(rows[0]?._id).toBe(existingId)
    expect(rows.map((row) => [row.sequence, row.recordId])).toEqual([[0, 'record:1'], [1, 'record:2'], [2, 'record:3']])

    await expect(claimHandler({ db }, {
      executionScope: 'scope:1', rootRunId: 'root-run:changed', authorizationRef: 'route-authorization:changed',
      consumedAt: 2_000, caller: { agentId: 'agent:1', principalId: 'principal:1' },
      requestDigest: canonicalAuthorityDigest({ changed: true }), run: { ...running, rootRunId: 'root-run:changed' },
    })).resolves.toMatchObject({ kind: 'completed', requestDigest, run: { rootRunId: 'root-run:1' } })
  })

  it.each([
    ['deletion', (records: RootRunSnapshot['records']) => records.slice(0, 1)],
    ['mutation', (records: RootRunSnapshot['records']) => [{ ...records[0]!, occurredAt: 999 }, records[1]!]],
    ['reordering', (records: RootRunSnapshot['records']) => [records[1]!, records[0]!]],
  ] as const)('rejects protocol history %s', async (_name, change) => {
    const running = runWithRecords(baseRecords())
    const db = new FakeDb([authorizationRow(), executionClaimRow(), ...persistedRunRows(running)])
    const completed = terminalRun(running, [...change(running.records), terminalRecord()])

    await expect(completeHandler({ db }, { executionScope: 'scope:1', run: completed })).rejects.toThrow('protocol_record_prefix_changed')
  })

  it('rejects a duplicate protocol record identity in the appended suffix', async () => {
    const running = runWithRecords(baseRecords())
    const db = new FakeDb([authorizationRow(), executionClaimRow(), ...persistedRunRows(running)])
    const duplicate = { ...terminalRecord(), recordId: 'record:1' }

    await expect(completeHandler({ db }, { executionScope: 'scope:1', run: terminalRun(running, [...running.records, duplicate]) })).rejects.toThrow('protocol_record_id_conflict')
  })

  it('appends reconciliation evidence without rewriting the unknown history', async () => {
    const unknown = unknownRun()
    const db = new FakeDb([...persistedRunRows(unknown)])
    const existingIds = db.rows('routingKernelProtocolRecords').map((row) => row._id)
    const resolved: RootRunSnapshot = {
      ...unknown, state: 'completed', effectState: 'committed',
      cost: { ...unknown.cost, reserved: null, providerReported: { currency: 'AUD', amountMinor: 100 }, settled: null },
      leaves: unknown.leaves.map((leaf) => ({ ...leaf, state: 'completed', attemptDisposition: 'dispatched', effectState: 'committed', outcome: { reconciled: 'true' } })),
      records: [...unknown.records,
        { recordId: 'record:4', type: 'provider_reconciliation_observed', rootRunId: unknown.rootRunId, leafRunId: 'leaf:primary', bindingId: 'binding:primary', providerReference: 'provider:unknown', evidenceSource: 'test', incidentEpochDigest, occurredAt: 1_003 },
        { recordId: 'record:5', type: 'root_run_reconciled', rootRunId: unknown.rootRunId, incidentEpochDigest, occurredAt: 1_003 }],
    }

    await expect(reconcileHandler({ db }, { rootRunId: unknown.rootRunId, leafRunId: 'leaf:primary', run: resolved })).resolves.toBe('applied')
    expect(db.rows('routingKernelProtocolRecords').slice(0, existingIds.length).map((row) => row._id)).toEqual(existingIds)
    expect(db.rows('routingKernelProtocolRecords').map((row) => row.recordId)).toEqual(['record:1', 'record:2', 'record:3', 'record:4', 'record:5'])
  })

  it('refuses run reconciliation inside the authoritative mutation when reconciliation is frozen', async () => {
    const unknown = unknownRun()
    const db = new FakeDb([...persistedRunRows(unknown), ...incidentRows(['reconcile'])])
    const resolved = terminalRun(unknown, [...unknown.records, {
      recordId: 'record:reconciled', type: 'root_run_reconciled', rootRunId: unknown.rootRunId, incidentEpochDigest, occurredAt: 1_003,
    }])

    await expect(reconcileHandler({ db }, { rootRunId: unknown.rootRunId, leafRunId: 'leaf:primary', run: resolved })).resolves.toMatchObject({
      kind: 'incident_frozen', freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic',
    })
    expect(db.rows('routingKernelRootRuns')[0]).toMatchObject({ state: 'outcome_unknown' })
  })

  it('atomically applies a binding-specific reconciliation freeze to the exact unknown leaf in a multi-leaf run', async () => {
    const base = unknownRun()
    const primary = { ...base.leaves[0]!, state: 'failed' as const, effectState: 'not_committed' as const, attemptDisposition: 'dispatched' as const, failureReason: 'declined' }
    const fallback = { ...base.leaves[0]!, leafRunId: 'leaf:fallback', stepGrantId: 'grant:fallback', bindingId: 'binding:fallback', nodeId: 'node:fallback' }
    const unknown: RootRunSnapshot = { ...base, leaves: [primary, fallback] }
    const resolved: RootRunSnapshot = {
      ...unknown, state: 'completed', effectState: 'committed',
      leaves: [primary, { ...fallback, state: 'completed', effectState: 'committed', attemptDisposition: 'dispatched', providerReference: 'transaction:fallback' }],
      records: [...unknown.records, { recordId: 'record:reconciled-fallback', type: 'root_run_reconciled', rootRunId: unknown.rootRunId, incidentEpochDigest, occurredAt: 1_003 }],
    }
    const db = new FakeDb([...persistedRunRows(unknown), ...incidentRows(['reconcile'], 'binding:fallback')])

    await expect(reconcileHandler({ db }, { rootRunId: unknown.rootRunId, leafRunId: 'leaf:fallback', run: resolved })).resolves.toMatchObject({
      kind: 'incident_frozen', freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic',
    })
    expect(db.rows('routingKernelRootRuns')[0]).toMatchObject({ state: 'outcome_unknown' })
  })

  it('persists provider cancellation before egress and appends its attributed resolution without rewriting terminal history', async () => {
    const completed = terminalRun(runWithRecords(baseRecords()), [...baseRecords(), terminalRecord()])
    const db = new FakeDb([authorizationRow(), executionClaimRow(), ...persistedRunRows(completed)])
    const existingIds = db.rows('routingKernelProtocolRecords').map((row) => row._id)
    const cancellation = {
      cancellationRequestId: 'provider-cancellation:1', rootRunId: completed.rootRunId,
      leafRunId: completed.leaves[0]!.leafRunId, stepGrantId: completed.leaves[0]!.stepGrantId,
      bindingId: completed.leaves[0]!.bindingId, idempotencyKey: 'cancel:1', disposition: 'pending', requestedAt: 1_003,
    }
    const requested = { ...completed, records: [...completed.records, { recordId: 'record:cancel-requested', type: 'provider_cancellation_requested' as const, rootRunId: completed.rootRunId, leafRunId: cancellation.leafRunId, bindingId: cancellation.bindingId, cancellationRequestId: cancellation.cancellationRequestId, incidentEpochDigest, occurredAt: 1_003 }] }
    await expect(claimCancellationHandler({ db }, { cancellation, run: requested })).resolves.toBe('claimed')
    await expect(claimCancellationHandler({ db }, { cancellation, run: requested })).resolves.toBe('existing')

    const unknownCancellation = { ...cancellation, disposition: 'indeterminate', resolvedAt: 1_004 }
    const unknown = { ...requested, records: [...requested.records, { recordId: 'record:cancel-unknown', type: 'provider_cancellation_unknown' as const, rootRunId: completed.rootRunId, leafRunId: cancellation.leafRunId, bindingId: cancellation.bindingId, cancellationRequestId: cancellation.cancellationRequestId, cancellationDisposition: 'indeterminate' as const, incidentEpochDigest, occurredAt: 1_004 }] }
    await expect(resolveCancellationHandler({ db }, { cancellation: unknownCancellation, run: unknown })).resolves.toBe('resolved')
    await expect(getCancellationHandler({ db }, { rootRunId: completed.rootRunId })).resolves.toMatchObject({ disposition: 'indeterminate' })

    const resolvedCancellation = { ...cancellation, disposition: 'accepted', resolvedAt: 1_005, providerReference: 'cancel:provider-1' }
    const resolved = { ...unknown, records: [...unknown.records, { recordId: 'record:cancel-accepted', type: 'provider_cancellation_accepted' as const, rootRunId: completed.rootRunId, leafRunId: cancellation.leafRunId, bindingId: cancellation.bindingId, cancellationRequestId: cancellation.cancellationRequestId, cancellationDisposition: 'accepted' as const, providerReference: 'cancel:provider-1', evidenceSource: 'provider_status_lookup', incidentEpochDigest, occurredAt: 1_005 }] }
    await expect(resolveCancellationHandler({ db }, { cancellation: resolvedCancellation, run: resolved })).resolves.toBe('resolved')
    await expect(getCancellationHandler({ db }, { rootRunId: completed.rootRunId })).resolves.toMatchObject({ disposition: 'accepted', providerReference: 'cancel:provider-1' })
    expect(db.rows('routingKernelProtocolRecords').slice(0, existingIds.length).map((row) => row._id)).toEqual(existingIds)
    expect(db.rows('routingKernelProtocolRecords').map((row) => row.type).slice(-3)).toEqual(['provider_cancellation_requested', 'provider_cancellation_unknown', 'provider_cancellation_accepted'])
  })
})

class FakeDb {
  private readonly tables = new Map<TableName, Row[]>([
    ['routingKernelAuthorizations', []],
    ['routingKernelBudgetAuthorities', []],
    ['routingKernelSpendReservations', []],
    ['routingKernelDataAuthorizationBudgets', []],
    ['routingKernelDataAllocations', []],
    ['routingKernelDisclosureAttempts', []],
    ['routingKernelProviderCancellations', []],
    ['routingKernelExecutionClaims', []],
    ['routingKernelStepReleases', []],
    ['routingKernelRootRuns', []],
    ['routingKernelLeafRuns', []],
    ['routingKernelProtocolRecords', []],
    ['routingKernelQuoteGraphSteps', []],
    ['routingKernelIncidentScopeControls', []],
    ['routingKernelIncidentFreezeOrders', []],
    ['routingKernelIncidentRecoveryGrants', []],
    ['routingKernelIncidentRecoveryUses', []],
  ])
  private nextId = 1

  constructor(rows: readonly Row[]) {
    for (const row of rows) {
      this.tableForRow(row).push({ ...row })
    }
  }

  query(tableName: TableName) {
    return new FakeQuery(this.table(tableName))
  }

  async patch(id: string, patch: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      const row = rows[index]
      if (row !== undefined) {
        rows[index] = { ...row, ...patch } as Row
        return
      }
    }
    throw new Error(`row_not_found:${id}`)
  }

  async insert(tableName: TableName, value: Record<string, unknown>): Promise<string> {
    const id = `${tableName}:${this.nextId}`
    this.nextId += 1
    this.table(tableName).push({ _id: id, ...value })
    return id
  }

  async delete(id: string): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      if (index >= 0) { rows.splice(index, 1); return }
    }
    throw new Error(`row_not_found:${id}`)
  }

  async replace(id: string, value: Record<string, unknown>): Promise<void> {
    for (const rows of this.tables.values()) {
      const index = rows.findIndex((row) => row._id === id)
      if (index >= 0) { rows[index] = { _id: id, ...value }; return }
    }
    throw new Error(`row_not_found:${id}`)
  }

  rows(tableName: TableName): readonly Row[] {
    return this.table(tableName).map((row) => ({ ...row }))
  }

  private table(tableName: TableName): Row[] {
    const rows = this.tables.get(tableName)
    if (rows === undefined) throw new Error(`unknown_table:${tableName}`)
    return rows
  }

  private tableForRow(row: Row): Row[] {
    return String(row._id).split(':')[0] === 'routingKernelIncidentScopeControls' ? this.table('routingKernelIncidentScopeControls')
      : String(row._id).split(':')[0] === 'routingKernelIncidentFreezeOrders' ? this.table('routingKernelIncidentFreezeOrders')
      : String(row._id).split(':')[0] === 'routingKernelIncidentRecoveryGrants' ? this.table('routingKernelIncidentRecoveryGrants')
      : String(row._id).split(':')[0] === 'routingKernelIncidentRecoveryUses' ? this.table('routingKernelIncidentRecoveryUses')
      : String(row._id).split(':')[0] === 'routingKernelRootRuns' ? this.table('routingKernelRootRuns')
      : String(row._id).split(':')[0] === 'routingKernelLeafRuns' ? this.table('routingKernelLeafRuns')
      : String(row._id).split(':')[0] === 'routingKernelProtocolRecords' ? this.table('routingKernelProtocolRecords')
      : String(row._id).split(':')[0] === 'routingKernelQuoteGraphSteps' ? this.table('routingKernelQuoteGraphSteps')
      : String(row._id).split(':')[0] === 'routingKernelBudgetAuthorities' ? this.table('routingKernelBudgetAuthorities')
      : String(row._id).split(':')[0] === 'routingKernelSpendReservations' ? this.table('routingKernelSpendReservations')
      : String(row._id).split(':')[0] === 'routingKernelDataAuthorizationBudgets' ? this.table('routingKernelDataAuthorizationBudgets')
      : String(row._id).split(':')[0] === 'routingKernelDataAllocations' ? this.table('routingKernelDataAllocations')
      : String(row._id).split(':')[0] === 'routingKernelDisclosureAttempts' ? this.table('routingKernelDisclosureAttempts')
      : String(row._id).split(':')[0] === 'routingKernelProviderCancellations' ? this.table('routingKernelProviderCancellations')
      : 'stepGrantId' in row
      ? this.table('routingKernelStepReleases')
      : 'executionScope' in row
      ? this.table('routingKernelExecutionClaims')
      : this.table('routingKernelAuthorizations')
  }
}

class FakeQuery {
  private field = ''
  private value: unknown

  constructor(private readonly rows: readonly Row[]) {}

  withIndex(_indexName: string, callback: (query: FakeIndexBuilder) => FakeIndexBuilder): FakeQuery {
    const builder = callback(new FakeIndexBuilder())
    this.field = builder.field
    this.value = builder.value
    return this
  }

  async unique(): Promise<Row | null> {
    const matches = this.rows.filter((row) => Reflect.get(row, this.field) === this.value)
    if (matches.length > 1) throw new Error('not_unique')
    return matches[0] ?? null
  }

  async first(): Promise<Row | null> {
    return this.rows.find((row) => Reflect.get(row, this.field) === this.value) ?? null
  }

  async collect(): Promise<Row[]> {
    return this.rows.filter((row) => Reflect.get(row, this.field) === this.value)
  }

  async take(limit: number): Promise<Row[]> {
    return this.rows.filter((row) => Reflect.get(row, this.field) === this.value).slice(0, limit)
  }
}

class FakeIndexBuilder {
  field = ''
  value: unknown

  eq(field: string, value: unknown): FakeIndexBuilder {
    this.field = field
    this.value = value
    return this
  }
}

function authorizationRow(): AuthorizationRow {
  return {
    _id: 'routingKernelAuthorizations:1',
    authorizationRef: 'route-authorization:1',
    budgetAuthorityRef: 'budget-authority:1',
    budgetMaximumGrossMinor: 1_200,
    quoteId: 'quote:1',
    quoteDigest,
    principalId: 'principal:1',
    agentId: 'agent:1',
    maximumSpendMinor: 1_200,
    currency: 'AUD',
    expiresAt: 2_000,
    incidentEpochDigest,
    incidentContract: 'epoch_v1',
  }
}

function budgetAuthorityRow(): Row {
  return {
    _id: 'routingKernelBudgetAuthorities:1', budgetContract: 'cumulative_v1', budgetAuthorityRef: 'budget-authority:1', sourceGrantId: 'grant:1',
    agentId: 'agent:1', principalId: 'principal:1', networkId: 'network:1', railProfileId: 'provider-cost-v1',
    currency: 'AUD', maximumGrossMinor: 1_200, reservedGrossMinor: 0, committedGrossMinor: 0,
    expiresAt: 2_000, status: 'active', revision: 0, createdAt: 900, updatedAt: 900,
  }
}

function executionClaimRow(): ExecutionClaimRow {
  return {
    _id: 'routingKernelExecutionClaims:1', executionScope: 'scope:1', rootRunId: 'root-run:1',
    authorizationRef: 'route-authorization:1', state: 'pending', createdAt: 1_000,
    agentId: 'agent:1', principalId: 'principal:1',
    requestDigest,
  }
}

function incidentRows(blockedActions: string[], bindingId = 'binding:primary'): Row[] {
  const scopeKey = `{"bindingId":"${bindingId}","networkId":"network:1"}`
  const factMaterial = {
    schemaVersion: 'incident-freeze-order:v1' as const,
    freezeOrderId: 'freeze:atomic', incidentId: 'incident:atomic', issuerId: 'principal:responder',
    reason: 'Atomic containment test.', scopeKey, networkId: 'network:1', bindingId,
    blockedActions, epoch: 1, issuedAt: 999,
  }
  const factDigest = canonicalAuthorityDigest(factMaterial)
  return [
    {
      _id: 'routingKernelIncidentScopeControls:1', scopeKey, networkId: 'network:1', bindingId,
      specificity: 2, epoch: 1, activeFreezeOrderIds: ['freeze:atomic'], blockedActions, updatedAt: 999,
    },
    {
      _id: 'routingKernelIncidentFreezeOrders:1', ...factMaterial, factDigest,
      ...signIncidentFact(factDigest, incidentSigningKey),
    },
  ]
}

function incidentEpochDigestForAtomicScope(bindingId = 'binding:primary'): string {
  return canonicalAuthorityDigest({
    incidentEpochs: [{ scopeKey: `{"bindingId":"${bindingId}","networkId":"network:1"}`, epoch: 1 }],
  })
}

function canaryRecoveryRows(): Row[] {
  const factMaterial = {
    schemaVersion: 'incident-recovery-grant:v1' as const,
    recoveryGrantId: 'recovery-grant:atomic-canary', freezeOrderIds: ['freeze:atomic'], lane: 'canary' as const,
    scopeKey: '{"bindingId":"binding:primary","networkId":"network:1"}',
    networkId: 'network:1', bindingId: 'binding:primary', maximumUses: 1, expiresAt: 2_000,
    evidenceRefs: ['evidence:approved-canary-plan'], approverIds: ['principal:one', 'principal:two'], issuedAt: 1_000,
    canaryPlan: {
      quoteId: 'quote:1', quoteDigest, authorizationRef: 'route-authorization:1', requestDigest,
      bindingId: 'binding:primary', capabilityContractId: 'capability:1', maximumSpendMinor: 1_200,
      currency: 'AUD', allowedDataFields: [],
    },
  }
  const factDigest = canonicalAuthorityDigest(factMaterial)
  return [{
    _id: 'routingKernelIncidentRecoveryGrants:1', ...factMaterial, factDigest,
    ...signIncidentFact(factDigest, incidentSigningKey),
  }]
}

function quoteStepRow(role: 'primary' | 'fallback'): Row {
  return {
    _id: `routingKernelQuoteGraphSteps:${role}`, quoteId: 'quote:1', graphRank: 0, stepRank: role === 'primary' ? 0 : 1, role,
    bindingId: `binding:${role}`, nodeId: 'node:primary', capabilityContractId: 'capability:1',
    expectedCurrency: 'AUD', expectedAmountMinor: 100, maximumCurrency: 'AUD', maximumAmountMinor: 100,
    expectedLatencyMs: 100, incidentEpochDigest, dataFields: [], disclosures: [],
  }
}

function exactGrant(overrides: { incidentEpochDigest?: string } = {}): StepGrant {
  return createStepGrant({
    stepGrantId: 'grant:primary', rootRunId: 'root-run:1', leafRunId: 'leaf:primary',
    quoteId: 'quote:1', quoteDigest, requestDigest,
    bindingId: 'binding:primary', nodeId: 'node:primary', capabilityContractId: 'capability:1',
    maximumCost: { currency: 'AUD', amountMinor: 100 }, disclosedDataFields: [], attempt: 1,
    issuedAt: 1_000, expiresAt: 2_000, enforcementPoint: 'provider_release',
    incidentEpochDigest: overrides.incidentEpochDigest ?? incidentEpochDigest,
  })
}

function runCheckpoint(
  state: RootRunSnapshot['leaves'][number]['state'],
  attemptDisposition: RootRunSnapshot['leaves'][number]['attemptDisposition'],
): RootRunSnapshot {
  const released = state === 'released'
  return {
    rootRunId: 'root-run:1', quoteId: 'quote:1', quoteDigest, incidentEpochDigest, networkId: 'network:1',
    executionMode: 'simulation', caller: { agentId: 'agent:1', principalId: 'principal:1' },
    state: 'running', enforcement: 'enforced', effectState: released ? 'released' : 'not_started',
    cost: { authorized: { currency: 'AUD', amountMinor: 1_200 }, quotedMaximum: { currency: 'AUD', amountMinor: 100 }, reserved: released ? { currency: 'AUD', amountMinor: 100 } : null, providerReported: null, settled: null },
    leaves: [{
      leafRunId: 'leaf:primary', stepGrantId: 'grant:primary', bindingId: 'binding:primary',
      nodeId: 'node:primary', capabilityContractId: 'capability:1', state, attemptDisposition,
      effectState: released ? 'released' : 'not_started', enforcement: 'enforced',
    }],
    records: [{ recordId: 'record:1', type: 'root_run_admitted', rootRunId: 'root-run:1', incidentEpochDigest, occurredAt: 1_000 }],
  }
}

function persistedRunRows(run: RootRunSnapshot): Row[] {
  return [
    {
      _id: 'routingKernelRootRuns:1', rootRunId: run.rootRunId, quoteId: run.quoteId, quoteDigest: run.quoteDigest,
      incidentContract: 'epoch_v1', incidentEpochDigest: run.incidentEpochDigest,
      networkId: run.networkId, executionMode: run.executionMode, agentId: run.caller.agentId,
      principalId: run.caller.principalId, state: run.state, enforcement: run.enforcement,
      effectState: run.effectState, authorizedCurrency: run.cost.authorized.currency,
      authorizedAmountMinor: run.cost.authorized.amountMinor, updatedAt: 1_000,
    },
    ...run.leaves.map((leaf, index) => ({ _id: `routingKernelLeafRuns:${index + 1}`, rootRunId: run.rootRunId, ...leaf })),
    ...run.records.map((record, index) => ({ _id: `routingKernelProtocolRecords:${index + 1}`, ...record, incidentContract: 'epoch_v1', sequence: index })),
  ]
}

function baseRecords(): RootRunSnapshot['records'] {
  return [
    { recordId: 'record:1', type: 'root_run_admitted', rootRunId: 'root-run:1', incidentEpochDigest, occurredAt: 1_000 },
    { recordId: 'record:2', type: 'step_grant_consumed', rootRunId: 'root-run:1', leafRunId: 'leaf:primary', bindingId: 'binding:primary', incidentEpochDigest, occurredAt: 1_001 },
  ]
}

function runWithRecords(records: RootRunSnapshot['records']): RootRunSnapshot {
  return { ...runCheckpoint('released', 'released'), records }
}

function terminalRecord(): RootRunSnapshot['records'][number] {
  return { recordId: 'record:3', type: 'root_run_completed', rootRunId: 'root-run:1', incidentEpochDigest, occurredAt: 1_002 }
}

function terminalRun(run: RootRunSnapshot, records: RootRunSnapshot['records']): RootRunSnapshot {
  return {
    ...run,
    state: 'completed', effectState: 'committed',
    cost: { ...run.cost, reserved: null, providerReported: { currency: 'AUD', amountMinor: 100 }, settled: null },
    leaves: run.leaves.map((leaf) => ({ ...leaf, state: 'completed', attemptDisposition: 'dispatched', effectState: 'committed' })),
    records,
  }
}

function unknownRun(): RootRunSnapshot {
  const running = runWithRecords(baseRecords())
  return {
    ...running, state: 'outcome_unknown', effectState: 'unknown',
    cost: { ...running.cost, reserved: { currency: 'AUD', amountMinor: 100 }, providerReported: null, settled: null },
    leaves: running.leaves.map((leaf) => ({ ...leaf, state: 'outcome_unknown', attemptDisposition: 'indeterminate', effectState: 'unknown', providerReference: 'provider:unknown' })),
    records: [...running.records, { recordId: 'record:3', type: 'root_run_outcome_unknown', rootRunId: running.rootRunId, incidentEpochDigest, occurredAt: 1_002 }],
  }
}
