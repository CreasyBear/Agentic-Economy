import { cronJobs } from 'convex/server'
import type { FunctionReference } from 'convex/server'

import { SCHEDULED_WORKLOADS, type ScheduledWorkloadName } from '@/lib/deployment/scheduled-workloads'
import { internal } from './_generated/api'

// Every scheduled workload must name its handler here; a missing or extra key
// is a type error. Cadence lives with the declaration in scheduled-workloads.
const HANDLERS: Record<ScheduledWorkloadName, FunctionReference<'mutation' | 'action', 'internal'>> = {
  'reconcile due facilitator invocations': internal.workloadCron.reconcileDueFacilitatorInvocations,
  'refresh facilitator discovery': internal.workloadCron.refreshFacilitatorDiscovery,
  'refresh Agentic Economy API registry': internal.workloadCron.refreshAgenticEconomyApiRegistry,
  'refresh current market presence': internal.workloadCron.refreshCurrentMarketPresence,
  'refresh capability supply readiness': internal.workloadCron.refreshCapabilitySupplyReadiness,
  'reconcile business supply projections': internal.workloadCron.reconcileBusinessSupplyProjections,
  'cleanup expired source write nonces': internal.workloadCron.cleanupExpiredSourceWriteNonces,
  'cleanup expired agent access oauth grants': internal.workloadCron.cleanupExpiredAgentAccessOAuthGrants,
  'observe x402 treasury': internal.workloadCron.observeX402Treasury,
}

const crons = cronJobs()

// Pre-launch cadence: keep recovery and freshness without burning included
// Convex usage. Tighten these only when the market is actually live.
// Bazaar pages are admitted on demand through capabilityToolCatalog, so
// 'refresh facilitator discovery' declares no interval.
for (const workload of SCHEDULED_WORKLOADS) {
  if (!('interval' in workload) || workload.interval === undefined) continue
  const interval = workload.interval
  crons.interval(workload.name, interval, HANDLERS[workload.name], {})
}

export default crons
