import { readPlan } from '../plans/planState'
import { type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { marketDispatchWorkpool } from '../../../marketDispatchWorkpool'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { callAuthorityValue } from '@/modules/capability-execution/convex'
import type { DispatchResult } from './callIdentity'

type CallRow = Doc<'capabilityCalls'>
type PersistedOperationAuthority = Infer<typeof callAuthorityValue>

const OPERATION_INVOKE_RETRY_AFTER_MS = 1_000

export async function enqueueCallDispatch(
  ctx: MutationCtx,
  row: CallRow,
  authority: PersistedOperationAuthority,
  now: number,
): Promise<DispatchResult> {
  if (row.state !== 'pending') return { kind: 'refused' as const }
  if (row.workId !== undefined) {
    if (
      row.authority === undefined
      || canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
    ) return { kind: 'refused' as const }
    return { kind: 'replayed' as const, workId: row.workId }
  }
  if (
    row.authority !== undefined
    && canonicalDigest(row.authority as never) !== canonicalDigest(authority as never)
  ) return { kind: 'refused' as const }
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityCallWorker.run,
    { callRef: row.callRef },
    {
      retry: true,
      onComplete: internal.capabilityCalls.completeWork,
      context: { callRef: row.callRef },
    },
  )
  await ctx.db.patch(row._id, {
    workId,
    authority,
    dispatchState: 'enqueued',
    result: {
      kind: 'pending',
      callRef: row.callRef,
      toolRef: row.toolRef,
      retryAfterMs: OPERATION_INVOKE_RETRY_AFTER_MS,
    },
    updatedAt: now,
  })
  return { kind: 'enqueued' as const, workId }
}

export async function dispatchHandler(
  ctx: MutationCtx,
  args: {
    callRef: string
    principalId: string
    credentialId: string
    toolRef: string
    authority?: PersistedOperationAuthority
    now: number
  },
): Promise<DispatchResult> {
  const row = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique()
  if (
    row === null
    || row.principalId !== args.principalId
    || row.credentialId !== args.credentialId
    || row.toolRef !== args.toolRef
    || row.toolJson === undefined
    || row.inputJson === undefined
  ) return { kind: 'refused' as const }
  if (args.authority === undefined) return { kind: 'refused' as const }
  const basis = args.authority.acceptedBasis
  if (row.planRef !== undefined) {
    const plan = await readPlan(ctx, row.planRef)
    const node = plan?.nodes.find(candidate => candidate.nodeId === row.planNodeId)
    if (plan?.authority === undefined || node === undefined || basis.kind !== 'plan_node'
      || plan.holdReservationRefs === undefined || plan.holdReleaseRefs !== undefined
      || plan.authority.expiresAt <= args.now || basis.planRef !== plan.planRef || basis.nodeId !== node.nodeId
      || basis.planAuthorityDigest !== canonicalDigest(plan.authority) || basis.resolvedInputDigest !== row.inputDigest
      || basis.ceilingAudUnits !== node.ceilingAudUnits || args.authority.grantRef !== plan.grantRef
      || args.authority.grantGeneration !== plan.grantGeneration) return { kind: 'refused' as const }
  } else if (basis.kind === 'plan_node') return { kind: 'refused' as const }
  return await enqueueCallDispatch(ctx, row, args.authority, args.now)
}
