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

// Bazaar pages are admitted on demand through capabilityToolCatalog.

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

export default crons
