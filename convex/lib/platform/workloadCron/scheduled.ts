import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'
import { internal } from '../../../_generated/api'
import type { QueryCtx } from '../../../_generated/server'
import { admitWorkloadCron } from './admission'
import type { WorkloadCronActionContext, WorkloadCronMutationContext, WorkloadCronName } from './context'

async function runAdmittedAction(
  ctx: WorkloadCronActionContext,
  name: WorkloadCronName,
  target: FunctionReference<'action', 'internal'>,
  args: DefaultFunctionArgs,
): Promise<null> {
  const workload = await ctx.runQuery(internal.workloadCron.admit, { name })
  await ctx.runAction(target, { ...args, workload })
  return null
}

async function runAdmittedMutation(
  ctx: WorkloadCronMutationContext,
  name: WorkloadCronName,
  target: FunctionReference<'mutation', 'internal'>,
  args: DefaultFunctionArgs,
): Promise<null> {
  const workload = await admitWorkloadCron(ctx as Pick<QueryCtx, 'db'>, name)
  await ctx.runMutation(target, { ...args, workload })
  return null
}

export async function reconcileDueFacilitatorInvocationsHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'reconcile due facilitator invocations',
    internal.capabilityCallWorker.reconcileScheduled,
    {},
  )
}
export async function expireStalePendingApprovalsHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'expire stale pending approvals',
    internal.capabilityCalls.expireStalePendingApprovals,
    {},
  )
}


export async function refreshFacilitatorDiscoveryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'refresh facilitator discovery',
    internal.facilitatorDiscoveryAction.run,
    {},
  )
}
export async function refreshReferenceRateHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'refresh USDC/AUD reference rate', internal.referenceRateRefresh.run, {})
}


export async function refreshAgenticEconomyApiRegistryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await runAdmittedAction(ctx, 'refresh Agentic Economy API registry', internal.x402DirectoryIndexRefresh.start, {})
  return null
}

export async function refreshCurrentMarketPresenceHandler(
  ctx: WorkloadCronMutationContext,
  args: Readonly<{ cursor?: string | null }> = {},
): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'refresh current market presence',
    internal.marketPresence.refresh,
    { cursor: args.cursor ?? null },
  )
}

export async function refreshCapabilitySupplyReadinessHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  const workload = await admitWorkloadCron(ctx as Pick<QueryCtx, 'db'>, 'refresh capability supply readiness')
  await ctx.runMutation(internal.capabilitySupply.scheduleDueCapabilityProbes, { workload })
  return null
}

// This wrapper admits the canonical workload before the paginated maintenance entry point.
export async function reconcileBusinessSupplyProjectionsHandler(ctx: WorkloadCronMutationContext): Promise<null> {
  await admitWorkloadCron(ctx as Pick<QueryCtx, 'db'>, 'reconcile business supply projections')
  await ctx.runMutation(internal.capabilitySupplyProjection.rebuildAllBusinessSupplyProjections, {})
  // Reconcile provider directory rows that bypassed publish/withdraw hooks.
  await ctx.runMutation(internal.x402DirectoryIndexStore.reconcileProviderDirectoryRows, {})
  return null
}

export async function cleanupExpiredSourceWriteNoncesHandler(
  ctx: WorkloadCronMutationContext,
  args: Readonly<{ now?: number; batchSize?: number }> = {},
): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'cleanup expired source write nonces',
    internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces,
    args,
  )
}

export async function cleanupExpiredAgentAccessOAuthGrantsHandler(
  ctx: WorkloadCronMutationContext,
  args: Readonly<{ now?: number; batchSize?: number }> = {},
): Promise<null> {
  return await runAdmittedMutation(
    ctx,
    'cleanup expired agent access oauth grants',
    internal.agentAccessOAuth.cleanupExpiredOAuthGrants,
    args,
  )
}

export async function observeX402TreasuryHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(
    ctx,
    'observe x402 treasury',
    internal.moneyTreasuryObservation.observe,
    {},
  )
}

export async function refreshMarketFlowHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'refresh market flow', internal.marketFlowRefresh.run, {})
}

export async function sendOperatorDigestHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await ctx.runQuery(internal.workloadCron.admit, { name: 'send operator stalled digest' })
  await ctx.runMutation(internal.operatorDigest.enqueue, {})
  return null
}

export async function sendStalledStepEmailsHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await ctx.runQuery(internal.workloadCron.admit, { name: 'send stalled step emails' })
  await ctx.runAction(internal.notifications.sweepStalledStepEmails, {})
  return null
}

export async function retryJourneyEventForwardsHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await ctx.runQuery(internal.workloadCron.admit, { name: 'retry journey event forwards' })
  await ctx.runMutation(internal.journeyEvents.retryUnforwarded, {})
  return null
}

export async function snapshotMarketplaceMetricsDayHandler(ctx: WorkloadCronActionContext): Promise<null> {
  await ctx.runQuery(internal.workloadCron.admit, { name: 'snapshot marketplace metrics day' })
  await ctx.runAction(internal.adminConsoleMetrics.refreshMarketplaceMetrics, {})
  return null
}

export async function reconcilePromotionalCreditHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'reconcile promotional credit', internal.moneyPromotionalCredit.sweep, {})
}

export async function reconcilePaidCallReportsHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'reconcile paid Call reports', internal.capabilityCallReports.sweep, {})
}

export async function reconcileTreasuryBalancesHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'reconcile treasury balances', internal.moneyTreasurySnapshot.reconcile, {})
}

export async function refreshPaymentReadinessHandler(ctx: WorkloadCronActionContext): Promise<null> {
  return await runAdmittedAction(ctx, 'refresh payment readiness', internal.moneyReadinessRefresh.refresh, {})
}
