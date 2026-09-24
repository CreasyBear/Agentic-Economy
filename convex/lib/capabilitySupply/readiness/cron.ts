"use node"

import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'
import { bindWorkloadCronActionContext } from '../../platform/workloadCron/consequence'
import { parseWorkloadCronSnapshot, type WorkloadCronSnapshot } from '../../platform/workloadCron/context'
import { probeHandler } from './probe'
import type { ProbeArgs, ProbeResult } from './contracts'

export async function probeFromCronHandler(
  ctx: ActionCtx,
  args: ProbeArgs & Readonly<{ workload: unknown }>,
): Promise<ProbeResult> {
  const { workload: workloadInput, publicationRef, expectedRevision } = args
  const parsed = parseWorkloadCronSnapshot(workloadInput)
  const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
    name: 'refresh capability supply readiness',
    snapshot: parsed,
  })
  return await probeHandler(bindWorkloadCronActionContext(ctx, {
    name: 'refresh capability supply readiness',
    snapshot: workload,
  }), { publicationRef, expectedRevision })
}
