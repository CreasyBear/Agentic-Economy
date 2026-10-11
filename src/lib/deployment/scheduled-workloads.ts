/**
 * Single source for AE's scheduled workloads. Convex crons, the workload
 * declarations, the deployment manifest and their tests all derive from this
 * list, so a workload is added or retired in one place.
 */
type WorkloadInterval = Readonly<{ minutes: number }> | Readonly<{ hours: number }>
type WorkloadDaily = Readonly<{ hourUTC: number; minuteUTC: number }>


export type ScheduledWorkload = Readonly<{
  name: string
  workloadKind: 'reconciliation' | 'cron'
  handler: string
  /** Absent for workloads that run on demand rather than on a timer. */
  interval?: WorkloadInterval
  /** Fixed UTC wall-clock cadence for civil-day jobs. */
  daily?: WorkloadDaily
}>

export const SCHEDULED_WORKLOADS = [
  { name: 'expire alpha content', workloadKind: 'cron', handler: 'expireAlphaContent', interval: { hours: 1 } },
  { name: 'refresh payment readiness', workloadKind: 'cron', handler: 'refreshPaymentReadiness', interval: { minutes: 5 } },
  { name: 'reconcile paid Call reports', workloadKind: 'reconciliation', handler: 'reconcilePaidCallReports', interval: { minutes: 1 } },
  { name: 'reconcile promotional credit', workloadKind: 'reconciliation', handler: 'reconcilePromotionalCredit', interval: { minutes: 1 } },
  { name: 'reconcile due facilitator invocations', workloadKind: 'reconciliation', handler: 'reconcileDueFacilitatorInvocations', interval: { minutes: 15 } },
  { name: 'expire stale pending approvals', workloadKind: 'reconciliation', handler: 'expireStalePendingApprovals', interval: { minutes: 5 } },
  // No timer: the directory index is the only crawler. Quote's resolve borrows this
  // workload identity on demand to publish one selected listing.
  { name: 'refresh facilitator discovery', workloadKind: 'cron', handler: 'refreshFacilitatorDiscovery' },
  { name: 'refresh USDC/AUD reference rate', workloadKind: 'cron', handler: 'refreshReferenceRate', interval: { hours: 6 } },
  // 7 days (168h), not 24h: refreshAgenticEconomyApiRegistry rewrites ~14,541
  // resources when it actually runs (~225,000 function calls - see cost
  // comment in convex/x402DirectoryIndexRefresh.ts:start). Daily was
  // ~6.75M calls/month, 6.75x the Starter 1M/month allowance, on top of
  // which x402DirectoryIndexRefresh.start's change-signal guard now usually
  // short-circuits to 3 calls when the upstream directory hasn't changed.
  { name: 'refresh Agentic Economy API registry', workloadKind: 'cron', handler: 'refreshAgenticEconomyApiRegistry', interval: { hours: 168 } },
  { name: 'refresh current market presence', workloadKind: 'cron', handler: 'refreshCurrentMarketPresence', interval: { hours: 1 } },
  { name: 'refresh capability supply readiness', workloadKind: 'cron', handler: 'refreshCapabilitySupplyReadiness', interval: { hours: 1 } },
  { name: 'reconcile business supply projections', workloadKind: 'reconciliation', handler: 'reconcileBusinessSupplyProjections', interval: { hours: 1 } },
  { name: 'cleanup expired source write nonces', workloadKind: 'cron', handler: 'cleanupExpiredSourceWriteNonces', interval: { hours: 1 } },
  { name: 'cleanup expired agent access oauth grants', workloadKind: 'cron', handler: 'cleanupExpiredAgentAccessOAuthGrants', interval: { hours: 1 } },
  { name: 'snapshot marketplace metrics day', workloadKind: 'cron', handler: 'snapshotMarketplaceMetricsDay', daily: { hourUTC: 16, minuteUTC: 10 } },
  { name: 'refresh market flow', workloadKind: 'cron', handler: 'refreshMarketFlow', daily: { hourUTC: 1, minuteUTC: 15 } },
  { name: 'send operator stalled digest', workloadKind: 'cron', handler: 'sendOperatorDigest', daily: { hourUTC: 22, minuteUTC: 0 } },
  { name: 'send stalled step emails', workloadKind: 'cron', handler: 'sendStalledStepEmails', daily: { hourUTC: 22, minuteUTC: 30 } },
  { name: 'alert stuck stripe inbox', workloadKind: 'cron', handler: 'alertStuckStripeInbox', interval: { hours: 1 } },
  { name: 'retry journey event forwards', workloadKind: 'cron', handler: 'retryJourneyEventForwards', interval: { hours: 1 } },
  // Leave headroom for the five-minute readiness probe without extending source clocks.
  { name: 'reconcile treasury balances', workloadKind: 'reconciliation', handler: 'reconcileTreasuryBalances', interval: { minutes: 5 } },
  { name: 'observe x402 treasury', workloadKind: 'cron', handler: 'observeX402Treasury', interval: { minutes: 5 } },
] as const satisfies readonly ScheduledWorkload[]

export type ScheduledWorkloadName = typeof SCHEDULED_WORKLOADS[number]['name']
/** Workloads that run on a Convex timer; on-demand workloads have neither interval nor daily. */
export type TimedWorkloadName = Extract<typeof SCHEDULED_WORKLOADS[number], { interval: WorkloadInterval } | { daily: WorkloadDaily }>['name']

/** Names of workloads that run on a Convex cron timer, sorted for manifests. */
export const SCHEDULED_WORKLOAD_JOB_NAMES = [
  'alert stuck stripe inbox',
  'cleanup expired agent access oauth grants',
  'cleanup expired source write nonces',
  'expire alpha content',
  'expire stale pending approvals',
  'observe x402 treasury',
  'reconcile business supply projections',
  'reconcile due facilitator invocations',
  'reconcile paid Call reports',
  'reconcile promotional credit',
  'reconcile treasury balances',
  'refresh Agentic Economy API registry',
  'refresh capability supply readiness',
  'refresh current market presence',
  'refresh USDC/AUD reference rate',
  'refresh market flow',
  'refresh payment readiness',
  'retry journey event forwards',
  'send operator stalled digest',
  'send stalled step emails',
  'snapshot marketplace metrics day',
] as const satisfies readonly TimedWorkloadName[]
