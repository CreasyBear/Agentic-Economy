import type { OwnerStatusCatalog, PublicBusinessPageNotFoundReason, PublicBusinessPageReadbackResult, PublicOwnerStatusReadback } from './internal/owner-status'

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
  SUPPORTED_OFFERING_CURRENCIES,
  DEFAULT_OFFERING_PRICE_CURRENCY,
  formatOfferingPrice,
  isSupportedOfferingCurrency,
  normalizeOfferingPrice,
  supportedOfferingCurrencySchema,
} from './internal/offering-price'
export type {
  OfferingPrice,
  OfferingPriceInput,
  OfferingPriceKind,
  OfferingPriceTaxTreatment,
  OfferingPriceUnit,
  SupportedOfferingCurrency,
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
  buildOfferingSupplyProjection,
  normalizeFirstRequestMode,
  normalizePublicFirstRequestChannel,
} from './internal/catalog-model'

export type {
  CatalogSourceState,
  FirstRequestDisclosureInput,
  FirstRequestMode,
  GetPublicBusinessCatalogInput,
  PublicCatalogReadState,
  PublicFirstRequestChannel,
  PublicFirstRequestDisclosure,
  ServiceCatalogInput,
  ServiceCatalogValidationResult,
  ValidatedServiceCatalogInput,
} from './internal/catalog-model'

export {
  createEmptyCatalogSourceState,
  validateServiceCatalogInput,
} from './internal/catalog-model'

export {
  type OfferingsReconcileResult,
  reconcilePublishedOfferings,
} from './internal/publish-reconcile'


export { buildPublicOwnerStatusReadback } from './internal/owner-status'

export type {
  PublicBusinessPageNotFoundReason,
  PublicBusinessPageReadbackResult,
  OwnerStatusCatalog,
  PublicOwnerStatusReadback,
} from './internal/owner-status'

export type PublicOwnerStatusRouteReadback<Catalog extends OwnerStatusCatalog> = PublicOwnerStatusReadback<Catalog>

export type PublicOwnerStatusRouteReadbackResult<Catalog extends OwnerStatusCatalog> =
  | { kind: 'available'; readback: PublicOwnerStatusRouteReadback<Catalog> }
  | { kind: 'not_found'; reason: PublicBusinessPageNotFoundReason }
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

export type PublicBusinessPageRouteReadbackResult<Catalog extends OwnerStatusCatalog> =
  | PublicBusinessPageReadbackResult<Catalog>
  | { kind: 'unavailable'; reason: 'source_unavailable'; retryable: true }

export function readPublicCatalogActivationRef(catalog: Readonly<{ businessId: string }>): string {
  return catalog.businessId
}
