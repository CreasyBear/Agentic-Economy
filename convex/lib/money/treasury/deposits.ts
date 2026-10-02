"use node"

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { TreasuryProgress } from '@/modules/money/treasury'
import type { ActionCtx } from '../../../_generated/server'
import { internal } from '../../../_generated/api'
import { bookFormanceTreasuryBatch, configuredContext, type FormanceContext } from '../formance/gateway'
import { readTreasuryChainObservation } from './chainObservation'

type DepositResult = Readonly<{ kind: 'completed'; caughtUp: boolean; batchRef?: string }>
  | Readonly<{ kind: 'unavailable'; code: string }>
type Dependencies = Readonly<{
  admit: () => Promise<boolean>
  chainRead?: typeof readTreasuryChainObservation
  formance?: FormanceContext
}>

/**
 * One pending range survives every partial outcome. No failure, including a
 * retry's submissionProvenAbsent result, erases an earlier possible posting.
 * Native identity/readback handles duplicate workers; Convex compares the exact
 * predecessor and commits the cursor only after every credit is proven.
 */
export async function reconcileTreasuryDeposits(
  ctx: Pick<ActionCtx, 'runQuery' | 'runMutation'>,
  dependencies: Dependencies,
): Promise<DepositResult> {
  const progress: TreasuryProgress = await ctx.runQuery(internal.moneyTreasuryReconciliation.readProgress, {})
  if (progress.kind === 'unavailable') return progress
  const configured = dependencies.formance === undefined ? configuredContext()
    : { kind: 'configured' as const, context: dependencies.formance }
  if (configured.kind === 'setup_required') return unavailable(configured.code)
  if (configured.context.configuration.environment !== progress.identity.environment) {
    return unavailable('treasury_ledger_environment_mismatch')
  }
  let pending: TreasuryProgress = progress
  if (progress.kind !== 'pending') {
    const observation = await (dependencies.chainRead ?? readTreasuryChainObservation)({
      environment: progress.identity.environment, address: progress.identity.address,
      ...(progress.kind === 'ready' ? { checkpoint: progress.checkpoint } : {}),
    })
    if (observation.kind !== 'observed') return observation
    if (progress.kind === 'ready' && canonicalDigest(progress.checkpoint) === canonicalDigest(observation.checkpoint)) {
      return { kind: 'completed', caughtUp: observation.caughtUp }
    }
    pending = await ctx.runMutation(internal.moneyTreasuryReconciliation.beginBatch, {
      previousCheckpoint: progress.kind === 'ready' ? progress.checkpoint : null, observation,
    })
  }
  if (pending.kind === 'unavailable') return pending
  if (pending.kind === 'ready') return { kind: 'completed', caughtUp: false }
  if (pending.kind !== 'pending') return unavailable('treasury_batch_unavailable')
  const { batch, identity } = pending
  if (!await dependencies.admit()) return unavailable('treasury_workload_authority_unavailable')
  const booked = await bookFormanceTreasuryBatch(configured.context, identity, batch)
  if (booked.kind !== 'completed') return unavailable(booked.kind === 'outcome_unknown' ? 'treasury_posting_unknown' : booked.code)
  const transactionRefs = [...booked.transactionRefs]
  const finished = await ctx.runMutation(internal.moneyTreasuryReconciliation.finishBatch,
    { batchRef: batch.batchRef, transactionRefs })
  if (finished.kind !== 'completed') return finished
  return { kind: 'completed', caughtUp: batch.observation.caughtUp, batchRef: batch.batchRef }
}

function unavailable(code: string) { return { kind: 'unavailable' as const, code } }
