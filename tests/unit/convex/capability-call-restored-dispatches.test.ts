import { Workpool, type WorkId } from '@convex-dev/workpool'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { components, internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { SYSTEM_WORKLOAD_PRINCIPAL_REF } from '../../../convex/lib/platform/workloadCron/context'
import { convexTestWithWorkers, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'

const NOW = Date.UTC(2026, 9, 1, 12)
const pool = new Workpool(components.workpool, { maxParallelism: 0 })
type Call = Omit<Doc<'capabilityCalls'>, '_id' | '_creationTime'>
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function fixture(count = 1) {
  const backend = convexTestWithWorkers()
  await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
  const workload = await backend.query(internal.workloadCron.admit, { name: 'reconcile due facilitator invocations' })
  const ids = await backend.run(async ctx => {
    const ids: WorkId[] = []
    for (let index = 0; index < count; index++) {
      ids.push(await pool.enqueueMutation(ctx, internal.workloadCron.ensurePlatformWorkloadIdentities, {}, { runAt: NOW + 86_400_000 }))
    }
    return ids
  })
  return { backend, workload, ids }
}
function call(suffix: string, workId: string, overrides: Partial<Call> = {}): Call {
  const callRef = `restored-dispatch:${suffix}`
  const toolRef = 'tool:restore-proof'
  const input = { instruction: 'original input' }
  return {
    callRef, toolRef, workId, principalId: `prn_${'1'.repeat(32)}`, ownerId: `acc_${'2'.repeat(32)}`,
    credentialId: 'credential:restore-proof', applicationRef: 'restore-proof', idempotencyKey: `original:${suffix}`,
    environment: 'sandbox', grantRef: 'grant:original', grantGeneration: 1, policyDigest: canonicalDigest('original-policy'),
    grantExpiresAt: NOW + 60_000, inputJson: JSON.stringify(input), inputDigest: canonicalDigest(input),
    requestDigest: canonicalDigest({ toolRef, input }), state: 'pending', dispatchState: 'enqueued',
    result: { kind: 'pending', callRef, toolRef, retryAfterMs: 1_000 }, createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
    ...overrides,
  }
}
async function insert(backend: ConvexFixtureBackend, rows: Call[]) {
  await backend.run(async ctx => { for (const row of rows) await ctx.db.insert('capabilityCalls', row) })
}
async function read(backend: ConvexFixtureBackend, callRef: string) {
  return await backend.run(ctx => ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique())
}
function dispatches(rows: Call[]) { return rows.map(row => ({ callRef: row.callRef, expectedWorkId: row.workId! })) }

async function seedEffect(backend: ConvexFixtureBackend, row: Call) {
  const attemptRef = 'original-attempt:restore-proof'
  const actor = { callerRef: 'restore-proof', principalRef: row.principalId }
  const time = new Date(NOW - 60_000).toISOString()
  await backend.run(async ctx => {
    await ctx.db.insert('actionExecutionControls', {
      executionRef: row.callRef, executionVersion: 1, sourceRef: row.callRef,
      currentAttemptRef: attemptRef, currentEffectGeneration: 7, updatedAt: time,
      control: {
        executionRef: row.callRef, executionVersion: 1, origin: { kind: 'standalone', ...actor }, owner: actor,
        action: { id: row.toolRef, contractVersion: '1' }, desired: { state: 'invoke' }, freshness: { state: 'not_observed' },
        control: { state: 'leased', attemptRef, effectGeneration: 7, leaseOwner: 'old-worker', leaseExpiresAt: time, release: 'possibly_released' },
      },
    })
    await ctx.db.insert('actionExecutionAttempts', {
      executionRef: row.callRef, attemptRef, attemptNumber: 1, effectGeneration: 7, actor,
      idempotency: { operationKey: row.idempotencyKey, materialInputDigest: row.inputDigest, effectIdentity: 'original-payment' },
      lease: { owner: 'old-worker', expiresAt: time }, release: { state: 'possibly_released' }, outcome: { state: 'running' }, recordedAt: time,
    })
    await ctx.db.insert('moneyProviderObligations', {
      obligationRef: 'obligation:restore-proof', callRef: row.callRef, toolRef: row.toolRef, providerRef: 'provider:original',
      buyerAccountRef: row.ownerId, buyerAsset: 'AUD', buyerExponent: 6, buyerAmountUnits: '12000',
      providerAsset: 'USDC', providerExponent: 6, providerAmountUnits: '10000', settlementMethod: 'managed_x402',
      state: 'accrued', payoutEligibility: 'ineligible_x402', evidenceRefs: ['original-evidence'], createdAt: NOW - 60_000, updatedAt: NOW - 60_000,
    })
  })
  return attemptRef
}

describe('restored dispatch quarantine through actual registered mutation and Workpool', () => {
  it('holds original financial references and effect identity, removes automatic leases, and replays without changing the receipt', async () => {
    const { backend, workload, ids } = await fixture()
    const row = call('paid-uncertainty', ids[0]!, {
      attemptRef: 'original-attempt:restore-proof', formanceFinancialState: 'possibly_submitted',
      formanceReservationRefs: ['original:aud-hold', 'original:usdc-hold'], formanceReservationDigest: canonicalDigest('original-booking'),
      reconciliation: { disposition: 'automatic', reason: 'recovery_failed', attemptCount: 2, nextAttemptAt: NOW,
        leaseOwner: 'old-worker', leaseExpiresAt: NOW + 60_000 },
    })
    await insert(backend, [row])
    const attemptRef = await seedEffect(backend, row)
    const effects = await backend.run(async ctx => ({ controls: await ctx.db.query('actionExecutionControls').collect(), attempts: await ctx.db.query('actionExecutionAttempts').collect() }))
    const args = { workload, dispatches: dispatches([row]) }
    expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, args)).toEqual({ kind: 'accepted', quarantined: 1, replayed: 0 })
    const held = await read(backend, row.callRef)
    expect(held).toMatchObject({ state: 'reconciliation_required', dispatchState: 'reconciliation_required', workId: row.workId,
      attemptRef, inputJson: row.inputJson, inputDigest: row.inputDigest, idempotencyKey: row.idempotencyKey,
      formanceFinancialState: 'outcome_unknown', formanceReservationRefs: row.formanceReservationRefs,
      formanceReservationDigest: row.formanceReservationDigest,
      result: { kind: 'reconciliation_required', evidence: { attemptRef, effectGeneration: 7, retry: 'reconcile_before_retry' } },
      reconciliation: { disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: 2, nextAttemptAt: NOW } })
    expect(held?.reconciliation).not.toHaveProperty('leaseOwner')
    expect(held?.reconciliation).not.toHaveProperty('leaseExpiresAt')
    expect(await backend.run(ctx => ctx.db.query('moneyProviderObligations').first())).toMatchObject({ state: 'held', evidenceRefs: ['original-evidence'], providerAmountUnits: '10000' })
    // Cancel has only queued retirement; the receipt must not claim finished.
    expect(await backend.run(ctx => pool.status(ctx, ids[0]!))).toEqual({ state: 'pending', previousAttempts: 0 })
    vi.setSystemTime(NOW + 5_000)
    expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, args)).toEqual({ kind: 'accepted', quarantined: 0, replayed: 1 })
    expect(await read(backend, row.callRef)).toEqual(held)
    expect(await backend.run(async ctx => ({ controls: await ctx.db.query('actionExecutionControls').collect(), attempts: await ctx.db.query('actionExecutionAttempts').collect() }))).toEqual(effects)
    await backend.mutation(internal.capabilityCalls.completeWork, { workId: ids[0]!, context: { callRef: row.callRef }, result: { kind: 'failed', error: 'late callback' } })
    expect(await read(backend, row.callRef)).toEqual(held)
  })

  it('quarantines locally unfunded and reserved records without inventing an attempt or a no-payment conclusion', async () => {
    const { backend, workload, ids } = await fixture(2)
    const unfunded = call('locally-empty', ids[0]!)
    const reserved = call('reserved', ids[1]!, { formanceFinancialState: 'reserved', formanceReservationRefs: ['original:hold'] })
    await insert(backend, [unfunded, reserved])
    expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: dispatches([unfunded, reserved]) })).toEqual({ kind: 'accepted', quarantined: 2, replayed: 0 })
    const stored = await read(backend, unfunded.callRef)
    expect(stored).toMatchObject({ state: 'reconciliation_required', result: { kind: 'reconciliation_required', evidence: {
      attemptRef: `operation-attempt:${unfunded.callRef}:1`, effectGeneration: 1, retry: 'reconcile_before_retry',
    } }, reconciliation: { disposition: 'manual_review', reason: 'unknown_settlement' } })
    expect(stored).not.toHaveProperty('attemptRef')
    expect(stored).not.toHaveProperty('formanceFinancialState')
    expect(await read(backend, reserved.callRef)).toMatchObject({ formanceFinancialState: 'outcome_unknown', formanceReservationRefs: ['original:hold'] })
    expect(await backend.run(ctx => ctx.db.query('actionExecutionAttempts').collect())).toEqual([])
  })

  it('serializes duplicate concurrent quarantine and preserves a row attempt when canonical control is absent', async () => {
    const { backend, workload, ids } = await fixture()
    const row = call('concurrent', ids[0]!, { attemptRef: 'original:row-attempt' })
    await insert(backend, [row])
    const args = { workload, dispatches: dispatches([row]) }
    const receipts = await Promise.all([backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, args), backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, args)])
    expect(receipts).toEqual(expect.arrayContaining([{ kind: 'accepted', quarantined: 1, replayed: 0 }, { kind: 'accepted', quarantined: 0, replayed: 1 }]))
    expect(await read(backend, row.callRef)).toMatchObject({ attemptRef: row.attemptRef, result: { evidence: { attemptRef: row.attemptRef } } })
  })

  it('normalizes eligible manual unknown records with old leases instead of treating incomplete quarantine as replay', async () => {
    const { backend, workload, ids } = await fixture()
    const row = call('manual-with-old-lease', ids[0]!, {
      state: 'reconciliation_required', formanceFinancialState: 'reserved', formanceReservationRefs: ['original:hold'],
      result: { kind: 'reconciliation_required', callRef: 'restored-dispatch:manual-with-old-lease', toolRef: 'tool:restore-proof',
        evidence: { attemptRef: 'original:manual-attempt', effectGeneration: 1, requiredAt: new Date(NOW - 60_000).toISOString(),
          retry: 'reconcile_before_retry', evidenceSource: 'published-tool:tool:restore-proof' } },
      reconciliation: { disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: 3, nextAttemptAt: NOW - 60_000,
        leaseOwner: 'old-worker', leaseExpiresAt: NOW + 60_000 },
    })
    await insert(backend, [row])
    const args = { workload, dispatches: dispatches([row]) }
    expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, args)).toEqual({ kind: 'accepted', quarantined: 1, replayed: 0 })
    const held = await read(backend, row.callRef)
    expect(held).toMatchObject({ dispatchState: 'reconciliation_required', formanceFinancialState: 'outcome_unknown',
      reconciliation: { disposition: 'manual_review', reason: 'unknown_settlement', attemptCount: 3, nextAttemptAt: NOW } })
    expect(held?.reconciliation).not.toHaveProperty('leaseOwner')
    expect(held?.reconciliation).not.toHaveProperty('leaseExpiresAt')
    expect(held?.result).toEqual(row.result)
    expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, args)).toEqual({ kind: 'accepted', quarantined: 0, replayed: 1 })
    expect(await read(backend, row.callRef)).toEqual(held)
  })

  it('refuses pending owner approval rather than converting an unapproved request into a restored dispatch', async () => {
    const { backend, workload, ids } = await fixture()
    const row = call('approval', ids[0]!, { result: {
      kind: 'needs_authority', callRef: 'restored-dispatch:approval', toolRef: 'tool:restore-proof',
      authorityRequest: { kind: 'approval_required', toolRef: 'tool:restore-proof', consequence: 'external_effect',
        retryClass: 'reconcile_before_retry', dataFields: ['instruction'] },
    } })
    await insert(backend, [row])
    expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: dispatches([row]) }))
      .toEqual({ kind: 'refused', callRef: row.callRef, code: 'state_changed' })
    expect(await read(backend, row.callRef)).toMatchObject({ state: 'pending', result: row.result })
    expect(await backend.run(ctx => pool.status(ctx, ids[0]!))).toEqual({ state: 'pending', previousAttempts: 0 })
  })

  it('prevalidates all exact rows and leaves the entire batch unchanged for stale, missing or terminal targets', async () => {
    const { backend, workload, ids } = await fixture(3)
    const first = call('eligible', ids[0]!)
    const stale = call('changed-generation', ids[1]!)
    const terminal = call('terminal', ids[2]!, { state: 'refused', result: { kind: 'refused', code: 'pre_release_failed', retryable: false } })
    await insert(backend, [first, stale, terminal])
    const before = await backend.run(ctx => ctx.db.query('capabilityCalls').collect())
    for (const [target, code] of [
      [{ callRef: stale.callRef, expectedWorkId: ids[2]! }, 'dispatch_changed'],
      [dispatches([terminal])[0]!, 'state_changed'],
      [{ callRef: 'missing:call', expectedWorkId: ids[1]! }, 'not_found'],
    ] as const) {
      expect(await backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: [dispatches([first])[0]!, target] })).toEqual({ kind: 'refused', callRef: target.callRef, code })
      expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual(before)
    }
  })

  it('rejects malformed bounds, duplicate identities and lost workload authority before changing records', async () => {
    const { backend, workload, ids } = await fixture(2)
    const rows = [call('authority', ids[0]!), call('other', ids[1]!)]
    await insert(backend, rows)
    const pair = dispatches(rows)
    for (const batch of [[], Array.from({ length: 26 }, () => pair[0]!), [pair[0]!, pair[0]!],
      [pair[0]!, { ...pair[1]!, expectedWorkId: pair[0]!.expectedWorkId }], [{ callRef: ' ', expectedWorkId: ids[0]! }],
      [{ callRef: 'a'.repeat(501), expectedWorkId: ids[0]! }], [{ callRef: rows[0]!.callRef, expectedWorkId: 'x'.repeat(201) }]]) {
      await expect(backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: batch })).rejects.toThrow('restored_dispatch_batch_invalid')
    }
    await expect(backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload: { ...workload, name: 'refresh market flow' }, dispatches: pair })).rejects.toThrow('workload_snapshot_invalid')
    await backend.run(async ctx => {
      const principal = await ctx.db.query('principals').withIndex('by_principalRef', q => q.eq('principalRef', SYSTEM_WORKLOAD_PRINCIPAL_REF)).unique()
      if (principal === null) throw new Error('workload_fixture_missing')
      await ctx.db.patch(principal._id, { lifecycle: 'suspended', revision: 2 })
    })
    await expect(backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: pair })).rejects.toThrow()
    for (const row of rows) expect(await read(backend, row.callRef)).toMatchObject({ state: 'pending', result: row.result })
  })

  it('rolls back earlier quarantine and financial projections when a later real component cancellation fails', async () => {
    const { backend, workload, ids } = await fixture()
    const first = call('rollback', ids[0]!, { formanceFinancialState: 'reserved', formanceReservationRefs: ['original:hold'] })
    const broken = call('broken-work', 'not-a-native-work-id')
    await insert(backend, [first, broken])
    const before = await backend.run(ctx => ctx.db.query('capabilityCalls').collect())
    await expect(backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: dispatches([first, broken]) })).rejects.toThrow()
    expect(await backend.run(ctx => ctx.db.query('capabilityCalls').collect())).toEqual(before)
  })

  it('aborts rather than claims a financial hold for a reserved row missing its reservation evidence', async () => {
    const { backend, workload, ids } = await fixture()
    const row = call('malformed-finance', ids[0]!, { formanceFinancialState: 'reserved' })
    await insert(backend, [row])
    await expect(backend.mutation(internal.capabilityCalls.quarantineRestoredDispatches, { workload, dispatches: dispatches([row]) })).rejects.toThrow('managed_call_reservation_not_found')
    expect(await read(backend, row.callRef)).toMatchObject({ state: 'pending', formanceFinancialState: 'reserved' })
  })
})
