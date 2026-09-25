import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { normalizeSearchText } from '@/modules/common/normalize-search-text'
import { readCatalogOfferingToolMap } from '@/modules/capability-supply/tool-source'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { readPublicOfferingRegistrySearchPage } from '../registry.functions'
import { registrySearchTokens } from './search-documents'
import { projectPublicServicesSearchPage, type ServiceToolMap } from './services-api-projection'
import {
  projectAdmittedListing,
  projectCatalogueEndpointListing,
  projectDirectoryListing,
  type DirectoryListingInput,
  type ListingSearchGroups,
  type ListingSearchItem,
} from './listing-projection'

type DirectorySearchPage =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{
    kind: 'ok'
    page: readonly Readonly<{ entry: DirectoryListingInput; toolRef?: string }>[]
    isDone: boolean
  }>
const directoryBrowse = sourceQuery<{
  query: string
  paginationOpts: { numItems: number; cursor: null; maximumRowsRead: number }
}, DirectorySearchPage>('x402DirectoryIndex:browse')

function containsQuery(text: string, tokens: readonly string[]): boolean {
  const normalized = normalizeSearchText(text)
  return tokens.every(token => normalized.includes(token))
}

async function directoryListings(query: string, tokens: readonly string[]): Promise<Readonly<{ items: readonly ListingSearchItem[]; hasMore: boolean }>> {
  if (query.length > 200) throw new Error('directory_query_too_long')
  const page = await callPublicSourceQuery(directoryBrowse, {
    query,
    paginationOpts: { numItems: 24, cursor: null, maximumRowsRead: 512 },
  })
  if (page.kind !== 'ok') throw new Error('directory_unavailable')
  return {
    items: page.page.flatMap(({ entry, toolRef }) => {
      // A joined index row belongs to its admitted Tool; it is never a second
      // directory-only listing, even when that Tool falls outside this page.
      if (toolRef !== undefined || !containsQuery(`${entry.title} ${entry.description} ${entry.provider}`, tokens)) return []
      const listing = projectDirectoryListing(entry)
      const href = entry.slug === undefined || entry.provider === 'Unknown provider'
        ? listing.hostPage.kind === 'present' ? listing.hostPage.value : `/market?query=${encodeURIComponent(query)}`
        : `/tools/${encodeURIComponent(entry.provider)}/${encodeURIComponent(entry.slug)}`
      return [{ listing, href }]
    }),
    hasMore: !page.isDone,
  }
}

async function catalogueListings(query: string, tokens: readonly string[]): Promise<Readonly<{ items: readonly ListingSearchItem[]; hasMore: boolean }>> {
  const page = await readPublicOfferingRegistrySearchPage({ query, limit: 50 })
  const links = page.items.length === 0 ? [] : await readCatalogOfferingToolMap(page.items.map(item => item.businessId))
  const toolMap: Record<string, (typeof links)[number][]> = {}
  for (const link of links) (toolMap[link.offeringRef] ??= []).push(link)
  const services = projectPublicServicesSearchPage(page, toolMap satisfies ServiceToolMap).services
  return {
    items: services.flatMap(service => service.endpoints.flatMap(endpoint => {
      if (endpoint.ae.toolRef !== undefined) return []
      const offering = service.ae.offerings.find(item => item.offeringRef === endpoint.ae.offeringRef)
      if (offering === undefined || !containsQuery(`${offering.name} ${offering.summary} ${endpoint.description} ${service.name}`, tokens)) return []
      return [{ listing: projectCatalogueEndpointListing(service, endpoint), href: `/${service.id}` }]
    })),
    hasMore: page.pagination.hasMore,
  }
}

/** One search read model for the header and Market, with page-scoped counts. */
export async function readListingSearchGroups(
  query: string,
  admitted: readonly PublicToolDescriptor[],
  displayedLimit: number,
): Promise<Readonly<{ groups: ListingSearchGroups; partialResults: boolean }>> {
  const tokens = registrySearchTokens(query)
  const sources = await Promise.allSettled([
    directoryListings(query, tokens),
    catalogueListings(query, tokens),
  ] as const)
  const directory = sources[0].status === 'fulfilled' ? sources[0].value : undefined
  const catalogue = sources[1].status === 'fulfilled' ? sources[1].value : undefined
  const seen = new Set<string>()
  const buyThroughAe = admitted.map(tool => ({ listing: projectAdmittedListing(tool), href: `/tools/${encodeURIComponent(tool.toolRef)}` }))
  const listedElsewhere: ListingSearchItem[] = []
  for (const item of [...directory?.items ?? [], ...catalogue?.items ?? []]) {
    const source = item.listing.sources[0]
    const key = source.kind === 'directory' ? `directory:${source.sourceRouteRef}` : source.kind === 'business_catalogue' ? `catalogue:${source.endpointRef}` : `tool:${source.toolRef}`
    if (seen.has(key)) continue
    seen.add(key)
    listedElsewhere.push(item)
  }
  const buyItems = buyThroughAe.slice(0, displayedLimit)
  const elsewhereItems = listedElsewhere.slice(0, Math.max(0, displayedLimit - buyItems.length))
  const groups: ListingSearchGroups = {
    buyThroughAe: { items: buyItems, count: buyThroughAe.length },
    listedElsewhere: { items: elsewhereItems, count: listedElsewhere.length },
    total: buyThroughAe.length + listedElsewhere.length,
    displayed: buyItems.length + elsewhereItems.length,
    scope: 'page',
    hasMore: (directory?.hasMore ?? false) || (catalogue?.hasMore ?? false),
  }
  return { groups, partialResults: directory === undefined || catalogue === undefined }
}
