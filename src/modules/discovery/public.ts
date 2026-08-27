import type { InvalidationIntent } from '@/modules/observability/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import {
  type DiscoveryStatus,
} from './internal/schema-values'
export {
  OfferingDiscoveryManifestSchemaVersion,
  buildOfferingDiscoveryManifest,
} from './internal/offering-manifest'
export type {
  BuildOfferingDiscoveryManifestResult,
  OfferingDiscoveryManifestContract,
} from './internal/offering-manifest'
export {
  SITE_DISCOVERY_SUMMARY_LINES,
  SiteDiscoveryEndpointKindValues,
  SiteDiscoveryManifestSchemaVersion,
  buildSiteDiscoveryManifest,
  projectCompactSiteDiscoveryManifest,
} from './internal/site-manifest'
export type {
  SiteDiscoveryEndpointContract,
  SiteDiscoveryEndpointKind,
  SiteDiscoveryManifestContract,
} from './internal/site-manifest'
export {
  ApiCatalogManifestPath,
  buildApiCatalogDocument,
} from './internal/api-catalog'
export {
  PUBLIC_INVOCATION_REF_EXAMPLE,
  PUBLIC_IDEMPOTENCY_KEY_EXAMPLE,
  PUBLIC_OPERATION_REF_EXAMPLE,
  PUBLIC_RECONCILIATION_EVIDENCE_EXAMPLE,
  operationRouteExamples,
  operationRoutesMarkdown,
  publicMcpToolDocs,
} from './internal/operation-contract'
export type { PublicMcpToolDoc } from './internal/operation-contract'
export {
  AgentCatalogMarkdownLimit,
  buildBusinessMarkdown,
  buildCatalogMarkdown,
  buildForAgentsMarkdown,
  buildAboutMarkdown,
  buildMissingBusinessMarkdown,
  buildSiteBriefMarkdown,
  buildUnknownPageMarkdown,
} from './internal/page-markdown'

export {
  DiscoveryStatusValues,
} from './internal/schema-values'
export type { DiscoveryStatus }

export type DiscoverySourceState = RegistrySourceState & {
  invalidationIntents: InvalidationIntent[]
}

export type BuildDiscoveryFileOptions = {
  canonicalBaseUrl: string
  routingBaseUrl?: string
  now?: number
}

export type DiscoveryFileBuildResult = {
  body: string
  urls: readonly string[]
}

export { safePublicText } from './internal/manifest-projection'

export {
  buildLlmsTxt,
  buildOfferingLlmsTxt,
  buildOfferingLlmsUrlsFromSlugs,
  buildRobotsTxt,
  buildSitemapXml,
  buildSitemapXmlFromSlugs,
  DiscoveryPublicSurfacePaths,
} from './internal/discovery-files'

export { buildPublicAgentSkillMarkdown } from './internal/agent-skill'


export * from './developer-discovery'
