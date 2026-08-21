"use node"

import { v } from 'convex/values'

import { fetchFacilitatorDiscoveryPages } from '@/modules/capability-supply/server'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'

export const run = internalAction({
  args: {},
  returns: v.object({ pages: v.number(), admitted: v.number(), complete: v.boolean() }),
  handler: async (ctx) => {
    const deadlineAt = Date.now() + 120_000
    const fetched = await fetchFacilitatorDiscoveryPages({
      jobTimeoutMs: Math.max(0, deadlineAt - Date.now()),
    })
    const seenPublicationRefs = new Set<string>()
    let admitted = 0
    let complete = fetched.complete && Date.now() < deadlineAt
    let deadlineExceeded = Date.now() >= deadlineAt
    for (const fetchedPage of fetched.pages) {
      if (Date.now() >= deadlineAt) {
        complete = false
        deadlineExceeded = true
        break
      }
      if (Date.now() >= deadlineAt) {
        complete = false
        deadlineExceeded = true
        break
      }
      const result = await ctx.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: fetchedPage.page.items.map((item) => JSON.stringify(item) ?? 'null'),
        complete: false,
        deadlineAt,
      })
      admitted += result.admitted
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
      const result = await ctx.runMutation(internal.facilitatorDiscovery.reconcile, {
        items: [],
        complete,
        seenPublicationRefs: [...seenPublicationRefs].sort(),
        deadlineAt,
      })
      if (result.deadlineExceeded) complete = false
    } else {
      complete = false
    }
    return { pages: fetched.pages.length, admitted, complete }
  },
})
