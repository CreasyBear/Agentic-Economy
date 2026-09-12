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
  PublicToolRegistrySchemaVersion,
  searchCapabilityTools,
  detailCapabilityTool,
  compareCapabilityTools,
  projectCapabilityTool,
  serializeToolDescriptor,
  deserializeToolDescriptor,
  serializeToolSearchResult,
  deserializeToolSearchResult,
  serializeToolDetailResult,
  deserializeToolDetailResult,
  serializeToolCompareResult,
  deserializeToolCompareResult,
  isPublicToolRef,
  publicToolAuthenticationSchema,
  publicToolParameterSchema,
} from '@/modules/capability-supply/public'
export type {
  CapabilityToolSourcePort,
  CapabilityToolSourceRecord,
  ToolCompareInput,
  ToolCompareResult,
  ToolComparisonFact,
  ToolCompareWireResult,
  ToolDetailInput,
  ToolDetailResult,
  ToolDetailWireResult,
  ToolSearchFilters,
  ToolSearchInput,
  ToolSearchResult,
  ToolSearchWireResult,
  ToolSurfaceWireDescriptor,
  ToolSurfaceWireResult,
  PublicCapabilityUnavailableReason,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicCancellationPolicy,
  PublicToolAvailability,
  PublicToolBusinessRef,
  PublicToolCatalogPrice,
  PublicToolDescriptor,
  PublicToolListingRef,
  PublicToolParameter,
  PublicToolPrice,
  PublicToolRef,
  PublicToolNavigationRelation,
  PublicRecoveryPolicy,
} from '@/modules/capability-supply/public'
export {
  PublicBusinessCatalogApiSchemaVersion,
  getPublicBusinessCatalog,
  projectBusinessSupplyToPublicApi,
} from './internal/offering-api-projection'
export type {
  PublicBusinessCatalogApiV2Dto,
  PublicBusinessCatalogApiV2Page,
  PublicBusinessCatalogApiV2SearchPage,
  PublicBusinessCatalogV2DetailResult,
  PublicListingAccessPathDto,
  PublicListingDto,
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
  ServiceToolMap,
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
export { TOOL_READ_UNAVAILABLE_PROBLEM } from './tool-read-problem'
export {
  buildRegistrySearchDocumentsForCatalog,
  documentMatchesRegistryQuery,
  resolveRegistrySearchLocation,
} from './internal/search-documents'
export {
  syncCatalogProjection,
  retryRegistryProjection,
  getIndexStatus,
  readCatalogHealth,
} from './internal/projection-attempts'
