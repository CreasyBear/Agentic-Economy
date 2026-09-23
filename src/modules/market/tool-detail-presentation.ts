import type { PublicToolDetailRouteResult } from '@/modules/market/tool-detail-route.functions'
import type { MarketListingEvidenceProjection } from '@/modules/market/listing-evidence'
import type { X402DirectoryResolution } from '@/modules/market/x402-directory'
import { prepareX402DirectoryResourceServer } from '@/modules/market/x402-directory.functions'
import { readPublicToolDetailRouteServer } from '@/modules/market/tool-detail-route.functions'

export type ToolDetailPresentationResult =
  | PublicToolDetailRouteResult
  | Extract<X402DirectoryResolution, { kind: 'unavailable' }>
  | Readonly<{ kind: 'invalid_ref'; toolRef: string }>

export type ToolDetailPresentation = Readonly<{
  result: ToolDetailPresentationResult
  evidence?: MarketListingEvidenceProjection
}>

/**
 * Resolves a directory resource to its Tool detail, admitting it first when
 * `knownToolRef` (an already-attached join from convex/x402DirectoryIndex.ts)
 * is not present. Shared by the canonical `/tools/$providerHost/$slug` route
 * (which may already know the toolRef from that join) so both routes render
 * the identical Tool detail once resolved.
 */
export async function resolveDirectoryToolDetail(
  resource: string,
  knownToolRef?: string,
): Promise<ToolDetailPresentation> {
  let toolRef: string
  if (knownToolRef !== undefined) {
    toolRef = knownToolRef
  } else {
    const resolution = await prepareX402DirectoryResourceServer({ data: { resource } })
      .catch((): X402DirectoryResolution => ({ kind: 'unavailable', reason: 'source_unavailable' }))
    if (resolution.kind !== 'ready') {
      return { result: { kind: 'unavailable', reason: resolution.reason } }
    }
    toolRef = resolution.toolRef
  }
  const result = await readPublicToolDetailRouteServer({ data: { toolRef } })
    .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef }))
  const evidence = result.kind === 'found' ? result.evidence : undefined
  return { result, ...(evidence === undefined ? {} : { evidence }) }
}
