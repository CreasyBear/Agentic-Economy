import { z } from 'zod'
import { directoryIndexRangesValid, x402DirectoryIndexInputSchema, type X402DirectoryIndexCoverage, type X402IndexedDirectoryEntry } from './x402-directory-index'
import type { X402DirectoryPage } from './x402-directory'

export const x402DirectoryCatalogueInputSchema = x402DirectoryIndexInputSchema.omit({ category: true }).extend({
  directoryCategory: z.string().trim().min(1).max(80).transform(value => value.toLowerCase()).optional(),
  indexCursor: z.string().min(1).max(16384).optional(),
  offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).refine(input => !input.query || input.sort === undefined || input.sort === 'relevance', 'Keyword search requires relevance sorting.')
  .refine(input => input.indexCursor === undefined || !input.offset, 'Index and source pagination cannot be combined.')
  .refine(directoryIndexRangesValid, 'The minimum cannot exceed the maximum.')
export type X402DirectoryCatalogueInput = z.infer<typeof x402DirectoryCatalogueInputSchema>
export type X402DirectoryCatalogueUnavailable = Readonly<{ kind: 'unavailable'; reason: string }>
export type X402DirectoryCatalogue = X402DirectoryCatalogueUnavailable | Readonly<{
  kind: 'ok'
  source: 'index' | 'upstream_limited'
  page: Extract<X402DirectoryPage, { kind: 'ok' }>
  coverage?: X402DirectoryIndexCoverage
  searchMethod: 'native_full_text' | 'native_index' | 'upstream'
  indexCursor?: string
  isDone: boolean
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null
  splitCursor?: string | null
}>
export type X402DirectoryFacet = Readonly<{ key: string; label: string; count: number; iconUrl?: string }>
export type X402DirectoryCatalogueOverview = X402DirectoryCatalogueUnavailable | Readonly<{
  kind: 'ok'; coverage: X402DirectoryIndexCoverage
  categories: readonly X402DirectoryFacet[]; providers: readonly X402DirectoryFacet[]; networks: readonly X402DirectoryFacet[]
  tags?: readonly X402DirectoryFacet[]; bundleSlugs?: readonly X402DirectoryFacet[]
  popular: readonly X402IndexedDirectoryEntry[]; recentlyUpdated: readonly X402IndexedDirectoryEntry[]
}>
export const x402DirectoryCatalogueResourceInputSchema = z.strictObject({ resource: z.string().min(1).max(8192) })
export type X402DirectoryCatalogueResource = X402DirectoryCatalogueUnavailable | Readonly<{ kind: 'not_found' }> | Readonly<{
  kind: 'found'; coverage: X402DirectoryIndexCoverage; item: X402IndexedDirectoryEntry
}>

export const x402DirectoryProvidersInputSchema = z.strictObject({
  providerCursor: z.string().min(1).max(16384).optional(),
})
export type X402DirectoryProvidersInput = z.infer<typeof x402DirectoryProvidersInputSchema>
export type X402DirectoryProvidersPage = X402DirectoryCatalogueUnavailable | Readonly<{
  kind: 'ok'; coverage: X402DirectoryIndexCoverage; page: readonly X402DirectoryFacet[]
  isDone: boolean; continueCursor: string
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null; splitCursor?: string | null
}>

export type X402DirectoryAnalytics = X402DirectoryCatalogueUnavailable | Readonly<{
  kind: 'ok'
  coverage: X402DirectoryIndexCoverage
  scope: 'whole_generation'
  totalTools: number
  adoption: readonly Readonly<{ key: import('./x402-directory-index').DirectoryAdoptionBand; label: string; count: number }>[]
  metadata: readonly Readonly<{ key: 'hasInputFields' | 'hasOutputFields' | 'hasInputSchema' | 'hasOutputSchema' | 'hasOutputExample' | 'curated'; label: string; count: number }>[]
  categories: readonly X402DirectoryFacet[]
  networks: readonly X402DirectoryFacet[]
  curated: readonly X402IndexedDirectoryEntry[]
  price: Readonly<{
    scope: 'whole_generation' | 'network'
    network?: string
    totalTools: number
    knownPriceTools: number
    unknownPriceTools: number
    bands: readonly Readonly<{ key: import('./x402-directory-index').DirectoryPriceBand; label: string; count: number }>[]
    quantiles?: Readonly<{ minimum: string; p25: string; median: string; p75: string; maximum: string }>
    basis: 'minimum_exact_usdc_per_tool'
  }>
}>
