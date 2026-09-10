"use node"

import { v } from 'convex/values'
import { admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'
import { projectX402DirectoryEntry, readX402DirectoryRawPage } from '@/modules/market/x402-directory.server'
import { x402DirectoryResolveInputSchema, type X402DirectoryResolution } from '@/modules/market/x402-directory'
import { directoryEntryMatchesFilters } from '@/modules/market/x402-directory-index'
import { api, internal } from './_generated/api'
import { action } from './_generated/server'
import { bindWorkloadCronActionContext } from './workloadCron'

/** Resolve only a server-retrieved directory resource selected by the customer. */
export const resolve = action({
  args: { resource: v.string(), query: v.optional(v.string()), offset: v.optional(v.number()), network: v.optional(v.string()), provider: v.optional(v.string()), maxUsdPrice: v.optional(v.number()) },
  returns: v.union(v.object({ kind: v.literal('ready'), toolRef: v.string() }), v.object({ kind: v.literal('unavailable'), reason: v.string() })),
  handler: async (ctx, args): Promise<X402DirectoryResolution> => {
    const parsed = x402DirectoryResolveInputSchema.safeParse(args)
    if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
    const { resource, ...context } = parsed.data
    const indexed = await ctx.runQuery(internal.x402DirectoryIndex.selectedSource, {
      resource, ...(context.network === undefined ? {} : { network: context.network }),
      ...(context.provider === undefined ? {} : { provider: context.provider }),
      ...(context.maxUsdPrice === undefined ? {} : { maxUsdPrice: context.maxUsdPrice }),
    })
    let selected: unknown
    if (indexed.kind === 'found') selected = JSON.parse(indexed.sourceJson) as unknown
    else if (indexed.kind === 'not_found') return { kind: 'unavailable', reason: 'resource_not_found' }
    else if (indexed.reason !== 'index_unavailable') return indexed
    else {
      const page = await readX402DirectoryRawPage(context)
      if (page.kind === 'unavailable') return page
      const candidate = page.items.find(item => item.resource === resource)
      if (candidate === undefined) return { kind: 'unavailable', reason: 'resource_not_found' }
      if (!directoryEntryMatchesFilters(projectX402DirectoryEntry(candidate), context)) return { kind: 'unavailable', reason: 'resource_filters_mismatch' }
      selected = candidate
    }
    try {
      const admission = await admitFacilitatorDiscoveryItems([selected])
      if (admission.admitted.length === 0) return { kind: 'unavailable', reason: admission.skipped[0]?.reason ?? 'admission_unavailable' }
      const workload = await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh facilitator discovery' })
      const authorized = bindWorkloadCronActionContext(ctx, { name: 'refresh facilitator discovery', snapshot: workload })
      const result = await authorized.runMutation(internal.facilitatorDiscovery.reconcile, { items: [...structuredClone(admission.admitted)], complete: false, deadlineAt: Date.now() + 10_000, workload })
      const toolRef = result.toolRefs[0]
      if (toolRef === undefined) return { kind: 'unavailable', reason: 'admission_unavailable' }
      const detail = await ctx.runQuery(api.capabilitySupplyTools.detail, { toolRef })
      return detail.kind === 'found' ? { kind: 'ready', toolRef } : { kind: 'unavailable', reason: 'tool_unavailable' }
    } catch {
      return { kind: 'unavailable', reason: 'admission_unavailable' }
    }
  },
})
