import type { BusinessId, Slug, SourceHash } from '@/modules/common/ids'
import type { PublicCatalogContract, ServiceCapabilityContract } from '@/modules/catalog/public'
import type {
  AuditEventContract,
  InvalidationIntent,
} from '@/modules/observability/public'
import type { RegistrySourceState } from '@/modules/registry/public'
import {
  invalidateDiscoveryManifest as invalidateDiscoveryManifestImpl,
  readDiscoveryHealth as readDiscoveryHealthImpl,
  regenerateDiscoveryManifest as regenerateDiscoveryManifestImpl,
} from './internal/manifest-attempts'
import {
  buildLlmsTxt as buildLlmsTxtImpl,
  buildRobotsTxt as buildRobotsTxtImpl,
  buildSitemapXml as buildSitemapXmlImpl,
} from './internal/discovery-files'
import { createFixtureDiscoverySourceState as createDefaultDiscoverySourceStateImpl } from './internal/source-state'
import { buildCatalogDiscoveryManifest as buildCatalogDiscoveryManifestImpl } from './internal/ucp-manifest'

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

export type DiscoveryManifestFirstRequestContract = {
  mode: PublicCatalogContract['services'][number]['firstRequest']['mode']
  publicDisclosure: string
  publicChannel: PublicCatalogContract['services'][number]['firstRequest']['publicChannel']
  noContactReason?: string
}

export type DiscoveryManifestCapabilityContract = {
  kind: ServiceCapabilityContract['kind']
  status: ServiceCapabilityContract['status']
  firstRequest: DiscoveryManifestFirstRequestContract
  callable: false
  paymentRequired: false
  reason?: string
}

export type DiscoveryManifestServiceContract = {
  slug: Slug
  name: string
  category: string
  summary: string
  serviceArea: string
  hoursOrUnknown: string
  status: 'published'
  capabilities: readonly DiscoveryManifestCapabilityContract[]
}

export type DiscoveryManifestContract = {
  schemaVersion: DiscoveryManifestSchemaVersion
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
  status: DiscoveryStatus
  sourceHash: SourceHash
  sourceVersion: DiscoveryManifestSourceVersion
  generatedHash: SourceHash
  bodyHash: SourceHash
  urlHash: SourceHash
  generatedAt: number
  updatedAt: number
  routes: readonly DiscoveryManifestRouteContract[]
  services: readonly DiscoveryManifestServiceContract[]
  unsupportedCapabilities: {
    callable: false
    paymentRequired: false
  }
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
  catalog: PublicCatalogContract | undefined
  now: number
  canonicalBaseUrl?: string
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
  now: number
  canonicalBaseUrl?: string
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
  canonicalBaseUrl?: string
  now?: number
}

export type DiscoveryFileBuildResult = {
  body: string
  urls: readonly string[]
}

export type ReadCatalogDiscoveryManifestInput = {
  slug: string
  canonicalBaseUrl?: string
  now: number
}

export type ReadCatalogDiscoveryManifestResult = BuildCatalogDiscoveryManifestResult

export function readFixtureCatalogDiscoveryManifest(
  input: ReadCatalogDiscoveryManifestInput
): ReadCatalogDiscoveryManifestResult {
  const state = createDefaultDiscoverySourceStateImpl()
  const result = regenerateDiscoveryManifestImpl(
    state,
    { slug: input.slug },
    {
      ...(input.canonicalBaseUrl === undefined ? {} : { canonicalBaseUrl: input.canonicalBaseUrl }),
      now: input.now,
    }
  )

  if (result.kind === 'ok') {
    return { kind: 'available', manifest: result.manifest }
  }

  return { kind: 'hidden', reason: 'not_public' }
}

export function readFixtureLlmsTxt(options: BuildDiscoveryFileOptions = {}): DiscoveryFileBuildResult {
  return buildLlmsTxtImpl(createDefaultDiscoverySourceStateImpl(), options)
}

export function readFixtureSitemapXml(options: BuildDiscoveryFileOptions = {}): DiscoveryFileBuildResult {
  return buildSitemapXmlImpl(createDefaultDiscoverySourceStateImpl(), options)
}

export const buildCatalogDiscoveryManifest = buildCatalogDiscoveryManifestImpl

export const regenerateDiscoveryManifest = regenerateDiscoveryManifestImpl

export const invalidateDiscoveryManifest = invalidateDiscoveryManifestImpl

export const readDiscoveryHealth = readDiscoveryHealthImpl

export const buildLlmsTxt = buildLlmsTxtImpl

export const buildSitemapXml = buildSitemapXmlImpl

export const buildRobotsTxt = buildRobotsTxtImpl

export const createDefaultDiscoverySourceState = createDefaultDiscoverySourceStateImpl

export * from './developer-discovery'
