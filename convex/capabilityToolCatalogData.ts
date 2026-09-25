import { FACILITATOR_DISCOVERY_PUBLISHER_REF } from '@/modules/capability-supply/convex'
import { isRecord } from '@/modules/common/is-record'
import { v } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { normalizePricingConfig } from '@/modules/money/public'
import { internalQuery } from './_generated/server'

/** Bounded server-only source amounts; display values never authorize a Quote. */
export const priceSources = internalQuery({
  args: { toolRefs: v.array(v.string()) },
  returns: v.array(v.object({ toolRef: v.string(), environment: v.union(v.literal('sandbox'), v.literal('production')), atomicUnits: v.string() })),
  handler: async (ctx, args) => {
    if (args.toolRefs.length > 100) throw new Error('catalog_page_too_large')
    const result = []
    for (const toolRef of args.toolRefs) {
      const row = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', toolRef).eq('disposition', 'current')).unique()
      if (row?.pricingConfigJson === undefined) continue
      let parsed: unknown
      try { parsed = JSON.parse(row.pricingConfigJson) } catch (cause) { degradeBackend(cause, undefined, { site: 'priceSources', reason: 'invalid_response' }); continue }
      const price = normalizePricingConfig(parsed)
      if (price.kind !== 'valid' || price.config.kind !== 'managed_x402') continue
      result.push({ toolRef, environment: row.runtimeEnvironment, atomicUnits: price.config.sourceRequirement.atomicUnits })
    }
    return result
  },
})

/** AE network membership is publication metadata, separate from payment networks. */
export const filterNetwork = internalQuery({
  args: { toolRefs: v.array(v.string()), networkId: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    if (args.toolRefs.length > 100) throw new Error('catalog_page_too_large')
    const refs: string[] = []
    for (const toolRef of args.toolRefs) {
      const row = await ctx.db.query('capabilityPublications').withIndex('by_toolRef_and_disposition', (q) => q.eq('toolRef', toolRef).eq('disposition', 'current')).unique()
      if (row?.networkId === args.networkId) refs.push(toolRef)
    }
    return refs
  },
})

/** Resolve a source page against previously reconciled publications, never admitting on read. */
export const sourceSnapshot = internalQuery({
  args: { candidates: v.array(v.object({
    sourceRouteRef: v.string(),
    resourceUrl: v.string(),
    method: v.union(v.literal('GET'), v.literal('POST')),
    network: v.string(),
    asset: v.string(),
    sourceRevision: v.string(),
  })) },
  returns: v.object({ toolRefs: v.array(v.string()), incomplete: v.boolean() }),
  handler: async (ctx, { candidates }) => {
    if (candidates.length > 20) throw new Error('catalog_page_too_large')
    const toolRefs: string[] = []
    let incomplete = false
    for (const candidate of candidates) {
      const publications = await ctx.db.query('capabilityPublications')
        .withIndex('by_sourceRouteRef_and_disposition', (q) => q.eq('sourceRouteRef', candidate.sourceRouteRef).eq('disposition', 'current'))
        .take(17)
      if (publications.length > 16) incomplete = true
      const matches = []
      for (const publication of publications.slice(0, 16)) {
        if (publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
          || publication.authorityMode !== 'observed_external') continue
        const binding = await ctx.db.query('capabilityTransportBindings')
          .withIndex('by_bindingId', (q) => q.eq('bindingId', publication.bindingId)).unique()
        if (binding?.endpointUrl !== candidate.resourceUrl) continue
        let config: unknown
        try { config = JSON.parse(binding.configJson) } catch (cause) { degradeBackend(cause, undefined, { site: 'sourceSnapshot', reason: 'invalid_response' }); continue }
        if (!isRecord(config) || config.method !== candidate.method || config.network !== candidate.network
          || typeof config.asset !== 'string' || config.asset.toLowerCase() !== candidate.asset.toLowerCase()) continue
        matches.push(publication)
      }
      if (matches.length !== 1 || matches[0]?.sourceRevision !== candidate.sourceRevision) {
        incomplete = true
        continue
      }
      toolRefs.push(matches[0].toolRef)
    }
    return { toolRefs, incomplete }
  },
})
