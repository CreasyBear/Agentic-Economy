import type { MutationCtx } from '../../../_generated/server'
import {
  advance,
  block,
  hasActiveCall,
  hasUnresolvedObligations,
  hasUnresolvedPayouts,
  readTargetPage,
  requireCase,
} from './caseState'

export async function drainCallsPageHandler(
  ctx: MutationCtx,
  args: { caseRef: string; afterToolRef?: string },
) {
  const row = await requireCase(ctx, args.caseRef)
  const targets = await readTargetPage(ctx, row.caseRef, 'tool', args.afterToolRef)
  for (const target of targets) {
    if (await hasActiveCall(ctx, target.targetRef)) {
      await block(ctx, row, 'drain-calls', 'calls_remain')
      return { ready: false, done: false }
    }
  }
  const last = targets.at(-1)
  return {
    ready: true,
    done: targets.length < 100,
    ...(targets.length < 100 || last === undefined ? {} : { nextToolRef: last.targetRef }),
  }
}

export async function completeCallDrainHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  await advance(ctx, row, 'settle-obligations', 'waiting_for_obligations')
  return null
}

export async function settleObligationsHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  if (await hasUnresolvedObligations(ctx, row.providerRef)) {
    return await block(ctx, row, 'settle-obligations', 'obligations_remain')
  }
  if (await hasUnresolvedPayouts(ctx, String(row.businessId))) {
    return await block(ctx, row, 'settle-obligations', 'payout_resolution_required')
  }
  await advance(ctx, row, 'revoke-connections', 'revoking_connections')
  return { ready: true }
}
