import type { BusinessId, Slug, SourceHash } from '@/modules/common/ids'
import type { PublicCatalogContract, ServiceCapabilityContract } from '@/modules/catalog/public'
import { buildCatalogDiscoveryManifest as buildCatalogDiscoveryManifestImpl } from './internal/ucp-manifest'

export const DiscoveryStatusValues = ['unavailable', 'degraded', 'available', 'stale'] as const
export type DiscoveryStatus = (typeof DiscoveryStatusValues)[number]

export const DiscoveryPathKindValues = ['ae_hosted_fallback', 'business_origin_standard'] as const
export type DiscoveryPathKind = (typeof DiscoveryPathKindValues)[number]

export const DiscoveryAttemptStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type DiscoveryAttemptStatus = (typeof DiscoveryAttemptStatusValues)[number]

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
  status: DiscoveryAttemptStatus
  failureCode?: string
  failureMessageRedacted?: string
  startedAt: number
  finishedAt?: number
}

export const buildCatalogDiscoveryManifest = buildCatalogDiscoveryManifestImpl
