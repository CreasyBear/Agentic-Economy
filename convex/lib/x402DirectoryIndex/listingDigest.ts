import { canonicalDigest } from '@/modules/common/canonical-digest'
import { directoryMetadataFlags } from '@/modules/market/x402-directory-metadata'
import type { DirectoryEntry } from './contracts'

/**
 * Digest over listing-identity fields ONLY - resource, method, description,
 * accepts (scheme/network/asset/price), metadata flags, category, tags,
 * bundleSlugs, curated. Deliberately excludes calls30d/payers30d/lastCalledAt
 * (and anything else derived from them) so an upstream activity-only change
 * (the common case every run) never trips the "listing changed" branch in
 * x402DirectoryIndexStore.writeSource - that branch is reserved for the rarer
 * case where the Provider actually edited the listing.
 */
export function listingIdentityDigest(entry: DirectoryEntry, category: string): string {
  const accepts = [...entry.prices]
    .map(price => ({ scheme: price.scheme, network: price.network, asset: price.asset ?? null, price: price.amount }))
    .sort((a, b) => (a.network + a.scheme + a.asset).localeCompare(b.network + b.scheme + b.asset))
  return canonicalDigest({
    resource: entry.resource,
    method: entry.method ?? null,
    description: entry.description,
    accepts,
    metadata: directoryMetadataFlags(entry),
    category,
    tags: [...(entry.tags ?? [])].sort(),
    bundleSlugs: [...(entry.bundleSlugs ?? [])].sort(),
    curated: entry.curated === true,
  })
}
