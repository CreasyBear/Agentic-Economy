import { filter } from 'convex-helpers/server/filter'
import { usesSelectedRequestReadiness } from '@/modules/capability-supply/convex'
import type { MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
} from '../../workloadCron'

const READINESS_REFRESH_LEAD_MS = 30 * 60_000
const MAX_READINESS_REFRESH_BATCH = 20

export async function scheduleDueCapabilityProbesHandler(
  ctx: MutationCtx,
  args: Readonly<{ workload: unknown }>,
) {
  const workload = parseWorkloadCronSnapshot(args.workload)
  await reconcileWorkloadCronSnapshot(
    ctx,
    'refresh capability supply readiness',
    workload,
  )
  const dueQuery = ctx.db
    .query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (index) =>
      index
        .eq('disposition', 'current')
        .lt('readinessValidUntil', Date.now() + READINESS_REFRESH_LEAD_MS),
    )
  const due = await filter(dueQuery, publication => !usesSelectedRequestReadiness(publication))
    .take(MAX_READINESS_REFRESH_BATCH)
  const scheduledFunctionIds = await Promise.all(
    due.map((publication) =>
      ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probeFromCron, {
        publicationRef: publication.publicationRef,
        expectedRevision: publication.revision,
        workload,
      }),
    ),
  )
  console.info(JSON.stringify({
    kind: 'capability_readiness_scheduled_cycle',
    schemaVersion: 'capability-readiness-scheduled-cycle:v1',
    observedAt: Date.now(),
    dueCount: due.length,
    scheduledFunctionIds,
  }))
  return due.length
}
