import type {
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
} from './internal/search'
import {
  RegistryProjectionSourceVersion as RegistryProjectionSourceVersionValue,
  RegistrySearchDocumentSourceVersion as RegistrySearchDocumentSourceVersionValue,
  type IndexStatus,
  type IndexTargetType,
  type RegistryProjectionKind,
  type RegistryProjectionSourceVersion as RegistryProjectionSourceVersionType,
  type RegistryProjectionStatus,
  type RegistryRepairAction,
  type RegistryRepairResult,
  type RegistrySearchDocumentSourceVersion as RegistrySearchDocumentSourceVersionType,
} from './internal/schema-values'
export {
  PublicOperationRegistrySchemaVersion,
  searchCapabilityOperations,
  detailCapabilityOperation,
  compareCapabilityOperations,
  inspectCapabilityOperationPlan,
  projectCapabilityOperation,
  serializeOperationDescriptor,
  deserializeOperationDescriptor,
  serializeOperationSearchResult,
  deserializeOperationSearchResult,
  serializeOperationDetailResult,
  deserializeOperationDetailResult,
  serializeOperationCompareResult,
  deserializeOperationCompareResult,
  isPublicOperationRef,
  publicOperationAuthenticationSchema,
  publicOperationParameterSchema,
} from '@/modules/capability-supply/public'
export type {
  CapabilityOperationSourcePort,
  CapabilityOperationSourceRecord,
  InspectPlanInput,
  InspectPlanResult,
  OperationCompareInput,
  OperationCompareResult,
  OperationComparisonFact,
  OperationCompareWireResult,
  OperationDetailInput,
  OperationDetailResult,
  OperationDetailWireResult,
  OperationSearchFilters,
  OperationSearchInput,
  OperationSearchResult,
  OperationSearchWireResult,
  OperationSurfaceWireDescriptor,
  OperationSurfaceWireResult,
  PublicCapabilityUnavailableReason,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicCancellationPolicy,
  PublicOperationAvailability,
  PublicOperationBusinessRef,
  PublicOperationCatalogPrice,
  PublicOperationDescriptor,
  PublicOperationOfferingRef,
  PublicOperationParameter,
  PublicOperationPrice,
  PublicOperationRef,
  PublicOperationNavigationRelation,
  PublicRecoveryPolicy,
} from '@/modules/capability-supply/public'
export {
  PublicBusinessCatalogApiSchemaVersion,
  projectBusinessSupplyToPublicApi,
} from './internal/offering-api-projection'
export type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
  PublicOfferingAccessPathDto,
  PublicOfferingDto,
} from './internal/offering-api-projection'
export {
  PublicServicesApiSchemaVersion,
  projectPublicServicesPage,
  projectPublicServicesSearchPage,
} from './internal/services-api-projection'
export { registrySearchTokens } from './internal/search-documents'
export type {
  PublicServicesApiPage,
  PublicServicesSearchPage,
  ServiceOperationMap,
} from './internal/services-api-projection'
export type {
  ServiceDto,
  ServiceEndpointAuthenticationDto,
  ServiceEndpointAuthorityModeDto,
  ServiceEndpointDto,
  ServiceEndpointExecutionDto,
  ServiceEndpointSourceKindDto,
  ServiceOfferingDto,
  ServicePriceSummaryDto,
} from './internal/service-projection'

export {
  IndexStatusValues,
  IndexTargetTypeValues,
  RegistryProjectionKindValues,
  RegistryProjectionStatusValues,
  RegistryRepairActionValues,
  RegistryRepairResultValues,
} from './internal/schema-values'
export type {
  IndexStatus,
  IndexTargetType,
  RegistryProjectionKind,
  RegistryProjectionStatus,
  RegistryRepairAction,
  RegistryRepairResult,
}
export const RegistryProjectionSourceVersion = RegistryProjectionSourceVersionValue
export const RegistrySearchDocumentSourceVersion = RegistrySearchDocumentSourceVersionValue
export type RegistryProjectionSourceVersion = RegistryProjectionSourceVersionType
export type RegistrySearchDocumentSourceVersion = RegistrySearchDocumentSourceVersionType


export type {
  RegistryProjectionReadback,
  RegistryProjectionItemContract,
  RegistryProjectionAttemptContract,
  IndexStatusContract,
  RegistrySearchDocumentContract,
  RegistrySourceState,
  RegistryProjectionAdapterResult,
  RegistryProjectionAdapter,
  SyncCatalogProjectionInput,
  SyncCatalogProjectionOptions,
  SyncCatalogProjectionResult,
  RetryRegistryProjectionInput,
  CatalogHealthReadback,
} from './internal/projection-contracts'

export type {
  PublicBusinessCatalogQueryInput,
  PublicBusinessCatalogSearchInput,
}
export {
  listPublicBusinessOfferingSupply,
  searchPublicBusinessOfferingSupply,
  getPublicBusinessOfferingSupplyBySlug,
} from './internal/search'
export {
  buildRegistrySearchDocumentsForCatalog,
} from './internal/search-documents'
export {
  syncCatalogProjection,
  retryRegistryProjection,
  getIndexStatus,
  readCatalogHealth,
} from './internal/projection-attempts'
