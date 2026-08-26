"use node"

import { v } from 'convex/values'

import {
  admitFacilitatorDiscoveryItems,
  fetchFacilitatorDiscoveryPages,
} from '@/modules/capability-supply/server'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import {
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
  type WorkloadCronSnapshot,
} from './workloadCron'

export { admitFacilitatorDiscoveryItems }

export const run = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: v.object({ pages: v.number(), admitted: v.number(), skipped: v.number(), complete: v.boolean() }),
  handler: async (ctx, args) => {
    const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: 'refresh facilitator discovery',
      snapshot: parseWorkloadCronSnapshot(args.workload),
    })
    const authorized = bindWorkloadCronActionContext(ctx, {
      name: 'refresh facilitator discovery',
      snapshot: workload,
    })
    const deadlineAt = Date.now() + 120_000
    const fetched = await fetchFacilitatorDiscoveryPages({
      jobTimeoutMs: Math.max(0, deadlineAt - Date.now()),
    })
    const seenPublicationRefs = new Set<string>()
    let admitted = 0
    let skipped = 0
    let complete = fetched.complete && Date.now() < deadlineAt
    let deadlineExceeded = Date.now() >= deadlineAt
    for (const fetchedPage of fetched.pages) {
      if (Date.now() >= deadlineAt) {
        complete = false
        deadlineExceeded = true
        break
      }
      const admission = await admitFacilitatorDiscoveryItems(fetchedPage.page.items)
      skipped += admission.skipped.length
      const result = await authorized.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: [...structuredClone(admission.admitted)],
        complete: false,
        deadlineAt,
        workload,
      })
      admitted += result.admitted
      skipped += result.skipped
      for (const publicationRef of result.seenPublicationRefs) {
        seenPublicationRefs.add(publicationRef)
      }
      if (result.deadlineExceeded) {
        complete = false
        deadlineExceeded = true
        break
      }
    }
    if (!deadlineExceeded && Date.now() < deadlineAt) {
      const result = await authorized.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: [],
        complete,
        seenPublicationRefs: [...seenPublicationRefs].sort(),
        deadlineAt,
        workload,
      })
      skipped += result.skipped
      if (result.deadlineExceeded) complete = false
    } else {
      complete = false
    }
    return { pages: fetched.pages.length, admitted, skipped, complete }
  },
})
