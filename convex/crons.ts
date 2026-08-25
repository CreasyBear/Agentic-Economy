import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'reconcile due facilitator invocations',
  { minutes: 1 },
  internal.capabilityOperationInvocationWorker.reconcileScheduled,
  {},
)

crons.interval(
  'refresh facilitator discovery',
  { minutes: 10 },
  internal.facilitatorDiscoveryAction.run,
  {},
)

crons.interval(
  'refresh Agentic Market snapshots',
  { minutes: 5 },
  internal.marketExternalRefresh.run,
  {},
)

crons.interval(
  'refresh Agentic Economy API registry',
  { hours: 24 },
  internal.marketExternalRegistryRefresh.run,
  {},
)

crons.interval(
  'continue market aggregate backfill',
  { hours: 1 },
  internal.marketAggregateBackfill.run,
  {},
)

crons.interval(
  'refresh current market presence',
  { minutes: 5 },
  internal.marketPresence.refresh,
  { cursor: null },
)

crons.interval(
  'refresh capability supply readiness',
  { minutes: 1 },
  internal.capabilitySupply.scheduleDueCapabilityProbes,
  {}
)

crons.interval(
  'cleanup expired source write nonces',
  { hours: 1 },
  internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces,
  {}
)

crons.interval(
  'cleanup expired agent access oauth grants',
  { hours: 1 },
  internal.agentAccessOAuth.cleanupExpiredOAuthGrants,
  {},
)

crons.cron(
  'run daily supplier settlement',
  '0 0 * * *',
  internal.moneyLedger.runDailySupplierSettlement,
  {},
)

export default crons
