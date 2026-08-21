import type { BusinessContext } from '@/modules/business/public'
import type { SourceHash } from '@/modules/common/ids'
import type { FunnelEventType } from '@/modules/observability/public'
import type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
} from '@/modules/registry/public'
import type { DiscoveryStatus } from './schema-values'

export const DeveloperDiscoverySchemaVersion = 'developer-discovery:v1' as const
export type DeveloperDiscoverySchemaVersion = typeof DeveloperDiscoverySchemaVersion

export const DiscoverySupportSurfaceValues = [
  'public_json_routes',
  'ae_hosted_ucp',
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

export const DeveloperDiscoveryFetchKindValues = ['docs', 'schema', 'examples', 'health'] as const
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
  businessContext: BusinessContext
  publicUrl: string
  schemaVersion: PublicBusinessCatalogApiV2Dto['schemaVersion']
  disposition: PublicBusinessCatalogApiV2Dto['disposition']
  observedAt: number
  offeringCount: number
  accessPathKinds: readonly PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'][number]['kind'][]
  supportStates: readonly ('integrated' | 'ae_supported_action')[]
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
  list: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogApiV2Page>
  search: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogApiV2SearchPage>
  detail?: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogV2DetailResult>
  missingDetail?: DeveloperDiscoveryRouteSnapshotResponse<PublicBusinessCatalogV2DetailResult>
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
    disposition: readonly PublicBusinessCatalogApiV2Dto['disposition'][]
    offeringAccessPathKind: readonly PublicBusinessCatalogApiV2Dto['offerings'][number]['accessPaths'][number]['kind'][]
    offeringSupport: readonly ('integrated' | 'ae_supported_action')[]
  }
  pagination: {
    listRoutes: readonly string[]
    cursorSupported: true
    limitSupported: true
  }
}

export type DeveloperDiscoveryExamplesArtifact = DeveloperDiscoveryArtifactBase & {
  kind: 'public_catalog_examples'
  examples: readonly PublicBusinessCatalogApiV2Dto[]
  emptyExample: PublicBusinessCatalogApiV2Page
}

export type DeveloperDiscoveryArtifact =
  | DeveloperDiscoverySchemaArtifact
  | DeveloperDiscoveryExamplesArtifact

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

export type ReadDeveloperDiscoveryRouteOptions = {
  canonicalBaseUrl?: string
  now?: number
  routeSnapshot?: DeveloperDiscoveryRouteSnapshot
  projectionGates?: readonly DiscoveryProjectionGateInput[]
  supportRecord?: DeveloperDiscoveryCapabilityLaunchSupportRecord
}

export type DeveloperDiscoveryRouteReadback = {
  schemaVersion: DeveloperDiscoverySchemaVersion
  generatedAt: number
  canonicalBaseUrl: string
  catalogCount: number
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

export const DeveloperDiscoveryPublicRoutes = [
  { path: '/api/businesses', label: 'Public catalog list JSON' },
  { path: '/api/businesses/search?q=', label: 'Public catalog search JSON' },
  { path: '/api/businesses/{slug}', label: 'Public catalog detail JSON' },
  { path: '/{slug}/ucp', label: 'AE-hosted UCP manifest' },
  { path: '/llms.txt', label: 'LLMs text discovery file' },
  { path: '/sitemap.xml', label: 'Sitemap discovery file' },
  { path: '/robots.txt', label: 'Robots discovery file' },
] as const

export const DeveloperDiscoveryArtifacts = [
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
] as const

export const DeveloperDiscoveryUnsupportedCapabilities = [
  {
    label: 'Business-origin discovery file',
    state: 'unavailable',
    reason: 'Only the AE-hosted manifest has source-owned readback; merchant-origin serving is not proven.',
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
