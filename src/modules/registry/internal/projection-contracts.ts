import type { BusinessId, CorrelationId, OfferingRef, OperationKey, Slug, SourceHash } from '@/modules/common/ids'
import type { BusinessContext, PublicStatus, TrustTier } from '@/modules/business/public'
import type { FirstRequestMode, PublicCatalogReadState } from '@/modules/catalog/public'
import type { AuditEventContract, OperationKeyRecord } from '@/modules/observability/public'
import type {
  IndexStatus,
  IndexTargetType,
  RegistryProjectionKind,
  RegistryProjectionSourceVersion,
  RegistryProjectionStatus,
  RegistryRepairAction,
  RegistryRepairResult,
  RegistrySearchDocumentSourceVersion,
} from './schema-values'
import type { PublicBusinessCatalogApiV2Dto } from './offering-api-projection'

export type RegistryProjectionReadback = {
  businessId: BusinessId
  slug: Slug
  publicUrl: string
  sourceVersion: RegistryProjectionSourceVersion
  sourceHash: SourceHash
  generatedHash?: SourceHash
  offeringCount: number
  publicSurfaces: readonly [
    '/api/businesses',
    '/api/businesses/search',
    '/api/businesses/{slug}',
  ]
  readAt: number
}

export type RegistryProjectionItemContract = {
  businessId: BusinessId
  offeringRef?: OfferingRef
  logicalKey: string
  projectionKind: RegistryProjectionKind
  publicStatus: Extract<PublicStatus, 'published'>
  sourceHash: SourceHash
  sourceVersion: RegistryProjectionSourceVersion
  generatedHash: SourceHash
  publicUrl: string
  offeringCount: number
  updatedAt: number
}

export type RegistryProjectionAttemptContract = {
  businessId: BusinessId
  offeringRef?: OfferingRef
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
  offeringRef?: OfferingRef
  status: IndexStatus
  lastAttemptAt: number
  sourceHash: SourceHash
  sourceVersion: RegistryProjectionSourceVersion
  staleReason?: string
}

export type RegistrySearchDocumentContract = {
  documentId: string
  schemaVersion: RegistrySearchDocumentSourceVersion
  businessSlug: string
  offeringRef: OfferingRef
  businessName: string
  name: string
  category: string
  categoryKey: string
  businessContext: BusinessContext
  publicStatus: Extract<PublicStatus, 'published'>
  trustTier: TrustTier
  firstRequestMode: FirstRequestMode
  placeKeys: readonly string[]
  keywords: readonly string[]
  searchText: string
  serviceAreaSummary: string
  sourceHash?: SourceHash
  generatedHash: SourceHash
  updatedAt: number
}

export type RegistrySourceState = PublicCatalogReadState & {
  operationKeys: OperationKeyRecord[]
  registryProjectionItems: RegistryProjectionItemContract[]
  registryProjectionAttempts: RegistryProjectionAttemptContract[]
  registrySearchDocuments?: RegistrySearchDocumentContract[]
  indexStatus: IndexStatusContract[]
  auditEvents: AuditEventContract[]
}


export type RegistryProjectionAdapterResult =
  | { kind: 'ok'; generatedHash: SourceHash }
  | { kind: 'error'; code: string; redactedMessage: string }

export type RegistryProjectionAdapter = {
  writeProjection: (catalog: PublicBusinessCatalogApiV2Dto) => RegistryProjectionAdapterResult
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
      catalog: PublicBusinessCatalogApiV2Dto
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
