import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

// Pre-launch cadence: keep recovery and freshness without burning included
// Convex usage. Tighten these only when the market is actually live.
crons.interval(
  'reconcile due facilitator invocations',
  { minutes: 15 },
  internal.workloadCron.reconcileDueFacilitatorInvocations,
  {},
)

crons.interval(
  'refresh facilitator discovery',
  { hours: 12 },
  internal.workloadCron.refreshFacilitatorDiscovery,
  {},
)

crons.interval(
  'refresh Agentic Market snapshots',
  { hours: 6 },
  internal.workloadCron.refreshAgenticMarketSnapshots,
  {},
)

crons.interval(
  'refresh Agentic Economy API registry',
  { hours: 24 },
  internal.workloadCron.refreshAgenticEconomyApiRegistry,
  {},
)

crons.interval(
  'refresh current market presence',
  { hours: 1 },
  internal.workloadCron.refreshCurrentMarketPresence,
  {},
)

crons.interval(
  'refresh capability supply readiness',
  { hours: 1 },
  internal.workloadCron.refreshCapabilitySupplyReadiness,
  {}
)

crons.interval(
  'cleanup expired source write nonces',
  { hours: 1 },
  internal.workloadCron.cleanupExpiredSourceWriteNonces,
  {}
)

crons.interval(
  'cleanup expired agent access oauth grants',
  { hours: 1 },
  internal.workloadCron.cleanupExpiredAgentAccessOAuthGrants,
  {},
)

crons.cron(
  'run daily supplier settlement',
  '0 0 * * *',
  internal.workloadCron.runDailySupplierSettlement,
  {},
)

export default crons
