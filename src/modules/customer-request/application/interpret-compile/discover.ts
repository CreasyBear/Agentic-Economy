import type {
  OperationSearchInput,
  OperationSearchResult,
} from '@/modules/registry/public'
import type { ServerCapabilityDescriptor } from '@/modules/customer-request/semantic-interpreter'

import type { RequestGraph } from './types'

/**
 * Deterministic discovery read used to narrow the descriptor pool the interpreter may select
 * from before it proposes. Mirrors the ANSWER engine's discover-then-ground order: retrieve first
 * via the registry's read-only operation search, then let the interpreter choose from the focused
 * pool instead of forcing it to infer the right capability from the whole routeable graph.
 */
export type DiscoverCapabilities = (input: OperationSearchInput) => Promise<OperationSearchResult>

const MAX_DISCOVERY_RESULTS = 20

/**
 * Runs `registry.operations.search` on the customer's natural-language job and keeps only the
 * descriptors in `graph.descriptors` whose current operation references were returned.
 *
 * The `discover` function is injected by the caller rather than defaulted to a host transport:
 * keeping a default here would drag the TanStack server/Clerk adapter (`capability-supply/operation-source`)
 * into the Convex bundle. Host callers pass the source adapter; Convex actions pass an in-action
 * `ctx.runQuery` port. A missing port (`undefined`) means "no narrowing", which mirrors the previous
 * degraded in-Convex discovery and lets the interpreter keep the full descriptor set.
 *
 * When discovery returns nothing (empty/generic query or an unavailable source) the FULL descriptor
 * set is returned unchanged so the interpreter keeps its normal behavior rather than seeing an
 * artificial 'no supply'. Only the descriptor pool is narrowed — `graph.bindings`, `graph.models`,
 * `graph.mappings` and `graph.registrySnapshotDigest` are untouched because those are baked into the
 * aggregate and re-derived over the full routeable set elsewhere.
 */
export async function discoverAndFilterDescriptors(
  customerJob: string,
  graph: Extract<RequestGraph, { kind: 'available' }>,
  discover: DiscoverCapabilities | undefined,
): Promise<readonly ServerCapabilityDescriptor[]> {
  const query = customerJob.trim()
  if (discover === undefined || query.length === 0) return graph.descriptors
  let result: OperationSearchResult
  try {
    result = await discover({ query, limit: MAX_DISCOVERY_RESULTS })
  } catch {
    return graph.descriptors
  }
  if (result.kind !== 'ok' || result.items.length === 0) {
    return graph.descriptors
  }
  // Preserve the DISCOVERY relevance order (registry.operations.search ranks items by token
  // relevance) so the recovered pool's first descriptor is the discovery-top-ranked op. Discovery
  // is the retrieval authority (AI-SDK activeTools: surface + order the matching tools); the
  // interpreter then picks from, but never re-ranks, that order. A descriptor with several
  // operation refs is ranked by its earliest discovered ref.
  const rankByRef = new Map(result.items.map((item, index) => [item.operationRef, index]))
  const ordered = graph.descriptors
    .flatMap((descriptor) => {
      const ranks = descriptor.operationRefs
        .map((operationRef) => rankByRef.get(operationRef))
        .filter((rank): rank is number => rank !== undefined)
      if (ranks.length === 0) return []
      return [{ descriptor, rank: Math.min(...ranks) }]
    })
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.descriptor)
  return ordered.length > 0 ? ordered : graph.descriptors
}
