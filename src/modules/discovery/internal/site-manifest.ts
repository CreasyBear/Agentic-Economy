import { canonicalDigest } from '@/modules/common/canonical-digest'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import { BUSINESS_TOOL_AGENT_SCOPE } from '@/modules/business-tools/public'
import {
  CUSTOMER_REQUEST_AGENT_ENTRYPOINT,
  CUSTOMER_REQUEST_AGENT_SCOPE,
  CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
  CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
  CUSTOMER_REQUEST_STATE_VALUES,
} from '@/modules/customer-request/agent-contract'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '@/modules/customer-request/public-comprehension'

import { PublicAgentSkillPath } from './agent-skill'
import { DiscoveryListingBoundaryLine, DiscoveryPublicSurfacePaths } from './discovery-files'
import {
  DeveloperDiscoveryArtifacts,
  DeveloperDiscoveryPublicRoutes,
  DeveloperDiscoveryUnsupportedCapabilities,
} from '../developer-discovery'
import type { DeveloperDiscoveryUnsupportedCapability } from '../developer-discovery'

export const SiteDiscoveryManifestSchemaVersion = 'ae-site-discovery:v1' as const

export const SiteDiscoveryEndpointKindValues = [
  'site_entry_point',
  'human_surface',
  'assistant_setup',
  'catalog_list',
  'catalog_search',
  'catalog_detail',
  'business_manifest',
  'discovery_file',
  'discovery_artifact',
  'customer_request_submit',
  'customer_request_schema',
  'privacy_request',
] as const
export type SiteDiscoveryEndpointKind = (typeof SiteDiscoveryEndpointKindValues)[number]

export type SiteDiscoveryEndpointContract = Readonly<{
  kind: SiteDiscoveryEndpointKind
  label: string
  method: 'GET' | 'POST'
  /** Site-relative, exactly as it must be requested. `{slug}` is the only placeholder. */
  path: string
  url: string
  templated: boolean
  mediaType: string
  authentication: 'none' | 'ae_api_key'
  requiredScope?: string
}>

export type SiteDiscoveryManifestContract = Readonly<{
  schemaVersion: typeof SiteDiscoveryManifestSchemaVersion
  ucpVersion: 'v1'
  name: 'Agentic Economy'
  summary: readonly string[]
  origin: string
  generatedAt: number
  endpoints: readonly SiteDiscoveryEndpointContract[]
  customerRequest: Readonly<{
    contract: string
    method: 'POST'
    url: string
    schemaUrl: string
    authentication: 'clerk_api_key'
    requiredScope: string
    authorityModes: readonly string[]
    deviceAuthorizationUrl: string
    tokenUrl: string
    protectedResourceMetadataUrl: string
    keyRequestUrl: string
    navigationRelations: readonly string[]
    lifecycleStates: readonly string[]
  }>
  assistantSetup: Readonly<{
    instructionsUrl: string
    publicIndexUrl: string
    humanGuideUrl: string
  }>
  businessManifestUrlTemplate: string
  /**
   * Calling a named business, as opposed to reading about one. Which tools a
   * given business actually publishes is answered by its own manifest, so this
   * advertises the shape rather than implying every business exposes one.
   */
  businessTools: Readonly<{
    prepareUrlTemplate: string
    invokeUrlTemplate: string
    method: 'POST'
    authentication: 'clerk_api_key'
    requiredScope: string
    keyRequestUrl: string
    toolListSource: string
  }>
  boundary: string
  generatedHash: string
  unsupportedCapabilities: readonly DeveloperDiscoveryUnsupportedCapability[]
}>

export const SiteDiscoveryManifestPath = '/.well-known/ucp' as const
const businessManifestPath = '/{slug}/ucp' as const
const businessToolPath = '/{slug}/tools/{toolId}' as const
const agentKeyPath = '/agent-access' as const

const humanSurfaceLabels: Readonly<Record<string, string>> = {
  '/': 'Human entry point',
  '/claim': 'Claim your business page',
  '/for-agents': 'Guide for AI assistants',
  '/privacy/remove-business': 'Listing correction or removal',
  [SiteDiscoveryManifestPath]: 'This document',
  [PublicAgentSkillPath]: 'Assistant setup instructions',
}

/**
 * The site-level entry point a cold agent reads before it knows any business.
 *
 * Every path here is projected from a list that already governs another public
 * surface — the developer discovery routes and artifacts, the llms.txt public
 * surface list, and the Customer Request agent contract. Nothing is restated by
 * hand, so an endpoint cannot drift into this document without also changing
 * the surface that owns it.
 */
export function buildSiteDiscoveryManifest(
  input: Readonly<{ canonicalBaseUrl: string; now: number }>
): SiteDiscoveryManifestContract {
  const origin = trimTrailingSlashes(input.canonicalBaseUrl)
  const endpoints = buildEndpoints(origin)
  const body = {
    schemaVersion: SiteDiscoveryManifestSchemaVersion,
    ucpVersion: 'v1',
    name: 'Agentic Economy',
    summary: CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES,
    origin,
    endpoints,
    customerRequest: {
      contract: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.contract,
      method: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method,
      url: `${origin}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
      schemaUrl: `${origin}${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath}`,
      authentication: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.authentication,
      requiredScope: CUSTOMER_REQUEST_AGENT_SCOPE,
      authorityModes: CUSTOMER_REQUEST_AUTHORITY_MODE_VALUES,
      deviceAuthorizationUrl: `${origin}/oauth/device_authorization`,
      tokenUrl: `${origin}/oauth/token`,
      protectedResourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
      keyRequestUrl: `${origin}${agentKeyPath}`,
      navigationRelations: CUSTOMER_REQUEST_NAVIGATION_RELATION_VALUES,
      lifecycleStates: CUSTOMER_REQUEST_STATE_VALUES,
    },
    assistantSetup: {
      instructionsUrl: `${origin}${PublicAgentSkillPath}`,
      publicIndexUrl: `${origin}/llms.txt`,
      humanGuideUrl: `${origin}/for-agents`,
    },
    businessManifestUrlTemplate: `${origin}${businessManifestPath}`,
    businessTools: {
      prepareUrlTemplate: `${origin}${businessToolPath}/prepare`,
      invokeUrlTemplate: `${origin}${businessToolPath}`,
      method: 'POST',
      authentication: 'clerk_api_key',
      requiredScope: BUSINESS_TOOL_AGENT_SCOPE,
      keyRequestUrl: `${origin}${agentKeyPath}`,
      toolListSource: `${origin}${businessManifestPath}`,
    },
    boundary: DiscoveryListingBoundaryLine,
    unsupportedCapabilities: DeveloperDiscoveryUnsupportedCapabilities,
  } as const

  return { ...body, generatedAt: input.now, generatedHash: canonicalDigest(body) }
}

function buildEndpoints(origin: string): readonly SiteDiscoveryEndpointContract[] {
  // Labels are merged from every owning list first, so the dedupe below cannot
  // drop a route's real label just because a less descriptive list named the
  // same path earlier.
  const labels: Readonly<Record<string, string>> = {
    ...humanSurfaceLabels,
    [CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path]: 'Customer Request submission',
    [CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath]: 'Customer Request contract schema',
    ...Object.fromEntries(DeveloperDiscoveryPublicRoutes.map((route) => [route.path, route.label])),
    ...Object.fromEntries(DeveloperDiscoveryArtifacts.map((artifact) => [artifact.route, artifact.label])),
  }
  const paths: readonly string[] = [
    ...DiscoveryPublicSurfacePaths,
    PublicAgentSkillPath,
    ...DeveloperDiscoveryPublicRoutes.map((route) => route.path),
    ...DeveloperDiscoveryArtifacts.map((artifact) => artifact.route),
  ]

  const seen = new Set<string>()
  const endpoints: SiteDiscoveryEndpointContract[] = []
  for (const path of paths) {
    if (seen.has(path)) {
      continue
    }
    seen.add(path)
    const access = accessFor(path)
    endpoints.push({
      kind: kindFor(path),
      label: labels[path] ?? path,
      method: access.method,
      path,
      url: `${origin}${path}`,
      templated: path.includes('{'),
      mediaType: mediaTypeFor(path),
      authentication: access.authentication,
      ...(access.requiredScope === undefined ? {} : { requiredScope: access.requiredScope }),
    })
  }

  return endpoints
}

function kindFor(path: string): SiteDiscoveryEndpointKind {
  if (path === SiteDiscoveryManifestPath) return 'site_entry_point'
  if (path === CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path) return 'customer_request_submit'
  if (path === CUSTOMER_REQUEST_AGENT_ENTRYPOINT.schemaPath) return 'customer_request_schema'
  if (path === PublicAgentSkillPath) return 'assistant_setup'
  if (path === businessManifestPath) return 'business_manifest'
  if (path === '/privacy/remove-business') return 'privacy_request'
  if (path.startsWith('/api/discovery/')) return 'discovery_artifact'
  if (path === '/api/businesses') return 'catalog_list'
  if (path.startsWith('/api/businesses/search')) return 'catalog_search'
  if (path.startsWith('/api/businesses/')) return 'catalog_detail'
  if (path.startsWith('/api/')) return 'discovery_file'
  if (path.includes('.')) return 'discovery_file'
  return 'human_surface'
}

function accessFor(
  path: string
): Readonly<{ method: 'GET' | 'POST'; authentication: 'none' | 'ae_api_key'; requiredScope?: string }> {
  if (path === CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path) {
    return {
      method: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method,
      authentication: 'ae_api_key',
      requiredScope: CUSTOMER_REQUEST_AGENT_ENTRYPOINT.requiredScope,
    }
  }
  return { method: 'GET', authentication: 'none' }
}

function mediaTypeFor(path: string): string {
  if (path.endsWith('.txt')) return 'text/plain'
  if (path.endsWith('.xml')) return 'application/xml'
  if (path.endsWith('.md')) return 'text/markdown'
  if (path.startsWith('/api/') || path === businessManifestPath || path === SiteDiscoveryManifestPath) {
    return 'application/json'
  }
  return 'text/html'
}
