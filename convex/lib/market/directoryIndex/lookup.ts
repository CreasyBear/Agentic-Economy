import { v, type Infer } from 'convex/values'
import { directoryEntryMatchesFilters, x402DirectoryIndexInputSchema } from '@/modules/market/x402-directory-index'
import type { QueryCtx } from '../../../_generated/server'
import { coverageValue, directoryEntryValue, indexedEntryValue, unavailableValue } from './contracts'
import { admittedToolRef } from './browse'
import { activeDirectoryGeneration, canonicalSlugForToolRef, directoryCoverage, indexedDirectoryEntry, storedDirectoryEntry } from './rows'

export const resourceArgs = v.object({ resource: v.string() })
export const resourceReturns = v.union(unavailableValue, v.object({ kind: v.literal('not_found') }), v.object({ kind: v.literal('found'), coverage: coverageValue, item: indexedEntryValue }))
export const resourceHandler = async (ctx: QueryCtx, args: Infer<typeof resourceArgs>) => {
    if (args.resource.length === 0 || args.resource.length > 8192) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const selected = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation.generation).eq('network', '*').eq('resource', args.resource)).unique()
    const row = selected === null ? null : await ctx.db.get(selected.entryId)
    if (row === null || selected === null) return { kind: 'not_found' as const }
    const toolRef = await admittedToolRef(ctx, selected.sourceRouteRef)
    return { kind: 'found' as const, coverage: directoryCoverage(generation), item: { ...indexedDirectoryEntry(row, selected), ...(toolRef === undefined ? {} : { toolRef }) } }
  }

/**
 * Canonical `/tools/<providerKey>/<slug>` lookup: an indexed read (title,
 * Provider, price, description render synchronously from this) plus the
 * admitted toolRef when the same join above already found one - a pure V8
 * query/action path, so a cache hit never pays the Node admission action's
 * cold start (convex/x402Directory.ts).
 */
export const bySlugArgs = v.object({ providerKey: v.string(), slug: v.string() })
export const bySlugReturns = v.union(unavailableValue, v.object({ kind: v.literal('not_found') }), v.object({ kind: v.literal('found'), coverage: coverageValue, item: indexedEntryValue }))
export const bySlugHandler = async (ctx: QueryCtx, args: Infer<typeof bySlugArgs>) => {
    if (args.providerKey.length === 0 || args.providerKey.length > 253 || args.slug.length === 0 || args.slug.length > 200) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const selected = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_providerKey_and_slug', q => q.eq('generation', generation.generation).eq('providerKey', args.providerKey).eq('slug', args.slug))
      .filter(q => q.eq(q.field('network'), '*'))
      .unique()
    const row = selected === null ? null : await ctx.db.get(selected.entryId)
    if (row === null || selected === null) return { kind: 'not_found' as const }
    const toolRef = await admittedToolRef(ctx, selected.sourceRouteRef)
    return { kind: 'found' as const, coverage: directoryCoverage(generation), item: { ...indexedDirectoryEntry(row, selected), ...(toolRef === undefined ? {} : { toolRef }) } }
  }

/**
 * Reverse lookup for the `/tools/$toolRef` redirect: an admitted Tool's
 * current publication back to the directory entry's canonical URL, so an
 * agent-facing `operation:v1:` link still lands on a shareable, human-legible
 * page. `null` (no directory entry, or the Tool did not originate from this
 * directory) keeps the caller on the existing `/tools/$toolRef` page.
 */
export const canonicalUrlForToolArgs = v.object({ toolRef: v.string() })
export const canonicalUrlForToolReturns = v.union(v.null(), v.object({ providerHost: v.string(), slug: v.string() }))
export const canonicalUrlForToolHandler = async (ctx: QueryCtx, args: Infer<typeof canonicalUrlForToolArgs>) => canonicalSlugForToolRef(ctx, args.toolRef)

/**
 * First adoption-sorted page of eligible entries in a just-completed
 * generation, read by x402DirectoryIndexRefresh.onComplete to pre-admit a
 * bounded set of Tools (plan-limit budget: 24, not the whole eligible set).
 */
export const firstEligiblePageArgs = v.object({ generation: v.string() })
export const firstEligiblePageReturns = v.array(v.string())
export const firstEligiblePageHandler = async (ctx: QueryCtx, args: Infer<typeof firstEligiblePageArgs>) => {
    const rows = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_elig_and_payersOrder', q => q.eq('generation', args.generation).eq('network', '*').eq('eligible', true))
      .order('desc').take(24)
    return rows.map(row => row.resource)
  }

/** Exact selected snapshot; neither text rank nor the first source page is an admission gate. */
export const selectedSourceArgs = v.object({ resource: v.string(), network: v.optional(v.string()), provider: v.optional(v.string()), maxUsdPrice: v.optional(v.number()) })
export const selectedSourceReturns = v.union(unavailableValue, v.object({ kind: v.literal('not_found') }), v.object({ kind: v.literal('found'), sourceJson: v.string(), entry: directoryEntryValue }))
export const selectedSourceHandler = async (ctx: QueryCtx, args: Infer<typeof selectedSourceArgs>) => {
    const { resource, ...filters } = args
    const parsed = x402DirectoryIndexInputSchema.safeParse(filters)
    if (!parsed.success || resource.length === 0 || resource.length > 8192) return { kind: 'unavailable' as const, reason: 'query_invalid' }
    const generation = await activeDirectoryGeneration(ctx)
    if (generation === null) return { kind: 'unavailable' as const, reason: 'index_unavailable' }
    const selected = await ctx.db.query('marketDirectorySearchEntries')
      .withIndex('by_generation_and_network_and_resource', q => q.eq('generation', generation.generation).eq('network', '*').eq('resource', resource)).unique()
    const row = selected === null ? null : await ctx.db.get(selected.entryId)
    if (row === null) return { kind: 'not_found' as const }
    const entry = storedDirectoryEntry(row)
    if (!directoryEntryMatchesFilters(entry, parsed.data)) return { kind: 'unavailable' as const, reason: 'resource_filters_mismatch' }
    // The stored source snapshot is optional on the row, and the caller is asking
    // for exactly that snapshot, so a row without one has nothing to return.
    const sourceJson = row.directorySourceJson
    if (sourceJson === undefined) return { kind: 'not_found' as const }
    return { kind: 'found' as const, sourceJson, entry }
  }
