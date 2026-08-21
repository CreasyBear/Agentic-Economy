import { paginationOptsValidator, queryGeneric } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { buildOfferingLlmsTxt } from '../src/modules/discovery/convex'
import { readOfferingSupplyPage } from './registry'

const discoveryFileResult = v.object({
  body: v.string(),
  urls: v.array(v.string()),
})

const discoverySlugPageResult = v.object({
  page: v.array(v.string()),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

const DISCOVERY_LLMS_SAMPLE_SIZE = 12

export const readLlmsTxt = queryGeneric({
  args: {
    canonicalBaseUrl: v.optional(v.string()),
    routingBaseUrl: v.optional(v.string()),
    now: v.optional(v.number()),
    totalBusinesses: v.optional(v.number()),
  },
  returns: discoveryFileResult,
  handler: async (ctx, args): Promise<Infer<typeof discoveryFileResult>> => {
    const sample = await readOfferingSupplyPage(ctx.db, {
      cursor: null,
      numItems: DISCOVERY_LLMS_SAMPLE_SIZE,
    })
    const result = buildOfferingLlmsTxt(sample.items, {
      canonicalBaseUrl: args.canonicalBaseUrl ?? '',
      ...(args.routingBaseUrl === undefined ? {} : { routingBaseUrl: args.routingBaseUrl }),
      ...(args.now === undefined ? {} : { now: args.now }),
      totalBusinesses: args.totalBusinesses ?? sample.items.length,
    })
    return { body: result.body, urls: [...result.urls] }
  },
})

export const readDiscoveryBusinessSlugPage = queryGeneric({
  args: {
    surface: v.union(v.literal('llms'), v.literal('sitemap')),
    paginationOpts: paginationOptsValidator,
  },
  returns: discoverySlugPageResult,
  handler: async (ctx, args): Promise<Infer<typeof discoverySlugPageResult>> => {
    const page = await readOfferingSupplyPage(ctx.db, args.paginationOpts)
    return {
      page: page.items.map((item) => item.slug),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})
