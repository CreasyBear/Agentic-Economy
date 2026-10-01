import { Workpool, vOnCompleteArgs, type WorkId } from '@convex-dev/workpool'
import {
  internalActionGeneric as action, internalMutationGeneric as mutation, internalQueryGeneric as query,
  makeFunctionReference, type FunctionReturnType,
} from 'convex/server'
import { v, type Infer } from 'convex/values'
import { components, internal } from '../../convex/_generated/api'
import type { QueryCtx } from '../../convex/_generated/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'

// TEMP ONLY: copied into disposable native deployments; never added to the app's API/schema.
// Requires real component-created WorkIDs and the maintained workload admission.
// Ensures original queued work runs unconditionally, with a separately counted completion;
// stranded Call recovery preserves financial/attempt identity and cannot claim a refund.
// Invariant: no component-table writes, Provider call, signing or native ledger booking.
// On missing/duplicate fixture material fail with a code, rather than inventing an empty result.
const pool = new Workpool(components.workpool, { maxParallelism: 32 })
const kindValue = v.union(v.literal('active'), v.literal('unfunded'), v.literal('held'), v.literal('possibly_released'))
const entryValue = v.object({ callRef: v.string(), workId: v.string(), kind: kindValue, identityDigest: v.string() })
export const workRecoveryProofControlValue = v.union(
  v.object({ kind: v.literal('queued'), workId: v.string(), count: v.number(), completions: v.number(), callbackWorkId: v.optional(v.string()) }),
  v.object({ kind: v.literal('calls'), createdBefore: v.number(), fixtureDigest: v.string(), entries: v.array(entryValue) }),
)
type Entry = Infer<typeof entryValue>
const proof = {
  increment: makeFunctionReference<'mutation', Record<string, never>, null>('workRecoveryProof:increment'),
  completeQueued: makeFunctionReference<'mutation', {
    workId: string; context: { proof: string }
    result: { kind: 'success'; returnValue: null } | { kind: 'failed'; error: string } | { kind: 'canceled' }
  }, null>('workRecoveryProof:completeQueued'),
  noEffect: makeFunctionReference<'mutation', { callRef: string }, null>('workRecoveryProof:noEffect'),
  lostCompletion: makeFunctionReference<'mutation', {
    workId: string; context: { callRef: string }
    result: { kind: 'success'; returnValue: null } | { kind: 'failed'; error: string } | { kind: 'canceled' }
  }, null>('workRecoveryProof:lostCompletion'),
  seedActiveCalls: makeFunctionReference<'mutation', { runAt: number }, null>('workRecoveryProof:seedActiveCalls'),
  seedStrandedCalls: makeFunctionReference<'mutation', Record<string, never>, {
    createdBefore: number; fixtureDigest: string; active: number; stranded: number
  }>('workRecoveryProof:seedStrandedCalls'),
}
const recoveryResultValue = v.object({
  scanned: v.number(), recovered: v.number(), waiting: v.number(), unbound: v.number(),
  continueCursor: v.string(), isDone: v.boolean(),
})
const reconcileFinished = makeFunctionReference<'mutation', {
  workload: FunctionReturnType<typeof internal.workloadCron.admit>
  cursor: string | null; createdBefore: number
}, Infer<typeof recoveryResultValue>>('capabilityCalls:reconcileFinishedDispatches')

function originalIdentity(row: Record<string, unknown>): string {
  return canonicalDigest({
    callRef: row.callRef, principalId: row.principalId, ownerId: row.ownerId,
    credentialId: row.credentialId, applicationRef: row.applicationRef, toolRef: row.toolRef,
    idempotencyKey: row.idempotencyKey, environment: row.environment, grantRef: row.grantRef,
    grantGeneration: row.grantGeneration, policyDigest: row.policyDigest, grantExpiresAt: row.grantExpiresAt,
    toolJson: row.toolJson, inputJson: row.inputJson, inputDigest: row.inputDigest,
    requestDigest: row.requestDigest, workId: row.workId, createdAt: row.createdAt,
    reservationRefs: row.formanceReservationRefs ?? null,
    financialState: row.formanceFinancialState ?? null,
  })
}

export const seedQueued = mutation({
  args: { runAt: v.number() }, returns: v.object({ workId: v.string() }),
  handler: async (ctx, args): Promise<{ workId: string }> => {
    if (!Number.isSafeInteger(args.runAt) || args.runAt <= Date.now()) throw new Error('proof_run_at_invalid')
    if ((await ctx.db.query('workRecoveryProof').collect()).some(row => row.kind === 'queued')) {
      throw new Error('proof_queued_already_seeded')
    }
    const workId = await pool.enqueueMutation(ctx, proof.increment, {}, {
      runAt: args.runAt, onComplete: proof.completeQueued, context: { proof: 'queued' },
    })
    await ctx.db.insert('workRecoveryProof', { kind: 'queued', workId, count: 0, completions: 0 })
    return { workId }
  },
})

export const increment = mutation({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const control = (await ctx.db.query('workRecoveryProof').collect()).find(row => row.kind === 'queued')
    if (control === undefined) throw new Error('proof_queued_missing')
    // Deliberately unconditional: a second execution is observable, not hidden by fixture dedupe.
    await ctx.db.patch(control._id, { count: control.count + 1 })
    return null
  },
})

export const completeQueued = mutation({
  args: vOnCompleteArgs(v.object({ proof: v.string() }), v.null()), returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const control = (await ctx.db.query('workRecoveryProof').collect()).find(row => row.kind === 'queued')
    if (control === undefined || args.context.proof !== 'queued' || control.workId !== args.workId
      || args.result.kind !== 'success') throw new Error('proof_queued_completion_invalid')
    await ctx.db.patch(control._id, { callbackWorkId: args.workId, completions: control.completions + 1 })
    return null
  },
})

export const readQueued = query({
  args: {}, returns: v.object({ workId: v.string(), state: v.union(v.literal('pending'), v.literal('running'), v.literal('finished')),
    count: v.number(), callbackWorkId: v.union(v.string(), v.null()), completions: v.number() }),
  handler: async (ctx) => {
    const control = (await ctx.db.query('workRecoveryProof').collect()).find(row => row.kind === 'queued')
    if (control === undefined) throw new Error('proof_queued_missing')
    const status = await pool.status(ctx, control.workId as WorkId)
    return { workId: control.workId, state: status.state, count: control.count,
      callbackWorkId: control.callbackWorkId ?? null, completions: control.completions }
  },
})

export const noEffect = mutation({
  args: { callRef: v.string() }, returns: v.null(),
  handler: async (_ctx, _args): Promise<null> => null,
})

export const lostCompletion = mutation({
  args: vOnCompleteArgs(v.object({ callRef: v.string() }), v.null()), returns: v.null(),
  // This intentionally omits the app projection to model a lost consumer. It is NOT
  // a claim that the maintained successful completion callback has this behavior.
  handler: async (_ctx, _args): Promise<null> => null,
})

function callMaterial(kind: Entry['kind'], ordinal: number, createdAt: number, workId: string) {
  const callRef = `work-recovery-call:${kind}:${ordinal}`
  const toolRef = 'work-recovery-tool:synthetic'
  const input = { fixture: 'work-recovery', kind, ordinal }
  return {
    callRef, principalId: 'prn_f3000000000000000000000000000001', ownerId: 'acc_f3000000000000000000000000000001',
    credentialId: 'work-recovery-credential', applicationRef: 'work-recovery-proof', toolRef,
    idempotencyKey: `work-recovery-key:${kind}:${ordinal}`, environment: 'sandbox' as const,
    grantRef: 'work-recovery-grant', grantGeneration: 1, policyDigest: canonicalDigest({ fixture: 'policy' }),
    grantExpiresAt: createdAt + 7 * 86_400_000,
    toolJson: JSON.stringify({ toolRef, fixture: true }), inputJson: JSON.stringify(input),
    inputDigest: canonicalDigest(input), requestDigest: canonicalDigest({ toolRef, input }),
    state: 'pending' as const, dispatchState: 'enqueued' as const, workId,
    result: { kind: 'pending' as const, callRef, toolRef, retryAfterMs: 1_000 },
    createdAt, updatedAt: createdAt,
    ...(kind === 'held' || kind === 'possibly_released' ? {
      formanceReservationRefs: [`fixture-reservation:${callRef}`],
      formanceFinancialState: kind === 'held' ? 'reserved' as const : 'outcome_unknown' as const,
    } : {}),
    ...(kind === 'possibly_released' ? { attemptRef: `work-recovery-attempt:${callRef}` } : {}),
  }
}

export const seedActiveCalls = mutation({
  args: { runAt: v.number() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    if (!Number.isSafeInteger(args.runAt) || args.runAt <= Date.now()) throw new Error('proof_run_at_invalid')
    if ((await ctx.db.query('workRecoveryProof').collect()).some(row => row.kind === 'calls')) {
      throw new Error('proof_calls_already_seeded')
    }
    const createdBefore = Date.now() - 3_600_000
    const entries: Entry[] = []
    for (let ordinal = 0; ordinal < 25; ordinal++) {
      const callRef = `work-recovery-call:active:${ordinal}`
      const workId = await pool.enqueueMutation(ctx, proof.noEffect, { callRef }, {
        runAt: args.runAt, onComplete: proof.lostCompletion, context: { callRef },
      })
      const material = callMaterial('active', ordinal, createdBefore, workId)
      await ctx.db.insert('capabilityCalls', material)
      entries.push({ callRef, workId, kind: 'active', identityDigest: originalIdentity(material) })
    }
    await ctx.db.insert('workRecoveryProof', { kind: 'calls', createdBefore, entries, fixtureDigest: canonicalDigest(entries) })
    return null
  },
})

export const seedStrandedCalls = mutation({
  args: {}, returns: v.object({ createdBefore: v.number(), fixtureDigest: v.string(), active: v.number(), stranded: v.number() }),
  handler: async (ctx): Promise<{ createdBefore: number; fixtureDigest: string; active: number; stranded: number }> => {
    const control = (await ctx.db.query('workRecoveryProof').collect()).find(row => row.kind === 'calls')
    if (control === undefined || control.entries.length !== 25) throw new Error('proof_calls_missing')
    const entries: Entry[] = [...control.entries]
    for (const [ordinal, kind] of (['unfunded', 'held', 'possibly_released'] as const).entries()) {
      const callRef = `work-recovery-call:${kind}:${ordinal}`
      const workId = await pool.enqueueMutation(ctx, proof.noEffect, { callRef }, {
        ...(kind === 'held' ? { runAt: Date.now() + 86_400_000 } : {}),
        onComplete: proof.lostCompletion, context: { callRef },
      })
      if (kind === 'held') await pool.cancel(ctx, workId)
      const material = callMaterial(kind, ordinal, control.createdBefore, workId)
      await ctx.db.insert('capabilityCalls', material)
      entries.push({ callRef, workId, kind, identityDigest: originalIdentity(material) })
      if (kind === 'possibly_released') {
        const attemptRef = `work-recovery-attempt:${callRef}`
        const leaseExpiresAt = new Date(control.createdBefore + 60_000).toISOString()
        const owner = { principalRef: material.principalId, callerRef: material.credentialId }
        await ctx.db.insert('actionExecutionControls', {
          executionRef: callRef, executionVersion: 3, sourceRef: `operation-invocation-source:${callRef}`,
          preparedMaterialDigest: material.inputDigest, updatedAt: new Date(control.createdBefore).toISOString(),
          currentAttemptRef: attemptRef, currentEffectGeneration: 1,
          currentLeaseOwner: 'work-recovery-original-worker', currentLeaseExpiresAt: leaseExpiresAt,
          control: {
            executionRef: callRef, executionVersion: 3,
            origin: { kind: 'standalone', ...owner }, owner,
            action: { id: material.toolRef, contractVersion: '1' }, desired: { state: 'invoke' },
            freshness: { state: 'current', observedAt: new Date(control.createdBefore).toISOString() },
            control: { state: 'leased', attemptRef, effectGeneration: 1, leaseOwner: 'work-recovery-original-worker',
              leaseExpiresAt, release: 'possibly_released' },
          },
        })
      }
    }
    const fixtureDigest = canonicalDigest(entries)
    await ctx.db.patch(control._id, { entries, fixtureDigest })
    return { createdBefore: control.createdBefore, fixtureDigest, active: 25, stranded: 3 }
  },
})

export const seedCalls = action({
  args: { runAt: v.number() }, returns: v.object({ createdBefore: v.number(), fixtureDigest: v.string(), active: v.number(), stranded: v.number() }),
  handler: async (ctx, args): Promise<{ createdBefore: number; fixtureDigest: string; active: number; stranded: number }> => {
    await ctx.runMutation(internal.workloadCron.ensurePlatformWorkloadIdentities, {})
    // Separate transactions make the 25 active rows precede the three stranded rows
    // in the native cursor's creation-order tie-breaker, while createdAt remains identical.
    await ctx.runMutation(proof.seedActiveCalls, args)
    return await ctx.runMutation(proof.seedStrandedCalls, {})
  },
})

export const readCalls = query({
  args: {}, returns: v.object({
    createdBefore: v.number(), fixtureDigest: v.string(), identitiesPreserved: v.boolean(), activePrefix: v.boolean(),
    activePending: v.number(), workFinished: v.number(),
    states: v.array(v.object({ callRef: v.string(), kind: kindValue, state: v.string(), resultKind: v.string(),
      workState: v.string(), attemptRef: v.union(v.string(), v.null()), effectGeneration: v.union(v.number(), v.null()),
      financialState: v.union(v.string(), v.null()), reservationRefsPreserved: v.boolean(),
      reconciliation: v.union(v.null(), v.object({ disposition: v.string(), reason: v.string() })),
    })),
  }),
  handler: async (ctx) => {
    const control = (await ctx.db.query('workRecoveryProof').collect()).find(row => row.kind === 'calls')
    if (control === undefined || control.entries.length !== 28) throw new Error('proof_calls_missing')
    const states = []
    let identitiesPreserved = true
    let activePending = 0
    let workFinished = 0
    for (const entry of control.entries as Entry[]) {
      const row = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', entry.callRef)).unique()
      if (row === null) throw new Error('proof_call_missing')
      identitiesPreserved &&= originalIdentity(row) === entry.identityDigest
      const status = await pool.status(ctx, entry.workId as WorkId)
      if (entry.kind === 'active' && row.state === 'pending' && status.state === 'pending') activePending++
      if (entry.kind !== 'active' && status.state === 'finished') workFinished++
      const canonical = await ctx.db.query('actionExecutionControls').withIndex('by_executionRef', q => q.eq('executionRef', entry.callRef)).unique()
      states.push({ callRef: entry.callRef, kind: entry.kind, state: row.state, resultKind: row.result?.kind ?? 'missing',
        workState: status.state, attemptRef: row.attemptRef ?? null, effectGeneration: canonical?.currentEffectGeneration ?? null,
        financialState: row.formanceFinancialState ?? null,
        reservationRefsPreserved: entry.kind === 'active' || entry.kind === 'unfunded'
          ? row.formanceReservationRefs === undefined
          : JSON.stringify(row.formanceReservationRefs) === JSON.stringify([`fixture-reservation:${entry.callRef}`]),
        reconciliation: row.reconciliation === undefined ? null
          : { disposition: row.reconciliation.disposition, reason: row.reconciliation.reason },
      })
    }
    const prefix = await (ctx.db as QueryCtx['db']).query('capabilityCalls').withIndex('by_state_and_result_kind_and_createdAt', q =>
      q.eq('state', 'pending').eq('result.kind', 'pending').lte('createdAt', control.createdBefore)).take(25)
    return { createdBefore: control.createdBefore, fixtureDigest: control.fixtureDigest, identitiesPreserved,
      activePrefix: prefix.length === 25 && prefix.every(row => row.callRef.startsWith('work-recovery-call:active:')),
      activePending, workFinished, states }
  },
})

export const beginCallRecovery = action({
  args: {}, returns: recoveryResultValue,
  handler: async (ctx): Promise<Infer<typeof recoveryResultValue>> => {
    const snapshot = await ctx.runQuery(internal.workloadCron.admit, { name: 'reconcile due facilitator invocations' })
    // Read only the synthetic control through a fixture query; application recovery is production code.
    const summary = await ctx.runQuery(makeFunctionReference<'query', Record<string, never>, { createdBefore: number }>(
      'workRecoveryProof:readCallCutoff'), {})
    return await ctx.runMutation(reconcileFinished, { workload: snapshot, cursor: null, createdBefore: summary.createdBefore })
  },
})

export const readCallCutoff = query({
  args: {}, returns: v.object({ createdBefore: v.number() }),
  handler: async (ctx) => {
    const control = (await ctx.db.query('workRecoveryProof').collect()).find(row => row.kind === 'calls')
    if (control === undefined) throw new Error('proof_calls_missing')
    return { createdBefore: control.createdBefore }
  },
})
