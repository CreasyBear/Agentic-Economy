export {
  serializeOperationDescriptor,
  deserializeOperationDescriptor,
  serializeOperationSearchResult,
  deserializeOperationSearchResult,
  serializeOperationDetailResult,
  deserializeOperationDetailResult,
  serializeOperationCompareResult,
  deserializeOperationCompareResult,
  serializeInspectPlanResult,
  deserializeInspectPlanResult,
} from "./internal/operation-projection-wire";
export type {
  InspectPlanWireResult,
  OperationCompareWireResult,
  OperationDetailWireResult,
  OperationSearchWireResult,
  OperationSurfaceWireResult,
  OperationSurfaceWireDescriptor,
} from "./internal/operation-projection-wire";

export {
  operationCompareInputSchema,
  operationCompareOutputSchema,
  operationDetailInputSchema,
  operationDetailOutputSchema,
  operationInspectPlanInputSchema,
  operationInspectPlanOutputSchema,
  operationSearchInputSchema,
  operationSearchOutputSchema,
  publicOperationAuthenticationSchema,
  publicOperationParameterSchema,
} from "./operation-schemas";

export {
  PublicOperationRegistrySchemaVersion,
} from "./internal/operation-projection-types";
export type {
  PublicOperationBusinessRef,
  PublicOperationOfferingRef,
  PublicOperationPrice,
  PublicOperationPriceEvidence,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicCancellationPolicy,
  PublicRecoveryPolicy,
  PublicCapabilityUnavailableReason,
  PublicOperationParameter,
  PublicOperationCatalogPrice,
  PublicOperationAuthentication,
  PublicOperationTransport,
  PublicOperationReadiness,
  CatalogOfferingOperationMapEntry,
  PublicOperationAvailability,
  PublicOperationNavigationRelation,
  PublicOperationDescriptor,
  PublicOperationParameterMapping,
  CapabilityOperationSourceRecord,
  CapabilityOperationSourcePort,
} from "./internal/operation-projection-types";

export {
  rankOperationSearchText,
  searchCapabilityOperations,
  currentOperationSearchFact,
  searchCurrentOperationFacts,
} from "./internal/operation-search";
export type {
  CurrentOperationSearchFact,
  OperationSearchTextCandidate,
  OperationSearchRanking,
  OperationSearchFilters,
  OperationSearchInput,
  OperationSearchResult,
} from "./internal/operation-search";

export {
  detailCapabilityOperation,
  compareCapabilityOperations,
} from "./internal/operation-detail-compare";
export type {
  OperationDetailInput,
  OperationDetailResult,
  OperationComparisonValue,
  OperationComparisonFact,
  OperationCompareInput,
  OperationCompareResult,
} from "./internal/operation-detail-compare";

export { inspectCapabilityOperationPlan } from "./internal/operation-inspect-plan";
export type {
  InspectPlanInput,
  InspectPlanResult,
} from "./internal/operation-inspect-plan";

export { projectCapabilityOperation } from "./internal/operation-project";
