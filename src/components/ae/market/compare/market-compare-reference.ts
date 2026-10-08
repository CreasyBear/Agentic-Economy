import { isPublicToolRef } from '@/modules/common/tool-ref'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import type { SearchResult } from '@/modules/registry/tool-choice-contracts'

/** Exact admitted identity takes precedence only when the source has a qualified join. */
export function directoryCompareReference(entry: X402DirectoryEntry): string {
  return entry.choice?.access !== 'external_listing' && isPublicToolRef(entry.choice?.toolRef)
    ? entry.choice.toolRef : entry.resource
}

export function searchCompareReference(item: SearchResult): string | undefined {
  if (item.access !== 'external_listing' && isPublicToolRef(item.toolRef)) return item.toolRef
  // The compact ID is not an endpoint. Never infer a resource from a title or host.
  if (/^registry:[a-f0-9]{64}$/u.test(item.id)) return item.id
  return item.sourceRouteRef !== undefined && URL.canParse(item.sourceRouteRef) && new URL(item.sourceRouteRef).protocol === 'https:' ? item.sourceRouteRef : undefined
}
