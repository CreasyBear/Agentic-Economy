import type { BusinessId, Slug, SourceHash } from '@/modules/common/ids'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type {
  AuditEventContract,
  InvalidationIntent,
} from '@/modules/observability/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import { regenerateDiscoveryManifest } from './internal/manifest-attempts'
import { buildLlmsTxt, buildSitemapXml } from './internal/discovery-files'
import { createFixtureDiscoverySourceState } from './internal/source-state'
export {
  OfferingDiscoveryManifestSchemaVersion,
  buildOfferingDiscoveryManifest,
} from './internal/offering-manifest'
export type {
  BuildOfferingDiscoveryManifestResult,
  OfferingDiscoveryManifestContract,
} from './internal/offering-manifest'
export {
  SiteDiscoveryEndpointKindValues,
  SiteDiscoveryManifestSchemaVersion,
  buildSiteDiscoveryManifest,
} from './internal/site-manifest'
export type {
  SiteDiscoveryEndpointContract,
  SiteDiscoveryEndpointKind,
  SiteDiscoveryManifestContract,
} from './internal/site-manifest'
export {
  AgentCatalogMarkdownLimit,
  buildBusinessMarkdown,
  buildCatalogMarkdown,
  buildMissingBusinessMarkdown,
  buildSiteBriefMarkdown,
  buildUnknownPageMarkdown,
} from './internal/page-markdown'
export type { AgentPageMarkdownOptions } from './internal/page-markdown'

export const DiscoveryStatusValues = ['unavailable', 'degraded', 'available', 'stale'] as const
export type DiscoveryStatus = (typeof DiscoveryStatusValues)[number]

export const DiscoveryPathKindValues = ['ae_hosted_fallback', 'business_origin_standard'] as const
export type DiscoveryPathKind = (typeof DiscoveryPathKindValues)[number]

export const DiscoveryAttemptStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type DiscoveryAttemptStatus = (typeof DiscoveryAttemptStatusValues)[number]

export const DiscoveryRepairActionValues = ['regenerate_manifest', 'invalidate_manifest', 'no_repair'] as const
export type DiscoveryRepairAction = (typeof DiscoveryRepairActionValues)[number]

export const DiscoveryRepairResultValues = ['not_run', 'succeeded', 'failed'] as const
export type DiscoveryRepairResult = (typeof DiscoveryRepairResultValues)[number]

export const DiscoveryManifestSchemaVersion = 'ae-ucp-fallback:v1' as const
export type DiscoveryManifestSchemaVersion = typeof DiscoveryManifestSchemaVersion

export const DiscoveryManifestSourceVersion = 'public-catalog:v1' as const
export type DiscoveryManifestSourceVersion = typeof DiscoveryManifestSourceVersion

export const DiscoveryManifestRouteKindValues = ['business_page', 'ucp_manifest', 'api_detail'] as const
export type DiscoveryManifestRouteKind = (typeof DiscoveryManifestRouteKindValues)[number]

export type DiscoveryManifestRouteContract = {
  kind: DiscoveryManifestRouteKind
  url: string
  routeTested: true
}

export type DiscoveryManifestOfferingContract = Readonly<PublicBusinessCatalogApiV2Dto['offerings'][number]>

export type DiscoveryManifestContract = {
  schemaVersion: DiscoveryManifestSchemaVersion
  businessCatalogSchemaVersion: PublicBusinessCatalogApiV2Dto['schemaVersion']
  businessId: BusinessId
  slug: Slug
  businessName: string
  category: string
  location: {
    suburb: string
    stateTerritory: string
    postcode?: string
  }
  publicUrl: string
  manifestUrl: string
  ucpVersion: string
  pathKind: Extract<DiscoveryPathKind, 'ae_hosted_fallback'>
  disposition: PublicBusinessCatalogApiV2Dto['disposition']
  sourceHash?: SourceHash
  sourceVersion: DiscoveryManifestSourceVersion
  generatedHash: SourceHash
  bodyHash: SourceHash
  urlHash: SourceHash
  generatedAt: number
  observedAt: number
  routes: readonly DiscoveryManifestRouteContract[]
  offerings: readonly DiscoveryManifestOfferingContract[]
  degradedReason?: string
  suppressedAt?: number
}

export type DiscoveryManifestReadback = {
  businessId: BusinessId
  slug: Slug
  manifestUrl: string
  sourceVersion: DiscoveryManifestSourceVersion
  sourceHash: SourceHash
  generatedHash: SourceHash
  bodyHash: SourceHash
  urlHash: SourceHash
  routeUrls: readonly string[]
  readAt: number
}

export type BuildCatalogDiscoveryManifestInput = {
  catalog: PublicBusinessCatalogApiV2Dto | undefined
  canonicalBaseUrl: string
  now: number
  sourceHash?: SourceHash
}

export type BuildCatalogDiscoveryManifestResult =
  | { kind: 'available'; manifest: DiscoveryManifestContract }
  | { kind: 'hidden'; reason: 'not_public' | 'no_public_catalog' }

export type DiscoveryManifestAttemptContract = {
  attemptId: string
  businessId: BusinessId
  ucpVersion: string
  pathKind: Extract<DiscoveryPathKind, 'ae_hosted_fallback'>
  sourceHash: SourceHash
  sourceVersion: DiscoveryManifestSourceVersion
  status: DiscoveryAttemptStatus
  retryCount: number
  failureCode?: string
  failureMessageRedacted?: string
  startedAt: number
  finishedAt?: number
  generatedHash?: SourceHash
  bodyHash?: SourceHash
  urlHash?: SourceHash
  latestReadback?: DiscoveryManifestReadback
  staleThresholdAt?: number
  repairAction: DiscoveryRepairAction
  repairResult: DiscoveryRepairResult
}

export type DiscoverySourceState = RegistrySourceState & {
  discoveryManifests: DiscoveryManifestContract[]
  invalidationIntents: InvalidationIntent[]
}

export type DiscoveryManifestAdapterResult =
  | { kind: 'ok' }
  | { kind: 'error'; code: string; redactedMessage: string }

export type DiscoveryManifestAdapter = {
  readManifest: (manifest: DiscoveryManifestContract) => DiscoveryManifestAdapterResult
}

export type RegenerateDiscoveryManifestInput =
  | { businessId: BusinessId }
  | { slug: Slug | string }

export type RegenerateDiscoveryManifestOptions = {
  canonicalBaseUrl: string
  now: number
  staleAfterMs?: number
  adapter?: DiscoveryManifestAdapter
}

export type RegenerateDiscoveryManifestResult =
  | {
      kind: 'ok'
      code: 'discovery_manifest_generated' | 'discovery_manifest_replayed'
      manifest: DiscoveryManifestContract
      attempt: DiscoveryManifestAttemptContract
      auditEvent: AuditEventContract
    }
  | {
      kind: 'error'
      code: 'discovery_manifest_not_public' | 'discovery_manifest_failed'
      retryable: boolean
      reason: string
      attempt?: DiscoveryManifestAttemptContract
      auditEvent?: AuditEventContract
    }

export type InvalidateDiscoveryManifestInput = {
  businessId: BusinessId
  now: number
  reasonCode: string
}

export type InvalidateDiscoveryManifestResult = {
  kind: 'ok'
  code: 'discovery_manifest_invalidated'
  attempts: readonly DiscoveryManifestAttemptContract[]
  manifests: readonly DiscoveryManifestContract[]
}

export type DiscoveryHealthReadback = {
  businessId: BusinessId
  sourceState: 'published' | 'not_public'
  discoveryStatus: DiscoveryStatus
  latestManifest?: DiscoveryManifestContract
  latestAttempt?: DiscoveryManifestAttemptContract
  affectedPublicSurfaces: readonly string[]
  repairAction: DiscoveryRepairAction
  repairResult: DiscoveryRepairResult
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

export type ReadCatalogDiscoveryManifestInput = {
  slug: string
  canonicalBaseUrl: string
  now: number
}

export type ReadCatalogDiscoveryManifestResult = BuildCatalogDiscoveryManifestResult

export function readFixtureCatalogDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput
): ReadCatalogDiscoveryManifestResult {
  const state = createFixtureDiscoverySourceState()
  const result = regenerateDiscoveryManifest(
    state,
    { slug: input.slug },
    {
      canonicalBaseUrl: input.canonicalBaseUrl,
      now: input.now,
    }
  )

  if (result.kind === 'ok') {
    return { kind: 'available', manifest: result.manifest }
  }

  return { kind: 'hidden', reason: 'not_public' }
}

export function readFixtureLlmsTxt(options: BuildDiscoveryFileOptions): DiscoveryFileBuildResult {
  return buildLlmsTxt(createFixtureDiscoverySourceState(), options)
}

export function readFixtureSitemapXml(options: BuildDiscoveryFileOptions): DiscoveryFileBuildResult {
  return buildSitemapXml(createFixtureDiscoverySourceState(), options)
}

export { buildCatalogDiscoveryManifest } from './internal/ucp-manifest'
export { safePublicText } from './internal/ucp-manifest'

export {
  regenerateDiscoveryManifest,
  invalidateDiscoveryManifest,
  readDiscoveryHealth,
} from './internal/manifest-attempts'

export {
  buildLlmsTxt,
  buildOfferingLlmsTxt,
  buildOfferingLlmsUrlsFromSlugs,
  buildRobotsTxt,
  buildSitemapXml,
  buildSitemapXmlFromSlugs,
} from './internal/discovery-files'

export { buildPublicAgentSkillMarkdown } from './internal/agent-skill'

export {
  createFixtureDiscoverySourceState as createDefaultDiscoverySourceState,
} from './internal/source-state'

export * from './developer-discovery'
