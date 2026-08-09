/**
 * Market-terminal feed catalog projected from the canonical executable source.
 * Feed IDs are operation references; capability IDs remain display metadata.
 */
import {
  defaultKeylessExecutableSource,
  type KeylessExecutableSourcePort,
} from '@/modules/capability-execution'
import { isPublicOperationRef } from '@/modules/capability-supply/public'

export type Feed = {
  id: string
  capabilityId: string
  name: string
  description: string
  searchTerms: readonly string[]
  inputSchema: Record<string, unknown>
  kind: 'market' | 'reference' | 'utility'
  executable: boolean
  endpointHost: string
  provenance: string
}

function kindFor(capabilityId: string): Feed['kind'] {
  const id = capabilityId.toLowerCase()
  if (id.includes('price') || id.includes('fx') || id.includes('rate') || id.includes('market')) return 'market'
  if (id.includes('wiki') || id.includes('geocode') || id.includes('forecast') || id.includes('weather') || id.includes('search')) return 'reference'
  return 'utility'
}

export async function listFeeds(
  source: KeylessExecutableSourcePort = defaultKeylessExecutableSource,
): Promise<Feed[]> {
  const listings = await source.list()
  const feeds: Feed[] = []
  for (const listing of listings) {
    if (!isPublicOperationRef(listing.operationRef)) continue
    const descriptor = await source.read(listing.operationRef)
    feeds.push({
      id: listing.operationRef,
      capabilityId: listing.capabilityId,
      name: listing.name,
      description: listing.summary,
      searchTerms: listing.searchTerms,
      inputSchema: listing.inputSchema,
      kind: kindFor(listing.capabilityId),
      executable: descriptor !== null,
      endpointHost: descriptor === null ? 'unknown' : new URL(descriptor.endpointUrl).host,
      provenance: descriptor === null
        ? 'source · descriptor_unavailable'
        : `${descriptor.provenance.publisher} · ${descriptor.provenance.sourceKind} · keyless`,
    })
  }
  return feeds
}

export async function resolveFeedAsync(
  id: string,
  source: KeylessExecutableSourcePort = defaultKeylessExecutableSource,
): Promise<Feed | undefined> {
  const feeds = await listFeeds(source)
  return feeds.find((feed) => feed.id === id)
}