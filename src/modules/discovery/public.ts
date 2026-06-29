import type { BusinessId, Slug, SourceHash } from '@/modules/common/ids'
import type { PublicCatalogContract, ServiceCapabilityContract } from '@/modules/catalog/public'
import { getPublicBusinessCatalog } from '@/modules/catalog/public'
import type {
  AuditEventContract,
  FunnelEventType,
  InvalidationIntent,
  OperatorControlReadback,
} from '@/modules/observability/public'
import { readCatalogHealth } from '@/modules/registry/public'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  RegistrySourceState,
} from '@/modules/registry/public'
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


export const DeveloperDiscoverySchemaVersion = 'developer-discovery:v1' as const
export type DeveloperDiscoverySchemaVersion = typeof DeveloperDiscoverySchemaVersion

export const P2InquiryAvailabilityPublicStateValues = ['available', 'unavailable', 'degraded', 'not_shipped'] as const
export type P2InquiryAvailabilityPublicState = (typeof P2InquiryAvailabilityPublicStateValues)[number]

export type P2InquiryAvailabilityPublicStatus = {
  state: P2InquiryAvailabilityPublicState
  publicReason: string
  source: string
  lastVerifiedAt: number
}

export const DiscoverySupportSurfaceValues = [
  'public_json_routes',
  'ae_hosted_ucp_fallback',
  'llms_txt',
  'sitemap',
  'robots',
  'schema_examples',
  'route_health',
  'openapi_read_projection',
  'mcp_read_projection',
] as const
export type DiscoverySupportSurface = (typeof DiscoverySupportSurfaceValues)[number]

export const DiscoverySupportStateValues = ['shipped', 'degraded', 'unavailable', 'deferred', 'withheld'] as const
export type DiscoverySupportState = (typeof DiscoverySupportStateValues)[number]

export const DiscoveryGatedExclusionSurfaceValues = [
  'api_keys',
  'sdk',
  'cli',
  'plugin',
  'hosted_mcp_byo_proxy',
  'agent_router',
  'developer_gallery',
  'payment_descriptors',
  'protected_action_descriptors',
] as const
export type DiscoveryGatedExclusionSurface = (typeof DiscoveryGatedExclusionSurfaceValues)[number]

export type DiscoverySupportMatrixRow = {
  surface: DiscoverySupportSurface
  label: string
  state: DiscoverySupportState
  evidence: readonly string[]
  owner: string
  routeReadbackStatus: DiscoveryStatus
  blocker: string
  nextAction: string
}

export type DiscoveryGatedExclusion = {
  surface: DiscoveryGatedExclusionSurface
  label: string
  state: Extract<DiscoverySupportState, 'unavailable' | 'deferred'>
  reason: string
  nextAction: string
}

export type DiscoveryProjectionGateInput = {
  surface: Extract<DiscoverySupportSurface, 'openapi_read_projection' | 'mcp_read_projection'>
  routeParity: boolean
  descriptorScanClean: boolean
  evidence: readonly string[]
}

export type DiscoveryProjectionGateResult =
  | {
      kind: 'accepted'
      surface: Extract<DiscoverySupportSurface, 'openapi_read_projection' | 'mcp_read_projection'>
      evidence: readonly string[]
    }
  | {
      kind: 'withheld'
      surface: Extract<DiscoverySupportSurface, 'openapi_read_projection' | 'mcp_read_projection'>
      reason: string
    }

export const DeveloperDiscoveryArtifactKindValues = [
  'public_catalog_schema',
  'public_catalog_examples',
  'public_catalog_fixture_bundle',
] as const
export type DeveloperDiscoveryArtifactKind = (typeof DeveloperDiscoveryArtifactKindValues)[number]

export const DeveloperDiscoveryArtifactStateValues = ['available', 'degraded', 'unavailable'] as const
export type DeveloperDiscoveryArtifactState = (typeof DeveloperDiscoveryArtifactStateValues)[number]

export const DeveloperDiscoveryFreshnessValues = ['current', 'degraded', 'unavailable'] as const
export type DeveloperDiscoveryFreshness = (typeof DeveloperDiscoveryFreshnessValues)[number]

export const DeveloperDiscoveryUnsupportedStateValues = ['unavailable', 'deferred'] as const
export type DeveloperDiscoveryUnsupportedState = (typeof DeveloperDiscoveryUnsupportedStateValues)[number]

export const DeveloperDiscoveryFetchStatusValues = [
  'successful',
  'cached',
  'stale',
  'invalid',
  'not_found',
  'route_outage',
  'schema_version_mismatch',
] as const
export type DeveloperDiscoveryFetchStatus = (typeof DeveloperDiscoveryFetchStatusValues)[number]

export const DeveloperDiscoveryFetchKindValues = ['docs', 'schema', 'examples', 'fixtures', 'health'] as const
export type DeveloperDiscoveryFetchKind = (typeof DeveloperDiscoveryFetchKindValues)[number]

export const DeveloperDiscoveryBotClassValues = ['human', 'known_bot', 'unknown_bot', 'internal_probe'] as const
export type DeveloperDiscoveryBotClass = (typeof DeveloperDiscoveryBotClassValues)[number]

export type DeveloperDiscoveryCanonicalFunnelEvent = Extract<
  FunnelEventType,
  'developer_docs_viewed' | 'schema_downloaded' | 'example_fixture_downloaded' | 'discovery_health_viewed'
>

export type DeveloperDiscoveryPublicCatalogFact = {
  slug: string
  name: string
  category: string
  suburb: string
  stateTerritory: string
  publicUrl: string
  schemaVersion: PublicBusinessCatalogApiDto['schemaVersion']
  indexStatus: PublicCatalogContract['indexStatus']
  discoveryStatus: PublicCatalogContract['discoveryStatus']
  updatedAt: number
  serviceCount: number
  capabilityStatuses: readonly PublicCatalogContract['services'][number]['capabilities'][number]['status'][]
  firstRequestModes: readonly PublicCatalogContract['services'][number]['firstRequest']['mode'][]
}

export const DeveloperDiscoveryRouteHealthErrorCodeValues = [
  'not_found',
  'route_outage',
  'stale',
  'schema_version_mismatch',
  'unavailable',
  'withheld',
] as const
export type DeveloperDiscoveryRouteHealthErrorCode = (typeof DeveloperDiscoveryRouteHealthErrorCodeValues)[number]

export type DeveloperDiscoveryRouteHealth = {
  route: string
  label: string
  status: DiscoveryStatus
  freshness: DeveloperDiscoveryFreshness
  reason: string
  httpStatus?: number
  checkedAt: number
  cacheControl?: string
  schemaVersion?: string
  errorCode?: DeveloperDiscoveryRouteHealthErrorCode
}

export type DeveloperDiscoveryRouteExecution = {
  route: string
  label: string
  ok: boolean
  checkedAt: number
  httpStatus?: number
  cacheControl?: string
  schemaVersion?: string
  expectedSchemaVersion?: string
  stale?: boolean
  errorCode?: DeveloperDiscoveryRouteHealthErrorCode
  reason?: string
}

export type DeveloperDiscoveryRouteSnapshotResponse<Body> = DeveloperDiscoveryRouteExecution & {
  body?: Body
}

export type DeveloperDiscoveryRouteSnapshot = {
  list: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogApiPage>
  search: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogApiPage>
  detail?: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogDetailResult>
  missingDetail?: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogDetailResult>
  routeExecutions: readonly DeveloperDiscoveryRouteExecution[]
}

export type DeveloperDiscoveryArtifactMetadata = {
  kind: DeveloperDiscoveryArtifactKind
  label: string
  downloadLabel: string
  route: string
  state: DeveloperDiscoveryArtifactState
  freshness: DeveloperDiscoveryFreshness
  reason: string
  schemaFields: readonly string[]
}

export type DeveloperDiscoveryUnsupportedCapability = {
  label: string
  state: DeveloperDiscoveryUnsupportedState
  reason: string
}

export type DeveloperDiscoveryFreshnessReadback = {
  state: DeveloperDiscoveryFreshness
  label: string
  reason: string
}

export type DeveloperDiscoveryArtifactParityStatus = 'matched' | 'withheld'

export type DeveloperDiscoveryArtifactBase = {
  kind: DeveloperDiscoveryArtifactKind
  schemaVersion: DeveloperDiscoverySchemaVersion
  cacheVersion: string
  generatedAt: number
  sourceRoute: string
  state: DeveloperDiscoveryArtifactState
  freshness: DeveloperDiscoveryFreshnessReadback
  parityStatus: DeveloperDiscoveryArtifactParityStatus
  parityReason: string
  nonAuthority: true
  unsupported: {
    mutation: false
    payment: false
    protectedAction: false
    providerOperation: false
    requestMarket: false
  }
}

export type DeveloperDiscoverySchemaField = {
  path: string
  required: boolean
  nullable: boolean
  values?: readonly string[]
}

export type DeveloperDiscoverySchemaArtifact = DeveloperDiscoveryArtifactBase & {
  kind: 'public_catalog_schema'
  fields: readonly DeveloperDiscoverySchemaField[]
  statusVariants: {
    publicStatus: readonly PublicCatalogContract['publicStatus'][]
    indexStatus: readonly PublicCatalogContract['indexStatus'][]
    discoveryStatus: readonly PublicCatalogContract['discoveryStatus'][]
    firstRequestMode: readonly PublicCatalogContract['services'][number]['firstRequest']['mode'][]
    capabilityStatus: readonly PublicCatalogContract['services'][number]['capabilities'][number]['status'][]
  }
  pagination: {
    listRoutes: readonly string[]
    cursorSupported: true
    limitSupported: true
  }
  p2InquiryAvailability: P2InquiryAvailabilityPublicStatus
}

export type DeveloperDiscoveryExamplesArtifact = DeveloperDiscoveryArtifactBase & {
  kind: 'public_catalog_examples'
  examples: readonly PublicBusinessCatalogApiDto[]
  emptyExample: {
    kind: 'ok'
    items: []
    pagination: {
      total: 0
      hasMore: false
    }
  }
}

export type DeveloperDiscoveryFixtureBundleArtifact = DeveloperDiscoveryArtifactBase & {
  kind: 'public_catalog_fixture_bundle'
  schema: DeveloperDiscoverySchemaArtifact
  examples: readonly PublicBusinessCatalogApiDto[]
  supportMatrix: readonly DiscoverySupportMatrixRow[]
  gatedExclusions: readonly DiscoveryGatedExclusion[]
  routeHealth: readonly DeveloperDiscoveryRouteHealth[]
  p2InquiryAvailability: P2InquiryAvailabilityPublicStatus
  unsupportedCapabilities: readonly DeveloperDiscoveryUnsupportedCapability[]
}

export type DeveloperDiscoveryArtifact =
  | DeveloperDiscoverySchemaArtifact
  | DeveloperDiscoveryExamplesArtifact
  | DeveloperDiscoveryFixtureBundleArtifact

export type DeveloperDiscoveryFetchEvent = {
  route: string
  status: DeveloperDiscoveryFetchStatus
  schemaVersion: DeveloperDiscoverySchemaVersion
  cacheVersion: string
  freshness: DeveloperDiscoveryFreshness
  errorCode?: string
  botClass: DeveloperDiscoveryBotClass
  publicBusinessId?: string
  publicServiceId?: string
  correlationId: string
  timestamp: number
}

export type DeveloperDiscoveryFetchReadback = {
  telemetry: DeveloperDiscoveryFetchEvent
  requiredFunnelEvent: DeveloperDiscoveryCanonicalFunnelEvent
  operatorState: 'shipped' | 'degraded' | 'unavailable' | 'withheld'
}

export type DeveloperDiscoverySupportChannel =
  | 'developer_docs'
  | 'schema_examples'
  | 'route_health'
  | 'privacy_response'
  | 'bot_abuse_response'
  | 'api_key_support'

export type DeveloperDiscoveryKillRule = {
  channel: DeveloperDiscoverySupportChannel | 'public_claim'
  trigger: string
  action: string
}

export type DeveloperDiscoveryCapabilityLaunchSupportRecord = {
  capability: 'developer_discovery'
  primaryOwnerRef: string
  primaryAdminOperatorRef: string
  backupOwnerRef: string
  backupAdminOperatorRef: string
  supportedStage: 'manual_support' | 'internal_alpha' | 'public_alpha'
  supportedChannels: readonly DeveloperDiscoverySupportChannel[]
  capacityThreshold: {
    maxRouteParityFailures: number
    maxPrivateDataIncidents: number
    maxBotAbuseIncidents: number
  }
  backlogAgeThresholdMs: number
  phaseIncidentCounts: {
    staleArtifacts: number
    routeParityFailures: number
    privateDataExposure: number
    botAbuse: number
    apiKeyRevokeRotate: number
  }
  supportEscalationPath: string
  claimDisablePath: string
  perChannelKillRules: readonly DeveloperDiscoveryKillRule[]
  evidenceRefs: readonly string[]
  sourceHash: SourceHash
  correlationId: string
  lastReviewedAt: number
}

export type DeveloperDiscoveryLaunchSupportReadiness = {
  launchReady: boolean
  status:
    | 'ready'
    | 'missing_support_record'
    | 'missing_required_channel'
    | 'missing_evidence'
    | 'incident_threshold_exceeded'
  reason: string
  requiredFunnelEvent: DeveloperDiscoveryCanonicalFunnelEvent
}

export type DeveloperDiscoveryPublicationControls = {
  developerDiscoveryPublishEnabled: boolean
  discoveryApiKeysEnabled: boolean
}

export type ReadDeveloperDiscoveryRouteOptions = {
  canonicalBaseUrl?: string
  now?: number
  routeSnapshot?: DeveloperDiscoveryRouteSnapshot
  p2InquiryAvailability?: Partial<P2InquiryAvailabilityPublicStatus>
  projectionGates?: readonly DiscoveryProjectionGateInput[]
  operatorControls?: readonly Pick<OperatorControlReadback, 'key' | 'effectiveEnabled'>[]
  supportRecord?: DeveloperDiscoveryCapabilityLaunchSupportRecord
}

export type DeveloperDiscoveryRouteReadback = {
  schemaVersion: DeveloperDiscoverySchemaVersion
  generatedAt: number
  canonicalBaseUrl: string
  catalogCount: number
  p2InquiryAvailability: P2InquiryAvailabilityPublicStatus
  publicationControls: DeveloperDiscoveryPublicationControls
  supportReadiness: DeveloperDiscoveryLaunchSupportReadiness
  freshness: DeveloperDiscoveryFreshnessReadback
  supportMatrix: readonly DiscoverySupportMatrixRow[]
  gatedExclusions: readonly DiscoveryGatedExclusion[]
  publicFacts: readonly DeveloperDiscoveryPublicCatalogFact[]
  routeHealth: readonly DeveloperDiscoveryRouteHealth[]
  artifacts: readonly DeveloperDiscoveryArtifactMetadata[]
  unsupportedCapabilities: readonly DeveloperDiscoveryUnsupportedCapability[]
  copy: {
    eyebrow: string
    title: string
    description: string
    readOnlyNotice: string
  }
}

const developerDiscoverySchemaFields = [
  'slug',
  'name',
  'category',
  'suburb',
  'stateTerritory',
  'publicUrl',
  'trustTier',
  'publicStatus',
  'indexStatus',
  'discoveryStatus',
  'schemaVersion',
  'updatedAt',
  'services[].slug',
  'services.name',
  'services.category',
  'services.summary',
  'services.serviceArea',
  'services.hoursOrUnknown',
  'services.firstRequest.mode',
  'services.firstRequest.publicDisclosure',
  'services.firstRequest.publicChannel',
  'services.firstRequest.noContactReason',
  'services.status',
  'services.capabilities.kind',
  'services.capabilities.status',
] as const

const developerDiscoveryRoutes = [
  { path: '/api/businesses', label: 'Public catalog list JSON' },
  { path: '/api/businesses/search?q=', label: 'Public catalog search JSON' },
  { path: '/api/businesses/{slug}', label: 'Public catalog detail JSON' },
  { path: '/{slug}/ucp', label: 'AE-hosted UCP fallback' },
  { path: '/llms.txt', label: 'LLMs text discovery file' },
  { path: '/sitemap.xml', label: 'Sitemap discovery file' },
  { path: '/robots.txt', label: 'Robots discovery file' },
] as const

const developerDiscoveryArtifacts = [
  {
    kind: 'public_catalog_schema',
    label: 'Public catalog schema',
    downloadLabel: 'Download schema JSON',
    route: '/api/discovery/schema',
  },
  {
    kind: 'public_catalog_examples',
    label: 'Public catalog examples',
    downloadLabel: 'Download examples JSON',
    route: '/api/discovery/examples',
  },
  {
    kind: 'public_catalog_fixture_bundle',
    label: 'Public catalog fixture bundle',
    downloadLabel: 'Download fixture bundle',
    route: '/api/discovery/fixtures',
  },
] as const

const developerDiscoveryUnsupportedCapabilities = [
  {
    label: 'Business-origin discovery file',
    state: 'unavailable',
    reason: 'Only the AE-hosted fallback has source-owned readback; merchant-origin serving is not proven.',
  },
  {
    label: 'Credentialed developer access',
    state: 'unavailable',
    reason: 'Public reads need no credentials, and no quota or private-readback need is source-owned.',
  },
  {
    label: 'Integration packages',
    state: 'deferred',
    reason: 'The listed public routes and artifacts are enough for this read-only slice.',
  },
  {
    label: 'Protocol projection exports',
    state: 'deferred',
    reason: 'Separate projection artifacts stay withheld until parity evidence exists.',
  },
  {
    label: 'Commercial or owner-action authority',
    state: 'unavailable',
    reason: 'This discovery surface grants no mutation, booking, commercial, or owner-action authority.',
  },
] as const satisfies readonly DeveloperDiscoveryUnsupportedCapability[]

const developerDiscoveryCacheVersion = 'public-catalog-readonly-cache:v1' as const

const developerDiscoverySchemaFieldDefinitions: readonly DeveloperDiscoverySchemaField[] = [
  { path: 'slug', required: true, nullable: false },
  { path: 'name', required: true, nullable: false },
  { path: 'category', required: true, nullable: false },
  { path: 'suburb', required: true, nullable: false },
  { path: 'stateTerritory', required: true, nullable: false },
  { path: 'postcode', required: false, nullable: false },
  { path: 'publicUrl', required: true, nullable: false },
  { path: 'publicStatus', required: true, nullable: false, values: ['published'] },
  { path: 'trustTier', required: true, nullable: false, values: ['claimed', 'contact_confirmed', 'listed', 'registry_verified'] },
  { path: 'indexStatus', required: true, nullable: false, values: ['not_queued', 'queued', 'indexed', 'failed', 'stale'] },
  { path: 'discoveryStatus', required: true, nullable: false, values: DiscoveryStatusValues },
  { path: 'schemaVersion', required: true, nullable: false, values: ['public-business-catalog-api:v1'] },
  { path: 'updatedAt', required: true, nullable: false },
  { path: 'services[].slug', required: true, nullable: false },
  { path: 'services[].name', required: true, nullable: false },
  { path: 'services[].category', required: true, nullable: false },
  { path: 'services[].summary', required: true, nullable: false },
  { path: 'services[].serviceArea', required: true, nullable: false },
  { path: 'services[].hoursOrUnknown', required: true, nullable: false },
  { path: 'services[].firstRequest.mode', required: true, nullable: false, values: ['inquiry_available', 'quote_request_available', 'not_available_yet'] },
  {
    path: 'services[].firstRequest.publicChannel',
    required: true,
    nullable: false,
    values: ['public_business_contact', 'ae_status_only', 'not_available'],
  },
  { path: 'services[].firstRequest.publicDisclosure', required: true, nullable: false },
  { path: 'services[].firstRequest.noContactReason', required: false, nullable: false },
  { path: 'services[].status', required: true, nullable: false, values: ['published'] },
  { path: 'services[].capabilities[].kind', required: true, nullable: false, values: ['phone_inquiry', 'quote_request', 'emergency_callout_interest', 'ae_hosted_discovery'] },
  { path: 'services[].capabilities[].status', required: true, nullable: false, values: DiscoveryStatusValues },
]

export function readP2InquiryAvailabilityPublicStatus(
  status: Partial<P2InquiryAvailabilityPublicStatus> = {}
): P2InquiryAvailabilityPublicStatus {
  return {
    state: isP2InquiryAvailabilityPublicState(status.state) ? status.state : 'unavailable',
    publicReason:
      normalizePublicReason(status.publicReason) ??
      'Human inquiry is still in Phase 2 verification, so Phase 3 treats it as unavailable public status.',
    source: normalizePublicReason(status.source) ?? 'phase2-public-status-contract',
    lastVerifiedAt: typeof status.lastVerifiedAt === 'number' && Number.isFinite(status.lastVerifiedAt) ? status.lastVerifiedAt : 0,
  }
}

export function createDeveloperDiscoverySupportRecord(
  overrides: Partial<DeveloperDiscoveryCapabilityLaunchSupportRecord> = {}
): DeveloperDiscoveryCapabilityLaunchSupportRecord {
  return {
    capability: 'developer_discovery',
    primaryOwnerRef: 'owner:developer-discovery',
    primaryAdminOperatorRef: 'admin:developer-discovery-primary',
    backupOwnerRef: 'owner:developer-discovery-backup',
    backupAdminOperatorRef: 'admin:developer-discovery-backup',
    supportedStage: 'manual_support',
    supportedChannels: ['developer_docs', 'schema_examples', 'route_health', 'privacy_response', 'bot_abuse_response'],
    capacityThreshold: {
      maxRouteParityFailures: 0,
      maxPrivateDataIncidents: 0,
      maxBotAbuseIncidents: 5,
    },
    backlogAgeThresholdMs: 24 * 60 * 60 * 1_000,
    phaseIncidentCounts: {
      staleArtifacts: 0,
      routeParityFailures: 0,
      privateDataExposure: 0,
      botAbuse: 0,
      apiKeyRevokeRotate: 0,
    },
    supportEscalationPath: 'Phase 3 developer discovery support queue.',
    claimDisablePath: 'Set developer_discovery_publish_enabled=false to withhold public artifacts while preserving readback.',
    perChannelKillRules: [
      {
        channel: 'public_claim',
        trigger: 'Schema parity fails, route health is stale, or private data exposure is suspected.',
        action: 'Disable developer_discovery_publish_enabled and mark artifacts withheld.',
      },
      {
        channel: 'schema_examples',
        trigger: 'Generated schema, examples, or fixtures drift from public catalog DTO parity.',
        action: 'Withhold schema/examples/fixtures until route parity is repaired.',
      },
      {
        channel: 'bot_abuse_response',
        trigger: 'Bot fetches exceed support capacity or abuse thresholds.',
        action: 'Throttle or degrade artifact fetch claims while retaining public readback.',
      },
      {
        channel: 'api_key_support',
        trigger: 'Read-only key revoke or rotate is required after a future accepted key gate.',
        action: 'Disable discovery_api_keys_enabled without blocking base public docs/schema/examples.',
      },
    ],
    evidenceRefs: ['support:developer-discovery:manual'],
    sourceHash: 'hash:developer-discovery-support' as SourceHash,
    correlationId: 'corr:developer-discovery-support',
    lastReviewedAt: 0,
    ...overrides,
  }
}

export function evaluateDeveloperDiscoveryLaunchSupport(input: {
  supportRecord?: DeveloperDiscoveryCapabilityLaunchSupportRecord
  requiredFunnelEvent: DeveloperDiscoveryCanonicalFunnelEvent
}): DeveloperDiscoveryLaunchSupportReadiness {
  const record = input.supportRecord
  if (record === undefined) {
    return {
      launchReady: false,
      status: 'missing_support_record',
      reason: 'A source-owned developer discovery support record is required before launch-ready evidence claims.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  const requiredChannels: readonly DeveloperDiscoverySupportChannel[] = ['developer_docs', 'schema_examples', 'route_health']
  if (!requiredChannels.every((channel) => record.supportedChannels.includes(channel))) {
    return {
      launchReady: false,
      status: 'missing_required_channel',
      reason: 'Developer docs, schema/examples, and route-health support channels must all be named.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  if (record.evidenceRefs.length === 0) {
    return {
      launchReady: false,
      status: 'missing_evidence',
      reason: 'Support readiness requires at least one non-secret evidence reference.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  if (
    record.phaseIncidentCounts.routeParityFailures > record.capacityThreshold.maxRouteParityFailures ||
    record.phaseIncidentCounts.privateDataExposure > record.capacityThreshold.maxPrivateDataIncidents ||
    record.phaseIncidentCounts.botAbuse > record.capacityThreshold.maxBotAbuseIncidents
  ) {
    return {
      launchReady: false,
      status: 'incident_threshold_exceeded',
      reason: 'Discovery support incident thresholds are exceeded; public claims must stay unavailable.',
      requiredFunnelEvent: input.requiredFunnelEvent,
    }
  }

  return {
    launchReady: true,
    status: 'ready',
    reason: 'Support owner, kill rules, evidence, and route-health handling are source-owned.',
    requiredFunnelEvent: input.requiredFunnelEvent,
  }
}

export function readDeveloperDiscoveryPublicationControls(
  controls: readonly Pick<OperatorControlReadback, 'key' | 'effectiveEnabled'>[] = []
): DeveloperDiscoveryPublicationControls {
  return {
    developerDiscoveryPublishEnabled: controlEnabled(controls, 'developer_discovery_publish_enabled'),
    discoveryApiKeysEnabled: false,
  }
}

export function evaluateDiscoveryProjectionGate(input: DiscoveryProjectionGateInput): DiscoveryProjectionGateResult {
  if (!input.routeParity) {
    return { kind: 'withheld', surface: input.surface, reason: 'Route parity evidence is missing.' }
  }
  if (!input.descriptorScanClean) {
    return { kind: 'withheld', surface: input.surface, reason: 'Descriptor scan has not proven read-only non-authority output.' }
  }
  if (input.evidence.length === 0) {
    return { kind: 'withheld', surface: input.surface, reason: 'Source-owned projection evidence is missing.' }
  }
  return { kind: 'accepted', surface: input.surface, evidence: input.evidence }
}

export function readDeveloperDiscoverySupportMatrix(input: {
  freshness: DeveloperDiscoveryFreshnessReadback
  projectionGates?: readonly DiscoveryProjectionGateInput[]
}): readonly DiscoverySupportMatrixRow[] {
  const baseState = supportStateFromFreshness(input.freshness)
  const baseReadbackStatus = discoveryStatusFromSupportState(baseState)
  const rows: DiscoverySupportMatrixRow[] = [
    supportRow('public_json_routes', 'Public JSON routes', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('ae_hosted_ucp_fallback', 'AE-hosted UCP fallback', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('llms_txt', 'LLMs text discovery', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('sitemap', 'Sitemap', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('robots', 'Robots policy', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('schema_examples', 'Schema and examples', baseState, baseReadbackStatus, input.freshness.reason),
    supportRow('route_health', 'Route health readback', baseState, baseReadbackStatus, input.freshness.reason),
  ]

  for (const gate of input.projectionGates ?? []) {
    const result = evaluateDiscoveryProjectionGate(gate)
    if (result.kind === 'accepted') {
      rows.push(
        supportRow(
          result.surface,
          result.surface === 'openapi_read_projection' ? 'OpenAPI read projection' : 'MCP read projection',
          baseState,
          baseReadbackStatus,
          input.freshness.reason,
          result.evidence
        )
      )
    }
  }

  return rows
}

export function readDeveloperDiscoveryGatedExclusions(): readonly DiscoveryGatedExclusion[] {
  return [
    gatedExclusion('api_keys', 'API keys', 'unavailable', 'Public read-only discovery does not need credentialed access.'),
    gatedExclusion('sdk', 'SDK', 'deferred', 'Measured demand has not justified package support.'),
    gatedExclusion('cli', 'CLI', 'deferred', 'The current route and artifact readbacks are enough for this slice.'),
    gatedExclusion('plugin', 'Plugin', 'deferred', 'No plugin channel has route-tested demand or support capacity.'),
    gatedExclusion('hosted_mcp_byo_proxy', 'Hosted MCP or BYO proxy', 'unavailable', 'Hosted tool transport is outside read-only discovery.'),
    gatedExclusion('agent_router', 'Agent Router', 'unavailable', 'Phase 3 does not fork catalog truth into a second router model.'),
    gatedExclusion('developer_gallery', 'Developer gallery', 'deferred', 'Gallery launch waits for measured builder demand.'),
    gatedExclusion('payment_descriptors', 'Payment descriptors', 'unavailable', 'Payment and commercial descriptors belong to a later paid-activation phase.'),
    gatedExclusion(
      'protected_action_descriptors',
      'Protected-action descriptors',
      'unavailable',
      'Owner-approved action descriptors are unavailable until protected-action evidence exists.'
    ),
  ]
}

export function mapDeveloperDiscoveryRouteExecutions(
  executions: readonly DeveloperDiscoveryRouteExecution[]
): readonly DeveloperDiscoveryRouteHealth[] {
  return executions.map((execution) => {
    const errorCode = routeExecutionErrorCode(execution)
    const status = routeStatusFromErrorCode(errorCode)
    const freshness = routeFreshnessFromStatus(status)
    const reason = normalizePublicReason(execution.reason) ?? routeExecutionReason(errorCode, execution)

    return {
      route: execution.route,
      label: execution.label,
      status,
      freshness,
      reason,
      ...(execution.httpStatus === undefined ? {} : { httpStatus: execution.httpStatus }),
      checkedAt: execution.checkedAt,
      ...(execution.cacheControl === undefined ? {} : { cacheControl: execution.cacheControl }),
      ...(execution.schemaVersion === undefined ? {} : { schemaVersion: execution.schemaVersion }),
      ...(errorCode === undefined ? {} : { errorCode }),
    }
  })
}

export function readDeveloperDiscoveryRoute(
  state: DiscoverySourceState = createDefaultDiscoverySourceStateImpl(),
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoveryRouteReadback {
  const canonicalBaseUrl = trimTrailingSlash(options.canonicalBaseUrl ?? 'https://ae.example')
  const publicationControls = readDeveloperDiscoveryPublicationControls(options.operatorControls)
  const routeHealth =
    options.routeSnapshot === undefined
      ? fallbackDeveloperDiscoveryRouteHealth(canonicalBaseUrl, options.now ?? 0, readDeveloperDiscoveryFreshnessFromFacts(readDeveloperDiscoveryCatalogFacts(state)))
      : mapDeveloperDiscoveryRouteExecutions(options.routeSnapshot.routeExecutions)
  const publicFacts =
    options.routeSnapshot === undefined
      ? readDeveloperDiscoveryCatalogFacts(state)
      : readDeveloperDiscoveryCatalogFactsFromSnapshot(options.routeSnapshot)
  const sourceFreshness =
    options.routeSnapshot === undefined
      ? readDeveloperDiscoveryFreshnessFromFacts(publicFacts)
      : readDeveloperDiscoveryFreshnessFromRouteReadback(publicFacts, routeHealth)
  const freshness = publicationControls.developerDiscoveryPublishEnabled
    ? sourceFreshness
    : {
        state: 'unavailable' as const,
        label: 'Publication disabled',
        reason:
          'developer_discovery_publish_enabled is disabled, so public artifacts are withheld while operator readback remains visible.',
      }
  const p2InquiryAvailability = readP2InquiryAvailabilityPublicStatus(options.p2InquiryAvailability)
  const supportReadiness = evaluateDeveloperDiscoveryLaunchSupport({
    requiredFunnelEvent: 'developer_docs_viewed',
    ...(options.supportRecord === undefined ? {} : { supportRecord: options.supportRecord }),
  })

  return {
    schemaVersion: DeveloperDiscoverySchemaVersion,
    generatedAt: options.now ?? 0,
    canonicalBaseUrl,
    catalogCount: publicFacts.length,
    p2InquiryAvailability,
    publicationControls,
    supportReadiness,
    freshness,
    supportMatrix: readDeveloperDiscoverySupportMatrix({
      freshness,
      ...(options.projectionGates === undefined ? {} : { projectionGates: options.projectionGates }),
    }),
    gatedExclusions: readDeveloperDiscoveryGatedExclusions(),
    publicFacts,
    routeHealth,
    artifacts: developerDiscoveryArtifacts.map((artifact) => ({
      kind: artifact.kind,
      label: artifact.label,
      downloadLabel: artifact.downloadLabel,
      route: artifact.route,
      state: freshness.state === 'current' ? 'available' : freshness.state,
      freshness: freshness.state,
      reason: freshness.reason,
      schemaFields: developerDiscoverySchemaFields,
    })),
    unsupportedCapabilities: developerDiscoveryUnsupportedCapabilities,
    copy: {
      eyebrow: 'Builder readbacks',
      title: 'Read-only public catalog files',
      description: 'Source-owned catalog facts, schema shape, examples, freshness, and unavailable capability reasons for builders.',
      readOnlyNotice:
        'Read-only public facts. This page does not grant mutation, booking, commercial, or owner-action authority.',
    },
  }
}

export function readDeveloperDiscoveryFreshness(
  state: DiscoverySourceState = createDefaultDiscoverySourceStateImpl()
): DeveloperDiscoveryFreshnessReadback {
  return readDeveloperDiscoveryFreshnessFromFacts(readDeveloperDiscoveryCatalogFacts(state))
}

export function readDeveloperDiscoveryRouteHealth(
  state: DiscoverySourceState = createDefaultDiscoverySourceStateImpl(),
  options: ReadDeveloperDiscoveryRouteOptions = {}
): readonly DeveloperDiscoveryRouteHealth[] {
  return readDeveloperDiscoveryRoute(state, options).routeHealth
}

export function generateDeveloperDiscoverySchema(
  state: DiscoverySourceState = createDefaultDiscoverySourceStateImpl(),
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoverySchemaArtifact {
  const readback = readDeveloperDiscoveryRoute(state, options)
  const base = artifactBase('public_catalog_schema', readback, '/api/discovery/schema')
  const artifact: DeveloperDiscoverySchemaArtifact = {
    ...base,
    fields: developerDiscoverySchemaFieldDefinitions,
    statusVariants: {
      publicStatus: ['published'],
      indexStatus: ['not_queued', 'queued', 'indexed', 'failed', 'stale'],
      discoveryStatus: DiscoveryStatusValues,
      firstRequestMode: ['inquiry_available', 'quote_request_available', 'not_available_yet'],
      capabilityStatus: DiscoveryStatusValues,
    },
    pagination: {
      listRoutes: ['/api/businesses', '/api/businesses/search'],
      cursorSupported: true,
      limitSupported: true,
    },
    p2InquiryAvailability: readback.p2InquiryAvailability,
  }

  return readback.publicationControls.developerDiscoveryPublishEnabled
    ? artifact
    : withholdDeveloperDiscoveryArtifact(artifact, readback.freshness.reason)
}

export function generateDeveloperDiscoveryExamples(
  state: DiscoverySourceState = createDefaultDiscoverySourceStateImpl(),
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoveryExamplesArtifact {
  const readback = readDeveloperDiscoveryRoute(state, options)
  const base = artifactBase('public_catalog_examples', readback, '/api/discovery/examples')
  const artifact: DeveloperDiscoveryExamplesArtifact = {
    ...base,
    examples:
      base.state !== 'unavailable'
        ? options.routeSnapshot === undefined
          ? readDeveloperDiscoveryPublicRouteCatalogs(state)
          : readDeveloperDiscoveryPublicRouteCatalogsFromSnapshot(options.routeSnapshot)
        : [],
    emptyExample: {
      kind: 'ok',
      items: [],
      pagination: {
        total: 0,
        hasMore: false,
      },
    },
  }

  return readback.publicationControls.developerDiscoveryPublishEnabled
    ? artifact
    : withholdDeveloperDiscoveryArtifact(artifact, readback.freshness.reason)
}

export function generateDeveloperDiscoveryFixtureBundle(
  state: DiscoverySourceState = createDefaultDiscoverySourceStateImpl(),
  options: ReadDeveloperDiscoveryRouteOptions = {}
): DeveloperDiscoveryFixtureBundleArtifact {
  const readback = readDeveloperDiscoveryRoute(state, options)
  const base = artifactBase('public_catalog_fixture_bundle', readback, '/api/discovery/fixtures')
  const schema = generateDeveloperDiscoverySchema(state, options)
  const examplesArtifact = generateDeveloperDiscoveryExamples(state, options)
  const artifact: DeveloperDiscoveryFixtureBundleArtifact = {
    ...base,
    schema,
    examples: examplesArtifact.examples,
    supportMatrix: readback.supportMatrix,
    gatedExclusions: readback.gatedExclusions,
    routeHealth: readback.routeHealth,
    p2InquiryAvailability: readback.p2InquiryAvailability,
    unsupportedCapabilities: readback.unsupportedCapabilities,
  }

  return readback.publicationControls.developerDiscoveryPublishEnabled
    ? artifact
    : withholdDeveloperDiscoveryArtifact(artifact, readback.freshness.reason)
}

export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoverySchemaArtifact,
  reason: string
): DeveloperDiscoverySchemaArtifact
export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoveryExamplesArtifact,
  reason: string
): DeveloperDiscoveryExamplesArtifact
export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoveryFixtureBundleArtifact,
  reason: string
): DeveloperDiscoveryFixtureBundleArtifact
export function withholdDeveloperDiscoveryArtifact(
  artifact: DeveloperDiscoveryArtifact,
  reason: string
): DeveloperDiscoveryArtifact {
  const freshness: DeveloperDiscoveryFreshnessReadback = {
    state: 'unavailable',
    label: 'Artifact withheld',
    reason: normalizePublicReason(reason) ?? 'Artifact withheld by source-owned parity gate.',
  }
  const sharedBase = {
    state: 'unavailable' as const,
    freshness,
    parityStatus: 'withheld' as const,
    parityReason: freshness.reason,
  }

  switch (artifact.kind) {
    case 'public_catalog_schema':
      return {
        ...artifact,
        ...sharedBase,
        fields: [],
        statusVariants: artifact.statusVariants,
        pagination: artifact.pagination,
        p2InquiryAvailability: artifact.p2InquiryAvailability,
      }
    case 'public_catalog_examples':
      return { ...artifact, ...sharedBase, examples: [], emptyExample: artifact.emptyExample }
    case 'public_catalog_fixture_bundle':
      return {
        ...artifact,
        ...sharedBase,
        schema: withholdDeveloperDiscoveryArtifact(artifact.schema, freshness.reason),
        examples: [],
        supportMatrix: artifact.supportMatrix,
        gatedExclusions: artifact.gatedExclusions,
        routeHealth: artifact.routeHealth,
        p2InquiryAvailability: artifact.p2InquiryAvailability,
        unsupportedCapabilities: artifact.unsupportedCapabilities,
      }
  }
}

export function recordDeveloperDiscoveryFetch(input: {
  kind: DeveloperDiscoveryFetchKind
  route: string
  status: DeveloperDiscoveryFetchStatus
  schemaVersion?: DeveloperDiscoverySchemaVersion
  cacheVersion?: string
  freshness: DeveloperDiscoveryFreshness
  errorCode?: string
  botClass?: DeveloperDiscoveryBotClass
  publicBusinessId?: string
  publicServiceId?: string
  correlationId?: string
  timestamp: number
}): DeveloperDiscoveryFetchReadback {
  const telemetry: DeveloperDiscoveryFetchEvent = {
    route: normalizePublicReason(input.route) ?? '/developers/discovery',
    status: input.status,
    schemaVersion: input.schemaVersion ?? DeveloperDiscoverySchemaVersion,
    cacheVersion: input.cacheVersion ?? developerDiscoveryCacheVersion,
    freshness: input.freshness,
    ...(input.errorCode === undefined ? {} : { errorCode: normalizePublicReason(input.errorCode) ?? 'redacted_error' }),
    botClass: input.botClass ?? 'human',
    ...(input.publicBusinessId === undefined ? {} : { publicBusinessId: normalizePublicReason(input.publicBusinessId) ?? 'redacted' }),
    ...(input.publicServiceId === undefined ? {} : { publicServiceId: normalizePublicReason(input.publicServiceId) ?? 'redacted' }),
    correlationId: normalizePublicReason(input.correlationId) ?? `corr:developer-discovery:${input.kind}:${input.status}`,
    timestamp: input.timestamp,
  }
  const operatorState = fetchOperatorState(input.status)

  return {
    telemetry,
    requiredFunnelEvent: funnelEventForFetchKind(input.kind),
    operatorState,
  }
}

export function renderDeveloperDiscoveryRouteCopy(readback: DeveloperDiscoveryRouteReadback): string {
  return [
    readback.copy.eyebrow,
    readback.copy.title,
    readback.copy.description,
    readback.copy.readOnlyNotice,
    readback.freshness.label,
    readback.freshness.reason,
    `Developer discovery support: ${readback.supportReadiness.status}; ${readback.supportReadiness.reason}`,
    `Discovery publication gate: ${
      readback.publicationControls.developerDiscoveryPublishEnabled ? 'enabled' : 'unavailable'
    }`,
    `Discovery API key gate: ${readback.publicationControls.discoveryApiKeysEnabled ? 'enabled' : 'unavailable'}`,
    `Phase 2 inquiry public status: ${readback.p2InquiryAvailability.state}; ${readback.p2InquiryAvailability.publicReason}`,
    ...readback.supportMatrix.map(
      (row) => `${row.label}: ${row.state}; route=${row.routeReadbackStatus}; blocker=${row.blocker}; next=${row.nextAction}`
    ),
    ...readback.gatedExclusions.map(
      (exclusion) => `${exclusion.label}: ${exclusion.state}; ${exclusion.reason}; next=${exclusion.nextAction}`
    ),
    ...readback.publicFacts.map(
      (fact) =>
        `${fact.name} (${fact.slug}) — ${fact.category} in ${fact.suburb}, ${fact.stateTerritory}; discovery=${fact.discoveryStatus}; services=${fact.serviceCount}`
    ),
    ...readback.artifacts.map(
      (artifact) =>
        `${artifact.label}: ${artifact.state}; ${artifact.downloadLabel}; freshness=${artifact.freshness}; ${artifact.reason}`
    ),
    ...readback.routeHealth.map(
      (health) => `${health.label}: ${health.status}; freshness=${health.freshness}; ${health.reason}`
    ),
    ...readback.unsupportedCapabilities.map(
      (capability) => `${capability.label}: ${capability.state}; ${capability.reason}`
    ),
  ].join('\n')
}

function supportRow(
  surface: DiscoverySupportSurface,
  label: string,
  state: DiscoverySupportState,
  routeReadbackStatus: DiscoveryStatus,
  reason: string,
  evidence: readonly string[] = ['public-catalog-dto', 'route-readback']
): DiscoverySupportMatrixRow {
  return {
    surface,
    label,
    state,
    evidence,
    owner: 'agentic-economy-discovery',
    routeReadbackStatus,
    blocker: state === 'shipped' ? 'none' : reason,
    nextAction: state === 'shipped' ? 'watch route health and parity drift' : 'repair source readback before public claims',
  }
}

function fallbackDeveloperDiscoveryRouteHealth(
  canonicalBaseUrl: string,
  checkedAt: number,
  freshness: DeveloperDiscoveryFreshnessReadback
): readonly DeveloperDiscoveryRouteHealth[] {
  const errorCode =
    freshness.state === 'current' ? undefined : freshness.state === 'degraded' ? ('stale' as const) : ('unavailable' as const)

  return mapDeveloperDiscoveryRouteExecutions(
    developerDiscoveryRoutes.map((route) => ({
      route: `${canonicalBaseUrl}${route.path}`,
      label: route.label,
      ok: freshness.state === 'current',
      checkedAt,
      ...(errorCode === undefined ? {} : { errorCode }),
      reason: freshness.reason,
    }))
  )
}

function routeExecutionErrorCode(
  execution: DeveloperDiscoveryRouteExecution
): DeveloperDiscoveryRouteHealthErrorCode | undefined {
  if (execution.errorCode !== undefined) {
    return execution.errorCode
  }

  if (
    execution.expectedSchemaVersion !== undefined &&
    execution.schemaVersion !== undefined &&
    execution.expectedSchemaVersion !== execution.schemaVersion
  ) {
    return 'schema_version_mismatch'
  }

  if (execution.stale === true) {
    return 'stale'
  }

  if (!execution.ok) {
    return execution.httpStatus === 404 ? 'not_found' : 'route_outage'
  }

  return undefined
}

function routeStatusFromErrorCode(errorCode: DeveloperDiscoveryRouteHealthErrorCode | undefined): DiscoveryStatus {
  switch (errorCode) {
    case undefined:
      return 'available'
    case 'stale':
      return 'stale'
    case 'schema_version_mismatch':
      return 'degraded'
    case 'not_found':
    case 'route_outage':
    case 'unavailable':
    case 'withheld':
      return 'unavailable'
  }
}

function routeFreshnessFromStatus(status: DiscoveryStatus): DeveloperDiscoveryFreshness {
  switch (status) {
    case 'available':
      return 'current'
    case 'degraded':
    case 'stale':
      return 'degraded'
    case 'unavailable':
      return 'unavailable'
  }
}

function routeExecutionReason(
  errorCode: DeveloperDiscoveryRouteHealthErrorCode | undefined,
  execution: DeveloperDiscoveryRouteExecution
): string {
  switch (errorCode) {
    case undefined:
      return 'Route returned current public readback.'
    case 'not_found':
      return 'Route returned not found for the selected public readback.'
    case 'route_outage':
      return 'Route handler could not be read back.'
    case 'stale':
      return 'Route readback is stale or degraded.'
    case 'schema_version_mismatch':
      return `Route schema version ${
        execution.schemaVersion ?? 'unknown'
      } did not match expected ${execution.expectedSchemaVersion ?? 'known public schema'}.`
    case 'unavailable':
      return 'Required public route input is unavailable.'
    case 'withheld':
      return 'Route output is withheld by source-owned parity gate.'
  }
}

function gatedExclusion(
  surface: DiscoveryGatedExclusionSurface,
  label: string,
  state: DiscoveryGatedExclusion['state'],
  reason: string
): DiscoveryGatedExclusion {
  return {
    surface,
    label,
    state,
    reason,
    nextAction: 'Require a separate source-owned decision and route-tested evidence before changing this state.',
  }
}

function supportStateFromFreshness(freshness: DeveloperDiscoveryFreshnessReadback): DiscoverySupportState {
  switch (freshness.state) {
    case 'current':
      return 'shipped'
    case 'degraded':
      return 'degraded'
    case 'unavailable':
      return 'unavailable'
  }
}

function discoveryStatusFromSupportState(state: DiscoverySupportState): DiscoveryStatus {
  switch (state) {
    case 'shipped':
      return 'available'
    case 'degraded':
      return 'degraded'
    case 'unavailable':
    case 'deferred':
    case 'withheld':
      return 'unavailable'
  }
}

function controlEnabled(
  controls: readonly Pick<OperatorControlReadback, 'key' | 'effectiveEnabled'>[],
  key: 'developer_discovery_publish_enabled' | 'discovery_api_keys_enabled'
): boolean {
  return controls.find((control) => control.key === key)?.effectiveEnabled ?? true
}

function isP2InquiryAvailabilityPublicState(value: unknown): value is P2InquiryAvailabilityPublicState {
  return typeof value === 'string' && P2InquiryAvailabilityPublicStateValues.includes(value as P2InquiryAvailabilityPublicState)
}

function normalizePublicReason(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const normalized = value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)
  return normalized.length === 0 ? undefined : normalized
}

function readDeveloperDiscoveryCatalogFacts(state: DiscoverySourceState): readonly DeveloperDiscoveryPublicCatalogFact[] {
  return state.businesses
    .map((business) => {
      const catalogHealth = readCatalogHealth(state, business.businessId)
      if (catalogHealth.sourceState !== 'published') {
        return undefined
      }

      const discoveryHealth = readDiscoveryHealthImpl(state, business.businessId)
      const result = getPublicBusinessCatalog(state, {
        slug: business.slug,
        indexStatus: catalogHealth.indexStatus,
        discoveryStatus: discoveryHealth.discoveryStatus,
      })

      return result.kind === 'available' ? toDeveloperDiscoveryFactFromApi(toPublicBusinessCatalogApiDto(result.catalog)) : undefined
    })
    .filter((catalog): catalog is DeveloperDiscoveryPublicCatalogFact => catalog !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function readDeveloperDiscoveryCatalogFactsFromSnapshot(
  snapshot: DeveloperDiscoveryRouteSnapshot
): readonly DeveloperDiscoveryPublicCatalogFact[] {
  return readDeveloperDiscoveryPublicRouteCatalogsFromSnapshot(snapshot)
    .map(toDeveloperDiscoveryFactFromApi)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function readDeveloperDiscoveryPublicRouteCatalogs(state: DiscoverySourceState): readonly PublicBusinessCatalogApiDto[] {
  return state.businesses
    .map((business) => {
      const catalogHealth = readCatalogHealth(state, business.businessId)
      if (catalogHealth.sourceState !== 'published') {
        return undefined
      }

      const discoveryHealth = readDiscoveryHealthImpl(state, business.businessId)
      const result = getPublicBusinessCatalog(state, {
        slug: business.slug,
        indexStatus: catalogHealth.indexStatus,
        discoveryStatus: discoveryHealth.discoveryStatus,
      })

      return result.kind === 'available' ? toPublicBusinessCatalogApiDto(result.catalog) : undefined
    })
    .filter((catalog): catalog is PublicBusinessCatalogApiDto => catalog !== undefined)
    .sort((left, right) => left.slug.localeCompare(right.slug))
}

function readDeveloperDiscoveryPublicRouteCatalogsFromSnapshot(
  snapshot: DeveloperDiscoveryRouteSnapshot
): readonly PublicBusinessCatalogApiDto[] {
  const bySlug = new Map<string, PublicBusinessCatalogApiDto>()
  const add = (catalog: PublicBusinessCatalogApiDto): void => {
    bySlug.set(catalog.slug, catalog)
  }

  if (snapshot.list.body?.kind === 'ok') {
    for (const catalog of snapshot.list.body.items) {
      add(catalog)
    }
  }

  if (snapshot.search.body?.kind === 'ok') {
    for (const catalog of snapshot.search.body.items) {
      add(catalog)
    }
  }

  if (snapshot.detail?.body?.kind === 'found') {
    add(snapshot.detail.body.business)
  }

  return Array.from(bySlug.values()).sort((left, right) => left.slug.localeCompare(right.slug))
}

function toDeveloperDiscoveryFactFromApi(catalog: PublicBusinessCatalogApiDto): DeveloperDiscoveryPublicCatalogFact {
  return {
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    suburb: catalog.suburb,
    stateTerritory: catalog.stateTerritory,
    publicUrl: catalog.publicUrl,
    schemaVersion: catalog.schemaVersion,
    indexStatus: catalog.indexStatus,
    discoveryStatus: catalog.discoveryStatus,
    updatedAt: catalog.updatedAt,
    serviceCount: catalog.services.length,
    capabilityStatuses: uniqueSorted(
      catalog.services.flatMap((service) => service.capabilities.map((capability) => capability.status))
    ),
    firstRequestModes: uniqueSorted(catalog.services.map((service) => service.firstRequest.mode)),
  }
}

function toPublicBusinessCatalogApiDto(catalog: PublicCatalogContract): PublicBusinessCatalogApiDto {
  return {
    slug: catalog.slug,
    name: catalog.name,
    category: catalog.category,
    suburb: catalog.suburb,
    stateTerritory: catalog.stateTerritory,
    ...(catalog.postcode === undefined ? {} : { postcode: catalog.postcode }),
    publicUrl: catalog.publicUrl,
    publicStatus: catalog.publicStatus,
    trustTier: catalog.trustTier,
    indexStatus: catalog.indexStatus,
    discoveryStatus: catalog.discoveryStatus,
    schemaVersion: 'public-business-catalog-api:v1',
    updatedAt: catalog.updatedAt,
    services: catalog.services.map((service) => ({
      slug: service.serviceSlug,
      name: service.name,
      category: service.category,
      summary: service.summary,
      serviceArea: service.serviceArea,
      hoursOrUnknown: service.hoursOrUnknown,
      firstRequest: service.firstRequest,
      status: service.status,
      capabilities: service.capabilities.map((capability) => ({
        kind: capability.kind,
        status: capability.status,
      })),
    })),
  }
}

function readDeveloperDiscoveryFreshnessFromFacts(
  publicFacts: readonly DeveloperDiscoveryPublicCatalogFact[]
): DeveloperDiscoveryFreshnessReadback {
  if (publicFacts.length === 0) {
    return {
      state: 'unavailable',
      label: 'Artifacts unavailable',
      reason: 'No source-owned public catalog facts are published.',
    }
  }

  if (publicFacts.every((fact) => fact.discoveryStatus === 'unavailable')) {
    return {
      state: 'unavailable',
      label: 'Discovery unavailable',
      reason: 'Every public catalog reports unavailable discovery status.',
    }
  }

  if (publicFacts.some((fact) => fact.discoveryStatus !== 'available')) {
    return {
      state: 'degraded',
      label: 'Discovery degraded',
      reason: 'At least one public catalog is missing a current discovery readback.',
    }
  }

  return {
    state: 'current',
    label: 'Discovery current',
    reason: 'Public catalog, read path status, schema, examples, and fixture labels match current source state.',
  }
}

function readDeveloperDiscoveryFreshnessFromRouteReadback(
  publicFacts: readonly DeveloperDiscoveryPublicCatalogFact[],
  routeHealth: readonly DeveloperDiscoveryRouteHealth[]
): DeveloperDiscoveryFreshnessReadback {
  if (publicFacts.length === 0) {
    const listHealth = routeHealth.find((health) => health.route.endsWith('/api/businesses'))
    return {
      state: 'unavailable',
      label: 'Artifacts unavailable',
      reason: listHealth?.reason ?? 'No route-derived public catalog facts are published.',
    }
  }

  const criticalFailingHealth = routeHealth.find(
    (health) => health.status !== 'available' && isDeveloperDiscoveryCriticalCatalogRoute(health.route)
  )
  if (criticalFailingHealth !== undefined) {
    return {
      state:
        criticalFailingHealth.status === 'stale' || criticalFailingHealth.status === 'degraded'
          ? 'degraded'
          : 'unavailable',
      label:
        criticalFailingHealth.status === 'stale' || criticalFailingHealth.status === 'degraded'
          ? 'Route readback degraded'
          : 'Route readback unavailable',
      reason: `${criticalFailingHealth.label}: ${criticalFailingHealth.reason}`,
    }
  }

  const nonCriticalFailingHealth = routeHealth.find((health) => health.status !== 'available')
  if (nonCriticalFailingHealth !== undefined) {
    return {
      state: 'degraded',
      label: 'Route readback degraded',
      reason: `${nonCriticalFailingHealth.label}: ${nonCriticalFailingHealth.reason}`,
    }
  }

  if (publicFacts.every((fact) => fact.discoveryStatus === 'unavailable')) {
    return {
      state: 'unavailable',
      label: 'Discovery unavailable',
      reason: 'Every route-derived public catalog reports unavailable discovery status.',
    }
  }

  if (publicFacts.some((fact) => fact.discoveryStatus !== 'available')) {
    return {
      state: 'degraded',
      label: 'Discovery degraded',
      reason: 'At least one route-derived public catalog is missing a current discovery readback.',
    }
  }

  return {
    state: 'current',
    label: 'Discovery current',
    reason: 'Public routes, schema versions, examples, and fixture labels match current route readback.',
  }
}

function isDeveloperDiscoveryCriticalCatalogRoute(route: string): boolean {
  let pathname = route
  try {
    pathname = new URL(route, 'https://ae.example').pathname
  } catch {
    pathname = route.split('?')[0] ?? route
  }

  return (
    pathname === '/api/businesses' ||
    pathname === '/api/businesses/search' ||
    (pathname.startsWith('/api/businesses/') && !pathname.includes('__missing_discovery_slug__'))
  )
}

function artifactBase<K extends DeveloperDiscoveryArtifactKind>(
  kind: K,
  readback: DeveloperDiscoveryRouteReadback,
  route: string
): DeveloperDiscoveryArtifactBase & { kind: K } {
  const state: DeveloperDiscoveryArtifactState = readback.freshness.state === 'current' ? 'available' : readback.freshness.state

  return {
    kind,
    schemaVersion: DeveloperDiscoverySchemaVersion,
    cacheVersion: developerDiscoveryCacheVersion,
    generatedAt: readback.generatedAt,
    sourceRoute: `${readback.canonicalBaseUrl}${route}`,
    state,
    freshness: readback.freshness,
    parityStatus: state === 'unavailable' ? 'withheld' : 'matched',
    parityReason: readback.freshness.reason,
    nonAuthority: true,
    unsupported: {
      mutation: false,
      payment: false,
      protectedAction: false,
      providerOperation: false,
      requestMarket: false,
    },
  }
}

function funnelEventForFetchKind(kind: DeveloperDiscoveryFetchKind): DeveloperDiscoveryCanonicalFunnelEvent {
  switch (kind) {
    case 'docs':
      return 'developer_docs_viewed'
    case 'schema':
      return 'schema_downloaded'
    case 'examples':
    case 'fixtures':
      return 'example_fixture_downloaded'
    case 'health':
      return 'discovery_health_viewed'
  }
}

function fetchOperatorState(status: DeveloperDiscoveryFetchStatus): DeveloperDiscoveryFetchReadback['operatorState'] {
  switch (status) {
    case 'successful':
    case 'cached':
      return 'shipped'
    case 'stale':
    case 'schema_version_mismatch':
      return 'degraded'
    case 'invalid':
    case 'not_found':
    case 'route_outage':
      return status === 'invalid' ? 'withheld' : 'unavailable'
  }
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return Array.from(new Set(values)).sort()
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, '')
}

export const buildCatalogDiscoveryManifest = buildCatalogDiscoveryManifestImpl

export const regenerateDiscoveryManifest = regenerateDiscoveryManifestImpl

export const invalidateDiscoveryManifest = invalidateDiscoveryManifestImpl

export const readDiscoveryHealth = readDiscoveryHealthImpl

export const buildLlmsTxt = buildLlmsTxtImpl

export const buildSitemapXml = buildSitemapXmlImpl

export const buildRobotsTxt = buildRobotsTxtImpl

export const createDefaultDiscoverySourceState = createDefaultDiscoverySourceStateImpl
