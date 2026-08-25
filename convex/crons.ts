import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'reconcile due facilitator invocations',
  { minutes: 1 },
  internal.workloadCron.reconcileDueFacilitatorInvocations,
  {},
)

crons.interval(
  'refresh facilitator discovery',
  { minutes: 10 },
  internal.workloadCron.refreshFacilitatorDiscovery,
  {},
)

crons.interval(
  'refresh Agentic Market snapshots',
  { minutes: 5 },
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
  'continue market aggregate backfill',
  { hours: 1 },
  internal.workloadCron.continueMarketAggregateBackfill,
  {},
)

crons.interval(
  'refresh current market presence',
  { minutes: 5 },
  internal.workloadCron.refreshCurrentMarketPresence,
  {},
)

crons.interval(
  'refresh capability supply readiness',
  { minutes: 1 },
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
