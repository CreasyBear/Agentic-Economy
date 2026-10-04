import { cronJobs } from 'convex/server'
import type { FunctionReference } from 'convex/server'

import { SCHEDULED_WORKLOADS, type ScheduledWorkloadName } from '@/lib/deployment/scheduled-workloads'
import { internal } from './_generated/api'

// Every scheduled workload must name its handler here; a missing or extra key
// is a type error. Cadence lives with the declaration in scheduled-workloads.
const HANDLERS: Record<ScheduledWorkloadName, FunctionReference<'mutation' | 'action', 'internal'>> = {
  'expire alpha content': internal.workloadCron.expireAlphaContent,
  'reconcile paid Call reports': internal.workloadCron.reconcilePaidCallReports,
  'reconcile promotional credit': internal.workloadCron.reconcilePromotionalCredit,
  'reconcile due facilitator invocations': internal.workloadCron.reconcileDueFacilitatorInvocations,
  'refresh facilitator discovery': internal.workloadCron.refreshFacilitatorDiscovery,
  'refresh USDC/AUD reference rate': internal.workloadCron.refreshReferenceRate,
  'refresh Agentic Economy API registry': internal.workloadCron.refreshAgenticEconomyApiRegistry,
  'refresh current market presence': internal.workloadCron.refreshCurrentMarketPresence,
  'refresh capability supply readiness': internal.workloadCron.refreshCapabilitySupplyReadiness,
  'reconcile business supply projections': internal.workloadCron.reconcileBusinessSupplyProjections,
  'cleanup expired source write nonces': internal.workloadCron.cleanupExpiredSourceWriteNonces,
  'cleanup expired agent access oauth grants': internal.workloadCron.cleanupExpiredAgentAccessOAuthGrants,
  'expire stale pending approvals': internal.workloadCron.expireStalePendingApprovals,
  'reconcile treasury balances': internal.workloadCron.reconcileTreasuryBalances,
  'observe x402 treasury': internal.workloadCron.observeX402Treasury,
  'snapshot marketplace metrics day': internal.workloadCron.snapshotMarketplaceMetricsDay,
  'refresh market flow': internal.workloadCron.refreshMarketFlow,
  'refresh payment readiness': internal.workloadCron.refreshPaymentReadiness,
}

const crons = cronJobs()
for (const workload of SCHEDULED_WORKLOADS) {
  if ('daily' in workload && workload.daily !== undefined) {
    crons.cron(workload.name, `${workload.daily.minuteUTC} ${workload.daily.hourUTC} * * *`, HANDLERS[workload.name], {})
    continue
  }
  if (!('interval' in workload) || workload.interval === undefined) continue
  crons.interval(workload.name, workload.interval, HANDLERS[workload.name], {})
}

export default crons
