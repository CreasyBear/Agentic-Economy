export {
  serializeToolDescriptor,
  deserializeToolDescriptor,
  serializeToolSearchResult,
  deserializeToolSearchResult,
  serializeToolDetailResult,
  deserializeToolDetailResult,
  serializeToolCompareResult,
  deserializeToolCompareResult,
} from "./internal/tool-projection-wire";
export type {
  ToolCompareWireResult,
  ToolDetailWireResult,
  ToolSearchWireResult,
  ToolSurfaceWireResult,
  ToolSurfaceWireDescriptor,
} from "./internal/tool-projection-wire";

export {
  toolCompareInputSchema,
  toolCompareOutputSchema,
  toolDetailInputSchema,
  toolDetailOutputSchema,
  toolSearchInputSchema,
  toolSearchOutputSchema,
  publicToolAuthenticationSchema,
  publicToolParameterSchema,
  publicToolPaymentSchema,
} from "./tool-schemas";

export {
  CURRENT_TOOL_CALL_VIA,
  PublicToolRegistrySchemaVersion,
} from "./internal/tool-projection-types";
export type {
  ToolProjectionNavigationContract,
  PublicToolBusinessRef,
  PublicToolOfferingRef,
  PublicToolPrice,
  PublicToolPriceEvidence,
  PublicCommercialTerms,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicEvidencePolicy,
  PublicCancellationPolicy,
  PublicRecoveryPolicy,
  PublicCapabilityUnavailableReason,
  PublicToolParameter,
  PublicToolCanonical,
  PublicToolCatalogPrice,
  PublicToolAuthentication,
  PublicToolPayment,
  PublicToolTransport,
  PublicToolReadiness,
  CatalogOfferingToolMapEntry,
  PublicToolAvailability,
  PublicToolNavigationRelation,
  PublicToolDescriptor,
  PublicToolParameterMapping,
  CapabilityToolSourceRecord,
  CapabilityToolSourcePort,
} from "./internal/tool-projection-types";

export {
  rankToolSearchText,
  matchesToolFilters,
  normalizeToolSearchInput,
  searchCapabilityTools,
  currentToolSearchFact,
  searchCurrentToolFacts,
} from "./internal/tool-search";
export type {
  CurrentToolSearchFact,
  ToolSearchTextCandidate,
  ToolSearchRanking,
  ToolSearchFilters,
  ToolSearchInput,
  ToolSearchResult,
} from "./internal/tool-search";

export {
  detailCapabilityTool,
  compareCapabilityTools,
} from "./internal/tool-detail-compare";
export type {
  ToolDetailInput,
  ToolDetailResult,
  ToolComparisonValue,
  ToolComparisonFact,
  ToolCompareInput,
  ToolCompareResult,
} from "./internal/tool-detail-compare";

export {
  noToolNavigation,
  projectCapabilityTool,
  projectCapabilityToolCatalogPrice,
  projectCapabilityToolParameters,
} from "./internal/tool-project";
