import { isPubliclyDiscoverable } from '@/modules/business/public'
import {
  buildPublicCatalogDto as buildPublicCatalogDtoImpl,
  createEmptyCatalogSourceState as createEmptyCatalogSourceStateImpl,
  validateServiceCatalogInput as validateServiceCatalogInputImpl,
} from './internal/catalog-model'
import type {
  BuildPublicCatalogResult,
  GetPublicBusinessCatalogInput,
  PublicCatalogContract,
  PublicCatalogReadState,
} from './internal/catalog-model'
import {
  buildPublicOwnerStatusReadback as buildPublicOwnerStatusReadbackImpl,
  getDefaultPublicOwnerStatusReadback as getDefaultPublicOwnerStatusReadbackImpl,
  getPublicBusinessPageReadback as getPublicBusinessPageReadbackImpl,
  getPublicOwnerStatusReadbackBySlug as getPublicOwnerStatusReadbackBySlugImpl,
  publicOwnerDefaultClaimInput as publicOwnerDefaultClaimInputImpl,
  resetPublicOwnerRouteReadbacksForTest as resetPublicOwnerRouteReadbacksForTestImpl,
  submitDurablePublicOwnerClaimFlow as submitDurablePublicOwnerClaimFlowImpl,
  submitPublicOwnerClaimFlow as submitPublicOwnerClaimFlowImpl,
  validatePublicOwnerClaimFlowInput as validatePublicOwnerClaimFlowInputImpl,
} from './internal/owner-public-flow'
import type {
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimField,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerClaimValidationError,
  PublicOwnerClaimValidationResult,
  PublicOwnerStatusReadback,
  PublicOwnerUnavailableCapability,
} from './internal/owner-public-flow'
import { publishBusinessCatalog as publishBusinessCatalogImpl } from './internal/publish'
import type { R1TargetAdmission } from '@/modules/inquiries/public'

export type { PublicBusinessPhoto } from '@/modules/business/public'

export {
  BusinessOfferingStatusValues,
  ExternalOperationProvenanceValues,
  HumanRequestChannelValues,
  OfferingAccessPathStatusValues,
  PublicSupportReasonValues,
  buildBusinessSupplyProjection,
  buildPublicOfferingSupplyProjection,
  validateOfferingAccessPath,
  validateOfferingComparisonEnvelope,
} from './internal/offering-supply'

export type {
  BuildPublicOfferingSupplyProjectionResult,
  BuildBusinessSupplyProjectionResult,
  BusinessSupplyProjection,
  BusinessOfferingProjection,
  BusinessOfferingRecord,
  BusinessOfferingRevisionRecord,
  BusinessOfferingStatus,
  ExternalOperationAccessPathDescriptor,
  ExternalOperationProvenance,
  HumanRequestAccessPathDescriptor,
  HumanRequestChannel,
  OfferingAccessPathDescriptor,
  OfferingAccessPathRecord,
  OfferingAccessPathStatus,
  OfferingComparisonEnvelope,
  OfferingComparisonEnvelopeValidation,
  OfferingSupportProjection,
  PublicAccessPath,
  PublicBusinessProfile,
  PublicOfferingSupplyProjection,
  PublicSupportReason,
} from './internal/offering-supply'

export {
  OfferingHistorySafeDisplayDispositionValues,
  resolveHistoricalPublicOffering,
} from './internal/offering-public-history'

export type {
  HistoricalOfferingSelection,
  OfferingHistorySafeDisplayDisposition,
  OfferingPublicRevisionHistoryRecord,
  ResolveHistoricalPublicOfferingResult,
} from './internal/offering-public-history'

export {
  MAX_LEGACY_MIGRATION_BATCH,
  decideCatalogSupplyCutover,
  legacyOfferingParityMatches,
  migrateLegacyServiceToOffering,
  planLegacyOfferingMigrationBatch,
} from './internal/offering-migration'

export {
  MAX_ACCESS_PATHS_PER_OFFERING,
  MAX_OFFERINGS_PER_BUSINESS,
  changeOfferingStatusInState,
  createOfferingInState,
  reviseOfferingInState,
  upsertAccessPathInState,
  withdrawAccessPathInState,
} from './internal/offering-source'

export type {
  OfferingFactsInput,
  OfferingSourceErrorCode,
  OfferingSourceOperation,
  OfferingSourceResult,
  OfferingSourceState,
} from './internal/offering-source'

export type {
  CatalogSupplyCutoverDecision,
  CatalogSupplyCutoverMode,
  LegacyOfferingCrosswalk,
  LegacyOfferingMigration,
} from './internal/offering-migration'

export {
  BusinessServiceStatusValues,
  CapabilityKindValues,
  FirstRequestModeValues,
  PublicFirstRequestChannelValues,
  ServiceCapabilityStatusValues,
} from './internal/catalog-model'

export type {
  BuildPublicCatalogInput,
  BuildPublicCatalogResult,
  BusinessServiceRecord,
  BusinessServiceStatus,
  CapabilityKind,
  CatalogPublishSourceState,
  CatalogSourceState,
  FirstRequestDisclosureInput,
  FirstRequestMode,
  GetPublicBusinessCatalogInput,
  PublicCatalogContract,
  PublicCatalogReadState,
  PublicFirstRequestChannel,
  PublicFirstRequestDisclosure,
  PublicServiceContract,
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogErrorCode,
  PublishBusinessCatalogResult,
  PublishBusinessCatalogState,
  ServiceCapabilityContract,
  ServiceCapabilityRecord,
  ServiceCapabilityStatus,
  ServiceCatalogInput,
  ServiceCatalogValidationResult,
  ValidatedServiceCatalogInput,
} from './internal/catalog-model'

export {
  catalogFromRows,
  projectDiscoveryPublicCatalog,
  projectRegistryCatalogApiItem,
  type CatalogFromRowsCapability,
  type CatalogFromRowsInput,
  type CatalogFromRowsService,
  type DiscoveryPublicCatalogProjection,
  type RegistryCatalogApiItem,
} from './internal/catalog-from-rows'

export const buildPublicCatalogDto = buildPublicCatalogDtoImpl

export const createEmptyCatalogSourceState = createEmptyCatalogSourceStateImpl

export const validateServiceCatalogInput = validateServiceCatalogInputImpl

export const publishBusinessCatalog = publishBusinessCatalogImpl

export const publicOwnerDefaultClaimInput = publicOwnerDefaultClaimInputImpl

export const validatePublicOwnerClaimFlowInput = validatePublicOwnerClaimFlowInputImpl

export const submitPublicOwnerClaimFlow = submitPublicOwnerClaimFlowImpl

export const submitDurablePublicOwnerClaimFlow = submitDurablePublicOwnerClaimFlowImpl

export const resetPublicOwnerRouteReadbacksForTest = resetPublicOwnerRouteReadbacksForTestImpl

export const getDefaultPublicOwnerStatusReadback = getDefaultPublicOwnerStatusReadbackImpl

export const getPublicOwnerStatusReadbackBySlug = getPublicOwnerStatusReadbackBySlugImpl

export const getPublicBusinessPageReadback = getPublicBusinessPageReadbackImpl

export const buildPublicOwnerStatusReadback = buildPublicOwnerStatusReadbackImpl

export type {
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimField,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerClaimValidationError,
  PublicOwnerClaimValidationResult,
  PublicOwnerStatusReadback,
  PublicOwnerUnavailableCapability,
}

export type PublicRouteCapabilityContract = Omit<PublicCatalogContract['services'][number]['capabilities'][number], 'sourceHash'>

export type PublicRouteServiceContract = Omit<PublicCatalogContract['services'][number], 'sourceHash' | 'capabilities'> & {
  capabilities: readonly PublicRouteCapabilityContract[]
}

export type PublicRouteCatalogContract = Omit<PublicCatalogContract, 'sourceHash' | 'services'> & {
  services: readonly PublicRouteServiceContract[]
}

export type PublicOwnerStatusRouteReadback = Omit<PublicOwnerStatusReadback, 'catalog'> & {
  catalog: PublicRouteCatalogContract
  admission: R1TargetAdmission
}

export type PublicOwnerStatusRouteReadbackResult =
  | { kind: 'available'; readback: PublicOwnerStatusRouteReadback }
  | { kind: 'not_found'; reason: 'not_public' }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

export type PublicOwnerClaimFlowRouteResult =
  | Extract<PublicOwnerClaimFlowResult, { kind: 'error' }>
  | {
      kind: 'ok'
      code: 'claim_flow_published'
      catalog: PublicRouteCatalogContract
      readback: PublicOwnerStatusRouteReadback
    }

export type PublicBusinessPageRouteReadbackResult =
  | { kind: 'available'; catalog: PublicRouteCatalogContract }
  | Exclude<PublicBusinessPageReadbackResult, { kind: 'available' }>

export function readPublicCatalogActivationRef(catalog: PublicRouteCatalogContract): string {
  return catalog.businessId
}

export function getPublicBusinessCatalog(
  state: PublicCatalogReadState,
  input: GetPublicBusinessCatalogInput
): BuildPublicCatalogResult {
  const business = state.businesses.find((candidate) => candidate.slug === input.slug)
  if (business === undefined) {
    return { kind: 'hidden', reason: 'not_published' }
  }

  if (!isPubliclyDiscoverable(business, state.suppressionRules)) {
    return { kind: 'hidden', reason: 'not_published' }
  }

  const context = state.businessContexts.find((candidate) => candidate.businessId === business.businessId)
  if (context === undefined) {
    return { kind: 'hidden', reason: 'not_published' }
  }

  return buildPublicCatalogDtoImpl({
    business,
    context,
    services: state.businessServices.filter((service) => service.businessId === business.businessId),
    capabilities: state.serviceCapabilities.filter((capability) => capability.businessId === business.businessId),
    indexStatus: input.indexStatus,
    discoveryStatus: input.discoveryStatus,
  })
}
