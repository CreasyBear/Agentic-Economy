/**
 * Single source for AE's scheduled workloads. Convex crons, the workload
 * declarations, the deployment manifest and their tests all derive from this
 * list, so a workload is added or retired in one place.
 */
export type WorkloadInterval = Readonly<{ minutes: number }> | Readonly<{ hours: number }>

export type ScheduledWorkload = Readonly<{
  name: string
  workloadKind: 'reconciliation' | 'cron'
  handler: string
  /** Absent for workloads that run on demand rather than on a timer. */
  interval?: WorkloadInterval
}>

export const SCHEDULED_WORKLOADS = [
  { name: 'reconcile due facilitator invocations', workloadKind: 'reconciliation', handler: 'reconcileDueFacilitatorInvocations', interval: { minutes: 15 } },
  { name: 'refresh facilitator discovery', workloadKind: 'cron', handler: 'refreshFacilitatorDiscovery' },
  { name: 'refresh Agentic Economy API registry', workloadKind: 'cron', handler: 'refreshAgenticEconomyApiRegistry', interval: { hours: 24 } },
  { name: 'refresh current market presence', workloadKind: 'cron', handler: 'refreshCurrentMarketPresence', interval: { hours: 1 } },
  { name: 'refresh capability supply readiness', workloadKind: 'cron', handler: 'refreshCapabilitySupplyReadiness', interval: { hours: 1 } },
  { name: 'cleanup expired source write nonces', workloadKind: 'cron', handler: 'cleanupExpiredSourceWriteNonces', interval: { hours: 1 } },
  { name: 'cleanup expired agent access oauth grants', workloadKind: 'cron', handler: 'cleanupExpiredAgentAccessOAuthGrants', interval: { hours: 1 } },
  { name: 'observe x402 treasury', workloadKind: 'cron', handler: 'observeX402Treasury', interval: { minutes: 15 } },
] as const satisfies readonly ScheduledWorkload[]

export type ScheduledWorkloadName = typeof SCHEDULED_WORKLOADS[number]['name']

/** Names of workloads that run on a Convex cron timer, sorted for manifests. */
export const SCHEDULED_WORKLOAD_JOB_NAMES = [
  'cleanup expired agent access oauth grants',
  'cleanup expired source write nonces',
  'observe x402 treasury',
  'reconcile due facilitator invocations',
  'refresh Agentic Economy API registry',
  'refresh capability supply readiness',
  'refresh current market presence',
] as const satisfies readonly ScheduledWorkloadName[]
