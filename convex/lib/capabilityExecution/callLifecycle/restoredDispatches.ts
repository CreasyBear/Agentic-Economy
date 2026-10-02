import { v, type Infer } from 'convex/values'
import type { WorkId } from '@convex-dev/workpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import { markOutcomeUnknownHandler } from '../../money/managedCall/transitions'
import { reconcileWorkloadCronSnapshot } from '../../platform/workloadCron/admission'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue } from '../../platform/workloadCron/context'

const dispatchValue = v.object({ callRef: v.string(), expectedWorkId: v.string() })
export const quarantineRestoredDispatchesArgs = {
  workload: workloadCronSnapshotValue,
  dispatches: v.array(dispatchValue),
} as const
export const quarantineRestoredDispatchesResult = v.union(
  v.object({ kind: v.literal('accepted'), quarantined: v.number(), replayed: v.number() }),
  v.object({ kind: v.literal('refused'), callRef: v.string(), code: v.union(
    v.literal('not_found'), v.literal('dispatch_changed'), v.literal('state_changed'),
  ) }),
)

type Call = Doc<'capabilityCalls'>
function isEligibleQuarantine(row: Call): boolean {
  return row.state === 'reconciliation_required'
    && row.result?.kind === 'reconciliation_required'
    && row.reconciliation?.disposition === 'manual_review'
    && row.reconciliation.reason === 'unknown_settlement'
}

function isQuarantined(row: Call): boolean {
  return isEligibleQuarantine(row)
    && row.dispatchState === 'reconciliation_required'
    && row.reconciliation?.leaseOwner === undefined
    && row.reconciliation?.leaseExpiresAt === undefined
    && row.formanceFinancialState !== 'reserved'
    && row.formanceFinancialState !== 'possibly_submitted'
}

function validateDispatches(dispatches: Infer<typeof dispatchValue>[]): void {
  if (dispatches.length < 1 || dispatches.length > 25) throw new Error('restored_dispatch_batch_invalid')
  const calls = new Set<string>()
  const work = new Set<string>()
  for (const { callRef, expectedWorkId } of dispatches) {
    if (callRef.trim().length === 0 || callRef.length > 500
      || expectedWorkId.trim().length === 0 || expectedWorkId.length > 200
      || calls.has(callRef) || work.has(expectedWorkId)) throw new Error('restored_dispatch_batch_invalid')
    calls.add(callRef)
    work.add(expectedWorkId)
  }
}

export async function quarantineRestoredDispatchesHandler(
  ctx: MutationCtx,
  args: Readonly<{ workload: Infer<typeof workloadCronSnapshotValue>; dispatches: Infer<typeof dispatchValue>[] }>,
): Promise<Infer<typeof quarantineRestoredDispatchesResult>> {
  validateDispatches(args.dispatches)
  await reconcileWorkloadCronSnapshot(ctx, 'reconcile due facilitator invocations', parseWorkloadCronSnapshot(args.workload))
  const rows: Call[] = []
  // Validate every exact target before a financial projection or cancellation.
  for (const dispatch of args.dispatches) {
    const row = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', query => query.eq('callRef', dispatch.callRef)).unique()
    if (row === null) return { kind: 'refused', callRef: dispatch.callRef, code: 'not_found' }
    if (row.workId !== dispatch.expectedWorkId) return { kind: 'refused', callRef: dispatch.callRef, code: 'dispatch_changed' }
    if (!(row.state === 'pending' && row.result?.kind === 'pending') && !isEligibleQuarantine(row)) {
      return { kind: 'refused', callRef: dispatch.callRef, code: 'state_changed' }
    }
    rows.push(row)
  }
  const now = Date.now()
  let quarantined = 0
  let replayed = 0
  for (const row of rows) {
    if (isQuarantined(row)) {
      replayed++
    } else {
      const control = await ctx.db.query('actionExecutionControls')
        .withIndex('by_executionRef', query => query.eq('executionRef', row.callRef)).unique()
      await ctx.db.patch(row._id, {
        state: 'reconciliation_required', dispatchState: 'reconciliation_required',
        result: row.result?.kind === 'reconciliation_required' ? row.result : {
          kind: 'reconciliation_required', callRef: row.callRef, toolRef: row.toolRef,
          evidence: {
            attemptRef: control?.currentAttemptRef ?? row.attemptRef ?? `operation-attempt:${row.callRef}:1`,
            effectGeneration: control?.currentEffectGeneration ?? 1,
            requiredAt: new Date(now).toISOString(), retry: 'reconcile_before_retry',
            evidenceSource: `published-tool:${row.toolRef}`,
          },
        },
        reconciliation: {
          disposition: 'manual_review', reason: 'unknown_settlement',
          attemptCount: row.reconciliation?.attemptCount ?? 0, nextAttemptAt: now,
        },
        updatedAt: now,
      })
      quarantined++
    }
    if (row.formanceFinancialState === 'reserved' || row.formanceFinancialState === 'possibly_submitted') {
      const transition = await markOutcomeUnknownHandler(ctx, {
        callRef: row.callRef, now,
        evidenceDigest: canonicalDigest({ kind: 'restored_dispatch_quarantine', callRef: row.callRef, workId: row.workId }),
      })
      if (transition.kind !== 'accepted') throw new Error(transition.code)
    }
    // Cancellation acknowledgement does not establish retirement. The operator
    // must separately observe finished status before enabling the restored queue.
    await marketDispatchWorkpool.cancel(ctx, row.workId as WorkId)
  }
  return { kind: 'accepted', quarantined, replayed }
}
