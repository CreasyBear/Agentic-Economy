import { isPubliclyDiscoverable } from '@/modules/business/public'
import { buildOfferingSupplyProjection } from './internal/catalog-model'
import type {
  GetPublicBusinessCatalogInput,
  PublicCatalogReadState,
} from './internal/catalog-model'
import { projectBusinessSupplyToPublicApi } from '@/modules/registry/public'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import type {
  PublicBusinessPageNotFoundReason,
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimField,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerClaimValidationError,
  PublicOwnerClaimValidationResult,
  PublicOwnerStatusReadback,
  PublicOwnerUnavailableCapability,
} from './internal/owner-public-flow'
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
} from './internal/offering-supply'

export {
  OfferingPriceKindValues,
  OfferingPriceTaxTreatmentValues,
  OfferingPriceUnitValues,
  formatOfferingPrice,
  normalizeOfferingPrice,
} from './internal/offering-price'
export type {
  OfferingPrice,
  OfferingPriceInput,
  OfferingPriceKind,
  OfferingPriceTaxTreatment,
  OfferingPriceUnit,
} from './internal/offering-price'

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
  OfferingAccessPathValidation,
  OfferingSupportProjection,
  PublicAccessPath,
  PublicBusinessProfile,
  PublicOfferingSupplyProjection,
  PublicSupportReason,
} from './internal/offering-supply'


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



export {
  FirstRequestModeValues,
  PublicFirstRequestChannelValues,
  normalizeFirstRequestMode,
  normalizePublicFirstRequestChannel,
} from './internal/catalog-model'

export type {
  CatalogPublishSourceState,
  CatalogSourceState,
  FirstRequestDisclosureInput,
  FirstRequestMode,
  GetPublicBusinessCatalogInput,
  PublicCatalogReadState,
  PublicFirstRequestChannel,
  PublicFirstRequestDisclosure,
  PublishBusinessCatalogCommand,
  PublishBusinessCatalogErrorCode,
  PublishBusinessCatalogResult,
  PublishBusinessCatalogState,
  ServiceCatalogInput,
  ServiceCatalogValidationResult,
  ValidatedServiceCatalogInput,
} from './internal/catalog-model'

export {
  createEmptyCatalogSourceState,
  validateServiceCatalogInput,
} from './internal/catalog-model'

export { publishBusinessCatalog } from './internal/publish'

export {
  type OfferingsReconcileResult,
  reconcilePublishedOfferings,
} from './internal/publish-reconcile'


export {
  publicOwnerDefaultClaimInput,
  toServiceCatalogInput,
  validatePublicOwnerClaimFlowInput,
  submitPublicOwnerClaimFlow,
  submitDurablePublicOwnerClaimFlow,
  resetPublicOwnerRouteReadbacksForTest,
  getDefaultPublicOwnerStatusReadback,
  getPublicOwnerStatusReadbackBySlug,
  getPublicBusinessPageReadback,
  buildPublicOwnerStatusReadback,
} from './internal/owner-public-flow'

export type {
  PublicBusinessPageNotFoundReason,
  PublicBusinessPageReadbackResult,
  PublicOwnerClaimField,
  PublicOwnerClaimFlowInput,
  PublicOwnerClaimFlowResult,
  PublicOwnerClaimValidationError,
  PublicOwnerClaimValidationResult,
  PublicOwnerStatusReadback,
  PublicOwnerUnavailableCapability,
} from './internal/owner-public-flow'

export type PublicOwnerStatusRouteReadback = Omit<PublicOwnerStatusReadback, 'catalog'> & {
  catalog: PublicBusinessCatalogApiV2Dto
  admission: R1TargetAdmission
}

export type PublicOwnerStatusRouteReadbackResult =
  | { kind: 'available'; readback: PublicOwnerStatusRouteReadback }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

export type PublicOwnerClaimFlowRouteResult =
  | Extract<PublicOwnerClaimFlowResult, { kind: 'error' }>
  | {
      kind: 'ok'
      code: 'claim_flow_published'
      catalog: PublicBusinessCatalogApiV2Dto
      readback: PublicOwnerStatusRouteReadback
    }

export type PublicBusinessPageRouteReadbackResult =
  | { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto }
  | Exclude<PublicBusinessPageReadbackResult, { kind: 'available' }>

export function readPublicCatalogActivationRef(catalog: PublicBusinessCatalogApiV2Dto): string {
  return catalog.businessId
}

export function getPublicBusinessCatalog(
  state: PublicCatalogReadState,
  input: GetPublicBusinessCatalogInput,
): { kind: 'available'; catalog: PublicBusinessCatalogApiV2Dto } | { kind: 'hidden'; reason: 'not_published' } {
  const business = state.businesses.find((candidate) => candidate.slug === input.slug)
  if (business === undefined || !isPubliclyDiscoverable(business, state.suppressionRules)) {
    return { kind: 'hidden', reason: 'not_published' }
  }
  const context = state.businessContexts.find((candidate) => candidate.businessId === business.businessId)
  if (context === undefined) return { kind: 'hidden', reason: 'not_published' }
  const projection = buildOfferingSupplyProjection({
    business,
    context,
    offerings: state.offerings.filter((offering) => offering.businessId === business.businessId),
    revisions: state.revisions.filter((revision) => revision.businessId === business.businessId),
    accessPaths: state.accessPaths.filter((path) => path.businessId === business.businessId),
    indexStatus: input.indexStatus,
    discoveryStatus: input.discoveryStatus,
  })
  return projection === undefined
    ? { kind: 'hidden', reason: 'not_published' }
    : { kind: 'available', catalog: projectBusinessSupplyToPublicApi(projection) }
}
