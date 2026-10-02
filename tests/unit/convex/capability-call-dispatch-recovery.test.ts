import { Workpool, type WorkId } from '@convex-dev/workpool'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { components, internal } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { reconcileFinishedDispatchesHandler } from '../../../convex/lib/capabilityExecution/callLifecycle/reconciliation'
import { SYSTEM_WORKLOAD_PRINCIPAL_REF } from '../../../convex/lib/platform/workloadCron/context'
import { convexTestWithWorkers, type ConvexFixtureBackend } from '../../helpers/convex-fixtures'

const NOW = Date.UTC(2026, 9, 1, 12)
const CUTOFF = NOW - 60_000
const pausedPool = new Workpool(components.workpool, { maxParallelism: 0 })
const workingPool = new Workpool(components.workpool, { maxParallelism: 1 })
type Call = Omit<Doc<'capabilityCalls'>, '_id' | '_creationTime'>

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development') })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

async function fixture() {
  const backend = convexTestWithWorkers()
  await backend.mutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
  const workload = await backend.query(internal.workloadCron.admit, { name: 'reconcile due facilitator invocations' })
  return { backend, args: { workload, cursor: null, createdBefore: CUTOFF } }
}

function call(suffix: string, workId?: string, overrides: Partial<Call> = {}): Call {
  const callRef = `dispatch-recovery:${suffix}`
  const toolRef = 'tool:dispatch-recovery'
  const input = { request: 'preserve this exact input' }
  return {
    callRef, principalId: `prn_${'1'.repeat(32)}`, ownerId: `acc_${'2'.repeat(32)}`,
    credentialId: 'credential:dispatch-recovery', applicationRef: 'dispatch-recovery', toolRef,
    idempotencyKey: `original:${suffix}`, environment: 'sandbox', grantRef: 'grant:original',
    grantGeneration: 1, policyDigest: canonicalDigest('original-policy'), grantExpiresAt: NOW + 60_000,
    inputJson: JSON.stringify(input), inputDigest: canonicalDigest(input), requestDigest: canonicalDigest({ toolRef, input }),
    state: 'pending', dispatchState: 'enqueued', result: { kind: 'pending', callRef, toolRef, retryAfterMs: 1_000 },
    createdAt: CUTOFF, updatedAt: CUTOFF,
    ...(workId === undefined ? {} : { workId }), ...overrides,
  }
}

async function insert(backend: ConvexFixtureBackend, rows: Call[]) {
  await backend.run(async ctx => { for (const row of rows) await ctx.db.insert('capabilityCalls', row) })
}
async function read(backend: ConvexFixtureBackend, callRef: string) {
  return await backend.run(ctx => ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', callRef)).unique())
}

async function finishedWork(backend: ConvexFixtureBackend, count = 1): Promise<WorkId[]> {
  const ids = await backend.run(async ctx => {
    const work: WorkId[] = []
    for (let index = 0; index < count; index++) {
      work.push(await workingPool.enqueueMutation(ctx, internal.workloadCron.ensurePlatformWorkloadIdentities, {}))
    }
    return work
  })
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  for (const id of ids) expect(await backend.run(ctx => workingPool.status(ctx, id))).toEqual({ state: 'finished' })
  return ids
}

async function queuedWork(backend: ConvexFixtureBackend, count = 1): Promise<WorkId[]> {
  return await backend.run(async ctx => {
    const work: WorkId[] = []
    for (let index = 0; index < count; index++) {
      work.push(await pausedPool.enqueueMutation(ctx, internal.workloadCron.ensurePlatformWorkloadIdentities, {}, { runAt: Date.now() + 86_400_000 }))
    }
    return work
  })
}

async function releasedControl(backend: ConvexFixtureBackend, row: Call) {
  const attemptRef = `original-attempt:${row.callRef}`
  const time = new Date(NOW).toISOString()
  const actor = { callerRef: 'dispatch-recovery', principalRef: row.principalId }
  await backend.run(async ctx => {
    await ctx.db.insert('actionExecutionControls', {
      executionRef: row.callRef, executionVersion: 1, sourceRef: row.callRef,
      currentAttemptRef: attemptRef, currentEffectGeneration: 7, updatedAt: time,
      control: {
        executionRef: row.callRef, executionVersion: 1, origin: { kind: 'standalone', ...actor }, owner: actor,
        action: { id: row.toolRef, contractVersion: '1' }, desired: { state: 'invoke' }, freshness: { state: 'not_observed' },
        control: { state: 'leased', attemptRef, effectGeneration: 7, leaseOwner: 'original-worker',
          leaseExpiresAt: time, release: 'possibly_released' },
      },
    })
    await ctx.db.insert('actionExecutionAttempts', {
      executionRef: row.callRef, attemptRef, attemptNumber: 1, effectGeneration: 7, actor,
      idempotency: { operationKey: row.idempotencyKey, materialInputDigest: row.inputDigest, effectIdentity: 'original-payment' },
      lease: { owner: 'original-worker', expiresAt: time }, release: { state: 'possibly_released' },
      outcome: { state: 'running' }, recordedAt: time,
    })
  })
  return attemptRef
}

describe('finished dispatch recovery through registered Convex and maintained Workpool', () => {
  it('visits equal-timestamp later pages behind 25 active jobs, preserving cutoff and continuation authority', async () => {
    const { backend, args } = await fixture()
    const finished = await finishedWork(backend, 3)
    const active = await queuedWork(backend, 25)
    const waiting = active.map((id, index) => call(`active-${index}`, id))
    const recoverable = finished.map((id, index) => call(`finished-${index}`, id))
    const future = call('future', finished[0], { createdAt: CUTOFF + 1 })
    await insert(backend, [...waiting, ...recoverable, future])
    const page = await backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)
    expect(page).toMatchObject({ scanned: 25, recovered: 0, waiting: 25, unbound: 0, isDone: false })
    expect(page.continueCursor).not.toBe('')
    // Execute the same native cursor emitted by the first transaction. The actual
    // registered scheduler continuation is independently exercised by the native proof.
    const next = await backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, { ...args, cursor: page.continueCursor })
    expect(next).toMatchObject({ scanned: 3, recovered: 3, waiting: 0, unbound: 0, isDone: true })
    for (const row of recoverable) expect(await read(backend, row.callRef)).toMatchObject({ state: 'refused', result: { code: 'pre_release_failed' } })
    for (const row of [...waiting, future]) expect(await read(backend, row.callRef)).toMatchObject({ state: 'pending', workId: row.workId })
    const scheduled = await backend.run(ctx => ctx.db.system.query('_scheduled_functions').collect())
    const continuation = scheduled.find(row => row.name === 'capabilityCalls:reconcileFinishedDispatches')
    expect(continuation?.args).toEqual([{ workload: expect.objectContaining({ name: args.workload.name }), cursor: page.continueCursor, createdBefore: CUTOFF }])
  })

  it('preserves a possibly released effect, original attempt and reserved material without creating another attempt', async () => {
    const { backend, args } = await fixture()
    const [workId] = await finishedWork(backend)
    const row = call('uncertain', workId, { formanceFinancialState: 'outcome_unknown',
      formanceReservationRefs: ['original:aud-hold', 'original:usdc-hold'], formanceReservationDigest: canonicalDigest('original-booking') })
    await insert(backend, [row])
    const attemptRef = await releasedControl(backend, row)
    const before = await backend.run(async ctx => ({ controls: await ctx.db.query('actionExecutionControls').collect(), attempts: await ctx.db.query('actionExecutionAttempts').collect() }))
    expect(await backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)).toMatchObject({ recovered: 1 })
    const stored = await read(backend, row.callRef)
    expect(stored).toMatchObject({ state: 'reconciliation_required', dispatchState: 'reconciliation_required', attemptRef,
      formanceFinancialState: row.formanceFinancialState, formanceReservationRefs: row.formanceReservationRefs,
      formanceReservationDigest: row.formanceReservationDigest, inputJson: row.inputJson, inputDigest: row.inputDigest,
      result: { kind: 'reconciliation_required', evidence: { attemptRef, effectGeneration: 7, retry: 'reconcile_before_retry' } },
      reconciliation: { disposition: 'automatic', attemptCount: 0 } })
    expect(await backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)).toMatchObject({ scanned: 0, recovered: 0 })
    expect(await backend.run(async ctx => ({ controls: await ctx.db.query('actionExecutionControls').collect(), attempts: await ctx.db.query('actionExecutionAttempts').collect() }))).toEqual(before)
  })

  it('keeps reserved pre-release failures held and refuses unfunded failures', async () => {
    const { backend, args } = await fixture()
    const work = await finishedWork(backend, 2)
    const reserved = call('reserved', work[0], { formanceFinancialState: 'reserved', formanceReservationRefs: ['reservation:original'] })
    const unfunded = call('unfunded', work[1])
    await insert(backend, [reserved, unfunded, call('unbound')])
    expect(await backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)).toMatchObject({ recovered: 2, unbound: 1 })
    expect(await read(backend, reserved.callRef)).toMatchObject({ state: 'reconciliation_required', formanceFinancialState: 'reserved', formanceReservationRefs: ['reservation:original'] })
    expect(await read(backend, unfunded.callRef)).toMatchObject({ state: 'refused', result: { kind: 'refused', code: 'pre_release_failed' } })
    expect(await read(backend, 'dispatch-recovery:unbound')).toMatchObject({ state: 'pending' })
  })

  it('ignores old completion generations, terminal Calls and concurrent duplicate sweeps', async () => {
    const { backend, args } = await fixture()
    const [oldWork] = await finishedWork(backend)
    const [newWork] = await queuedWork(backend)
    const rearmed = call('rearmed', newWork)
    const terminal = call('terminal', oldWork, { state: 'refused', result: { kind: 'refused', code: 'pre_release_failed', retryable: false } })
    await insert(backend, [rearmed, terminal])
    await backend.mutation(internal.capabilityCalls.completeWork, { workId: oldWork!, context: { callRef: rearmed.callRef }, result: { kind: 'failed', error: 'late original callback' } })
    expect(await read(backend, rearmed.callRef)).toMatchObject({ state: 'pending', workId: newWork })
    const results = await Promise.all([backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args), backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)])
    expect(results.map(value => value.recovered)).toEqual([0, 0])
    expect(await read(backend, terminal.callRef)).toMatchObject({ state: 'refused', result: terminal.result })
    const completed = call('duplicate', oldWork)
    await insert(backend, [completed])
    const duplicates = await Promise.all([backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args), backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)])
    expect(duplicates.reduce((sum, value) => sum + value.recovered, 0)).toBe(1)
  })

  it('revalidates canonical workload authority on each page and refuses invalid cutoff/cursor before writes', async () => {
    const { backend, args } = await fixture()
    await insert(backend, [call('bounds')])
    for (const createdBefore of [-1, NOW + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, { ...args, createdBefore })).rejects.toThrow('dispatch_reconciliation_cutoff_invalid')
    }
    await expect(backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, { ...args, cursor: '' })).rejects.toThrow('dispatch_reconciliation_cursor_invalid')
    await expect(backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, { ...args, workload: { ...args.workload, name: 'refresh market flow' } })).rejects.toThrow('workload_snapshot_invalid')
    await backend.run(async ctx => {
      const principal = await ctx.db.query('principals').withIndex('by_principalRef', q => q.eq('principalRef', SYSTEM_WORKLOAD_PRINCIPAL_REF)).unique()
      if (principal === null) throw new Error('workload_fixture_missing')
      await ctx.db.patch(principal._id, { lifecycle: 'suspended', revision: 2 })
    })
    await expect(backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)).rejects.toThrow()
    expect(await read(backend, 'dispatch-recovery:bounds')).toMatchObject({ state: 'pending' })
  })

  it('rolls back earlier recovered rows if a later actual component status read fails', async () => {
    const { backend, args } = await fixture()
    const [workId] = await finishedWork(backend)
    const first = call('rollback-first', workId)
    await insert(backend, [first, call('rollback-broken', 'not-a-native-work-id')])
    await expect(backend.mutation(internal.capabilityCalls.reconcileFinishedDispatches, args)).rejects.toThrow()
    expect(await read(backend, first.callRef)).toMatchObject({ state: 'pending', result: first.result })
  })

  it('rolls back the page when continuation scheduling fails', async () => {
    const { backend, args } = await fixture()
    const [workId] = await finishedWork(backend)
    const rows = Array.from({ length: 26 }, (_, index) => call(`schedule-${index}`, workId))
    await insert(backend, rows)
    await expect(backend.mutation(async ctx => await reconcileFinishedDispatchesHandler({ ...ctx,
      scheduler: { ...ctx.scheduler, runAfter: async () => { throw new Error('fixture_scheduler_unavailable') } },
    }, args))).rejects.toThrow('fixture_scheduler_unavailable')
    for (const row of rows) expect(await read(backend, row.callRef)).toMatchObject({ state: 'pending' })
  })
})
