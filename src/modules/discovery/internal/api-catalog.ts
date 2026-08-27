import { MCP_HTTP_ENDPOINT_PATH } from '@/lib/mcp-protocol'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import { PublicAgentSkillPath } from './agent-skill'
import { DiscoveryPublicSurfacePaths } from './discovery-files'
import { DeveloperDiscoveryPublicRoutes } from '../developer-discovery'
import { SiteDiscoveryManifestPath } from './site-manifest'

/**
 * RFC 9727 machine-readable catalog of AE's agent-facing API surfaces,
 * served at `/.well-known/api-catalog`.
 *
 * Like the site manifest, this is a pure projection of route lists that
 * already govern other public surfaces — the llms.txt public surface list,
 * the developer discovery routes, and the operation invoke contract. Nothing
 * is restated by hand: an endpoint cannot appear here without existing in the
 * surface that owns it.
 */
export const ApiCatalogManifestPath = '/.well-known/api-catalog' as const

type ApiCatalogLink = Readonly<{ href: string; type: string }>

type ApiCatalogLinksetEntry = Readonly<{
  anchor: string
  describedby?: readonly ApiCatalogLink[]
  'service-doc'?: readonly ApiCatalogLink[]
}>

/** Media-type mapping mirrors site-manifest's endpoint media conventions. */
function discoveryMediaTypeFor(path: string): string {
  if (path.endsWith('.txt')) return 'text/plain'
  if (path.endsWith('.md')) return 'text/markdown'
  if (path.startsWith('/api/') || path.startsWith('/.well-known/')) return 'application/json'
  return 'text/html'
}

export function buildApiCatalogDocument(
  input: Readonly<{ canonicalBaseUrl: string }>,
): Readonly<{ linkset: readonly ApiCatalogLinksetEntry[] }> {
  const origin = trimTrailingSlashes(input.canonicalBaseUrl)
  const restAnchors = DiscoveryPublicSurfacePaths.filter((path) => path.startsWith('/api/v1/market-operations/'))
  if (restAnchors.length === 0) throw new Error('No market-operation REST anchors are projected from the public surface paths')
  const llmsPath = DeveloperDiscoveryPublicRoutes.find(({ path }) => path === '/llms.txt')?.path
  if (llmsPath === undefined) throw new Error('LLMs text discovery file is not listed in developer discovery routes')
  const forAgentsPath = DiscoveryPublicSurfacePaths.find((path) => path === '/for-agents')
  if (forAgentsPath === undefined) throw new Error('Agent setup guide is not listed in the public surface paths')

  // RFC 9727 service-doc targets: machine index, assistant instructions, human guide.
  const serviceDoc: readonly ApiCatalogLink[] = [llmsPath, PublicAgentSkillPath, forAgentsPath].map((path) => ({
    href: `${origin}${path}`,
    type: discoveryMediaTypeFor(path),
  }))
  // The site manifest already enumerates each anchor's method, auth, and schemas.
  const describedby: readonly ApiCatalogLink[] = [{
    href: `${origin}${SiteDiscoveryManifestPath}`,
    type: discoveryMediaTypeFor(SiteDiscoveryManifestPath),
  }]
  const anchorEntry = (anchorPath: string): ApiCatalogLinksetEntry => ({
    anchor: `${origin}${anchorPath}`,
    describedby,
    'service-doc': serviceDoc,
  })

  return {
    linkset: [
      ...restAnchors.map(anchorEntry),
      anchorEntry(OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path),
      anchorEntry(MCP_HTTP_ENDPOINT_PATH),
    ],
  }
}
