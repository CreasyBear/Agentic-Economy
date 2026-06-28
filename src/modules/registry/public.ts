import type { BusinessId, CorrelationId, OperationKey, ServiceId, Slug, SourceHash } from '@/modules/common/ids'
import type { PublicStatus } from '@/modules/business/public'
import type { PublicCatalogContract, PublicCatalogReadState } from '@/modules/catalog/public'
import type { DiscoveryManifestAttemptContract } from '@/modules/discovery/public'
import type { AuditEventContract, OperationKeyRecord } from '@/modules/observability/public'
import {
  getIndexStatus as getIndexStatusImpl,
  readCatalogHealth as readCatalogHealthImpl,
  retryRegistryProjection as retryRegistryProjectionImpl,
  syncCatalogProjection as syncCatalogProjectionImpl,
} from './internal/projection-attempts'
import {
  createDefaultRegistrySourceState as createDefaultRegistrySourceStateImpl,
  getPublicBusinessCatalogBySlug as getPublicBusinessCatalogBySlugImpl,
  listPublicBusinessCatalog as listPublicBusinessCatalogImpl,
  searchPublicBusinessCatalog as searchPublicBusinessCatalogImpl,
} from './internal/search'
import type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
} from './internal/search'

export const IndexStatusValues = ['not_queued', 'queued', 'indexed', 'failed', 'stale'] as const
export type IndexStatus = (typeof IndexStatusValues)[number]

export const RegistryProjectionStatusValues = ['queued', 'succeeded', 'failed', 'stale'] as const
export type RegistryProjectionStatus = (typeof RegistryProjectionStatusValues)[number]

export const RegistryProjectionKindValues = ['business_catalog', 'service_catalog'] as const
export type RegistryProjectionKind = (typeof RegistryProjectionKindValues)[number]

export const IndexTargetTypeValues = ['business', 'service', 'capability'] as const
export type IndexTargetType = (typeof IndexTargetTypeValues)[number]

export const RegistryProjectionSourceVersion = 'public-catalog:v1' as const
export type RegistryProjectionSourceVersion = typeof RegistryProjectionSourceVersion

export const RegistryRepairActionValues = ['retry_projection', 'rebuild_projection', 'no_repair'] as const
export type RegistryRepairAction = (typeof RegistryRepairActionValues)[number]

export const RegistryRepairResultValues = ['not_run', 'succeeded', 'failed'] as const
export type RegistryRepairResult = (typeof RegistryRepairResultValues)[number]

export type RegistryProjectionReadback = {
  businessId: BusinessId
  slug: Slug
  publicUrl: string
  sourceVersion: RegistryProjectionSourceVersion
  sourceHash: SourceHash
  generatedHash?: SourceHash
  serviceCount: number
  publicSurfaces: readonly [
    '/registry',
    '/api/businesses',
    '/api/businesses/search',
    '/api/businesses/{slug}',
  ]
  readAt: number
}

export type RegistryProjectionItemContract = {
  businessId: BusinessId
  serviceId?: ServiceId
  logicalKey: string
  projectionKind: RegistryProjectionKind
  publicStatus: Extract<PublicStatus, 'published'>
  sourceHash: SourceHash
  sourceVersion: RegistryProjectionSourceVersion
  generatedHash: SourceHash
  publicUrl: string
  serviceCount: number
  updatedAt: number
}

export type RegistryProjectionAttemptContract = {
  businessId: BusinessId
  serviceId?: ServiceId
  logicalKey: string
  projectionKind: RegistryProjectionKind
  sourceHash: SourceHash
  sourceVersion: RegistryProjectionSourceVersion
  status: RegistryProjectionStatus
  retryCount: number
  retryAfter?: number
  lastErrorCode?: string
  lastErrorRedacted?: string
  startedAt: number
  finishedAt?: number
  latestReadback?: RegistryProjectionReadback
  staleThresholdAt?: number
  repairAction: RegistryRepairAction
  repairResult: RegistryRepairResult
}

export type IndexStatusContract = {
  targetType: IndexTargetType
  targetRef: string
  businessId?: BusinessId
  serviceId?: ServiceId
  status: IndexStatus
  lastAttemptAt: number
  sourceHash: SourceHash
  sourceVersion: RegistryProjectionSourceVersion
  staleReason?: string
}

export type RegistrySourceState = PublicCatalogReadState & {
  operationKeys: OperationKeyRecord[]
  registryProjectionItems: RegistryProjectionItemContract[]
  registryProjectionAttempts: RegistryProjectionAttemptContract[]
  discoveryManifestAttempts: DiscoveryManifestAttemptContract[]
  indexStatus: IndexStatusContract[]
  auditEvents: AuditEventContract[]
}

export type RegistryProjectionAdapterResult =
  | { kind: 'ok'; generatedHash: SourceHash }
  | { kind: 'error'; code: string; redactedMessage: string }

export type RegistryProjectionAdapter = {
  writeProjection: (catalog: PublicCatalogContract) => RegistryProjectionAdapterResult
}

export type SyncCatalogProjectionInput = {
  businessId: BusinessId
  operationKey?: OperationKey
  correlationId?: CorrelationId
}

export type SyncCatalogProjectionOptions = {
  adapter?: RegistryProjectionAdapter
  now: number
  retry?: boolean
  retryAfterMs?: number
  staleAfterMs?: number
}

export type SyncCatalogProjectionResult =
  | {
      kind: 'ok'
      code: 'registry_projection_indexed' | 'registry_projection_replayed'
      catalog: PublicCatalogContract
      projectionItems: readonly RegistryProjectionItemContract[]
      attempt: RegistryProjectionAttemptContract
      indexStatuses: readonly IndexStatusContract[]
      auditEvent: AuditEventContract
    }
  | {
      kind: 'error'
      code:
        | 'registry_projection_not_public'
        | 'registry_projection_failed'
        | 'registry_projection_missing_attempt'
      retryable: boolean
      reason: string
      attempt?: RegistryProjectionAttemptContract
      auditEvent?: AuditEventContract
    }

export type RetryRegistryProjectionInput =
  | { logicalKey: string; operationKey?: OperationKey; correlationId?: CorrelationId }
  | { businessId: BusinessId; operationKey?: OperationKey; correlationId?: CorrelationId }

export type CatalogHealthReadback = {
  businessId: BusinessId
  sourceState: 'published' | 'not_public'
  latestAttempt?: RegistryProjectionAttemptContract
  indexStatus: IndexStatus
  projectionItems: readonly RegistryProjectionItemContract[]
  affectedPublicSurfaces: RegistryProjectionReadback['publicSurfaces']
  repairAction: RegistryRepairAction
  repairResult: RegistryRepairResult
}

export type {
  PublicBusinessCatalogApiDto,
  PublicBusinessCatalogApiPage,
  PublicBusinessCatalogDetailResult,
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
}

export const createDefaultRegistrySourceState = createDefaultRegistrySourceStateImpl

export const syncCatalogProjection = syncCatalogProjectionImpl

export const retryRegistryProjection = retryRegistryProjectionImpl

export const listPublicBusinessCatalog = listPublicBusinessCatalogImpl

export const searchPublicBusinessCatalog = searchPublicBusinessCatalogImpl

export const getPublicBusinessCatalogBySlug = getPublicBusinessCatalogBySlugImpl

export const getIndexStatus = getIndexStatusImpl

export const readCatalogHealth = readCatalogHealthImpl
