import type { BusinessContext } from '@/modules/business/public'
import type { BusinessId, Slug, SourceHash } from '@/modules/common/ids'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type {
  AuditEventContract,
  InvalidationIntent,
} from '@/modules/observability/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import {
  DiscoveryAttemptStatusValues,
  DiscoveryManifestRouteKindValues,
  DiscoveryManifestSchemaVersion as DiscoveryManifestSchemaVersionValue,
  DiscoveryManifestSourceVersion as DiscoveryManifestSourceVersionValue,
  DiscoveryPathKindValues,
  DiscoveryRepairActionValues,
  DiscoveryRepairResultValues,
  DiscoveryStatusValues,
  type DiscoveryAttemptStatus,
  type DiscoveryManifestRouteKind,
  type DiscoveryManifestSchemaVersion as DiscoveryManifestSchemaVersionType,
  type DiscoveryManifestSourceVersion as DiscoveryManifestSourceVersionType,
  type DiscoveryPathKind,
  type DiscoveryRepairAction,
  type DiscoveryRepairResult,
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
  buildMissingBusinessMarkdown,
  buildSiteBriefMarkdown,
  buildUnknownPageMarkdown,
} from './internal/page-markdown'

export {
  DiscoveryAttemptStatusValues,
  DiscoveryManifestRouteKindValues,
  DiscoveryPathKindValues,
  DiscoveryRepairActionValues,
  DiscoveryRepairResultValues,
  DiscoveryStatusValues,
} from './internal/schema-values'
export type {
  DiscoveryAttemptStatus,
  DiscoveryManifestRouteKind,
  DiscoveryPathKind,
  DiscoveryRepairAction,
  DiscoveryRepairResult,
  DiscoveryStatus,
}
export const DiscoveryManifestSchemaVersion = DiscoveryManifestSchemaVersionValue
export const DiscoveryManifestSourceVersion = DiscoveryManifestSourceVersionValue
export type DiscoveryManifestSchemaVersion = DiscoveryManifestSchemaVersionType
export type DiscoveryManifestSourceVersion = DiscoveryManifestSourceVersionType

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
  businessContext: BusinessContext
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


export * from './developer-discovery'
