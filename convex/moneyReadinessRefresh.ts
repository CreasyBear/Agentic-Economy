"use node"

import { v } from 'convex/values'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { paymentReadinessEnvironmentValue } from '@/modules/money/payment-readiness'
import { internal } from './_generated/api'
import { internalAction, type ActionCtx } from './_generated/server'
import { bindWorkloadCronActionContext } from './lib/platform/workloadCron/consequence'
import { parseWorkloadCronSnapshot, workloadCronSnapshotValue, type WorkloadCronSnapshot } from './lib/platform/workloadCron/context'
import { refreshPaymentReadiness } from './lib/money/readiness/refresh'

const NAME = 'refresh payment readiness' as const
type RefreshResult = { kind: 'published'; replayed: boolean } | { kind: 'refused'; code: string }
const resultValue = v.union(v.object({ kind: v.literal('published'), replayed: v.boolean() }),
  v.object({ kind: v.literal('refused'), code: v.string() }))

async function run(ctx: ActionCtx, admitted: WorkloadCronSnapshot, token?: string): Promise<RefreshResult> {
  const environment = deploymentPaymentEnvironment(process.env)
  if (environment === undefined) return { kind: 'refused', code: 'readiness_environment_mismatch' }
  const workload = await ctx.runQuery(internal.workloadCron.reconcile, { name: NAME, snapshot: admitted })
  const bound = bindWorkloadCronActionContext(ctx, { name: NAME, snapshot: workload })
  const claim = await bound.runMutation(internal.moneyReadinessWork.claim, {
    environment, ...(token === undefined ? {} : { token }),
  })
  if (claim.kind !== 'claimed') return claim
  return await refreshPaymentReadiness(bound, claim.token)
}

export const refresh = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: resultValue,
  handler: async (ctx, args): Promise<RefreshResult> => await run(ctx, parseWorkloadCronSnapshot(args.workload)),
})

export const recover = internalAction({
  args: { environment: paymentReadinessEnvironmentValue, token: v.string() }, returns: resultValue,
  handler: async (ctx, args): Promise<RefreshResult> => {
    if (deploymentPaymentEnvironment(process.env) !== args.environment) return { kind: 'refused', code: 'readiness_environment_mismatch' }
    // Scheduled actions do not retry automatically. A fresh admission plus the
    // leased claim makes delayed deliveries harmless; the periodic job repairs crashes.
    const workload = await ctx.runQuery(internal.workloadCron.admit, { name: NAME })
    return await run(ctx, workload, args.token)
  },
})
