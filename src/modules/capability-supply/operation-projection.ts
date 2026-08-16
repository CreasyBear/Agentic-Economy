import {
  jsonValueSchema,
  resolvePointedSchema,
  type CapabilityContract,
  type CapabilityInputExample,
  type JsonValue,
} from "@/modules/capability-contract/public";
import {
  addExactAmounts,
  compareExactAmounts,
  exactAmountSchema,
  formatExactAmount,
  rescaleExactAmount,
  type ExactAmount,
} from "@/modules/money/public";
import { isRecord } from "@/modules/common/is-record";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import type { StableHashValue } from "@/modules/common/stable-hash";
import {
  createPublicOperationRef,
  isPublicOperationRef,
  type PublicOperationRef,
  type RegisteredOperationMapping,
  type RegisteredOperationMappingRef,
} from "./public";
import { operationMarketNavigation } from "@/modules/registry/operation-entry";
import { OPERATION_INVOKE_ROUTE_CONTRACT } from "@/modules/capability-execution/operation-invoke-entry";
import type { X402CatalogPayment } from "./internal/transport-adapters";

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

export const PublicOperationRegistrySchemaVersion =
  "registry-operations:v1" as const;
export type PublicOperationRegistrySchemaVersion =
  typeof PublicOperationRegistrySchemaVersion;
export type PublicOperationBusinessRef = Readonly<{
  businessId: string;
  slug: string;
  name: string;
}>;
export type PublicOperationOfferingRef = Readonly<{
  offeringRef: string;
  revision: number;
  label: string;
  summary: string;
}>;
export type PublicOperationPrice =
  | Readonly<{ kind: "fixed"; amount: ExactAmount }>
  | Readonly<{ kind: "range"; minimum: ExactAmount; maximum: ExactAmount }>
  | Readonly<{ kind: "on_request" }>;
export type PublicOperationPriceEvidence = Readonly<{
  priceDigest: string;
  sourceRef?: string;
  evidenceRefs: readonly string[];
  observedAt?: number;
  validUntil?: number;
}>;
export type PublicCommercialTerms = Readonly<{
  price: PublicOperationPrice;
  priceEvidence?: PublicOperationPriceEvidence;
  materialTerms: readonly Readonly<{ label: string; value: string }>[];
  relationship: Readonly<{
    kind: "none" | "direct" | "affiliate" | "ownership";
    summary: string;
  }>;
}>;
export type PublicDataUsePolicy = readonly Readonly<{
  effectId: string;
  inputPointer: string;
  classification: "public" | "personal" | "sensitive" | "credential";
  phase: "preparation" | "execution";
  recipient: "candidate_binding" | "selected_binding" | "named_recipient";
  purposes: readonly string[];
}>[];
export type PublicEffectPolicy = readonly Readonly<{
  effectId: string;
  class: "data_release" | "financial_exposure" | "external_state_change";
  authority: "none" | "explicit" | "mandate_or_explicit";
  reversibility:
    "not_applicable" | "reversible" | "conditional" | "irreversible";
}>[];
export type PublicEvidencePolicy = readonly Readonly<{
  evidenceId: string;
  outputPointer: string;
  purpose: "comparison" | "completion" | "recovery";
}>[];
export type PublicCancellationPolicy = Readonly<{
  kind: "unsupported" | "adapter_managed";
}>;
export type PublicRecoveryPolicy = Readonly<{
  idempotency: "not_applicable" | "required";
  recovery: "retry_safe" | "reconcile_required";
}>;
export type PublicCapabilityUnavailableReason =
  | "setup_required"
  | "temporarily_unavailable"
  | "readiness_expired"
  | "publisher_withdrew"
  | "under_review"
  | "updated_terms_require_review"
  | "not_supported_by_ae";
/**
 * Flat, self-describing catalog parameter (agentic.market `parameters[]`),
 * additive to the execution contract's `inputJsonSchema`.
 */
export type PublicOperationParameter = Readonly<{
  group: "body" | "path" | "query" | "header";
  name: string;
  type: string;
  description?: string;
  example?: JsonValue;
  enumValues?: readonly string[];
  default?: JsonValue;
  required: boolean;
  style?: "form" | "simple";
  explode?: boolean;
}>;

export type PublicOperationCatalogPrice = Readonly<{
  scheme: "exact" | "upto";
  amount?: string;
  minAmount?: string;
  maxAmount?: string;
  currency: string;
}>;
export type PublicOperationAuthentication =
  | Readonly<{ kind: "keyless" }>
  | Readonly<{
      kind: "platform_credential";
      scheme: "api_key";
      in: "query" | "header";
      name: string;
    }>
  | Readonly<{ kind: "platform_credential"; scheme: "bearer" }>
  | Readonly<{ kind: "x402" }>
  | Readonly<{ kind: "unknown" }>;
export type PublicOperationTransport = Readonly<{
  method: "GET" | "POST";
  pathTemplate?: string;
  responseStatus?: number;
  responseContentType?: string;
  requestTimeoutMs: number;
}>;
export type PublicOperationReadiness = Readonly<{
  observedAt?: number;
  validUntil?: number;
}>;

/**
 * The W1 origin seam: each catalog access path has its own exact admitted
 * operation entry. Endpoint URLs remain in this server-side linkage seam;
 * operation search/detail descriptors never carry them.
 */
export type CatalogOfferingOperationMapEntry = Readonly<{
  offeringRef: string;
  offeringRevision: number;
  offeringSourceHash: string;
  declaredAccessPathRef: string;
  accessPathSourceHash: string;
  endpointUrl: string;
  method: "GET" | "POST";
  authorityMode: PublicOperationDescriptor["provenance"]["publisher"];
  sourceKind: PublicOperationDescriptor["provenance"]["sourceKind"];
  authentication: PublicOperationAuthentication;
  routeable: boolean;
  answerExecutable: boolean;
  readiness: PublicOperationReadiness;
  operationRef: PublicOperationRef;
  parameters?: readonly PublicOperationParameter[];
  catalogPrice?: PublicOperationCatalogPrice;
  payment?: X402CatalogPayment;
}>;
export type PublicOperationAvailability = Readonly<{
  posture: "integrated" | "routeable" | "unavailable";
  observedAt?: number;
  validUntil?: number;
  reason?: PublicCapabilityUnavailableReason;
}>;
export type PublicOperationNavigationRelation = Readonly<{
  relation:
    | "search"
    | "detail"
    | "compare"
    | "inspect_plan"
    | "execute"
    | "invoke"
    | "review_route"
    | "read_status"
    | "reconcile"
    | "cancel";
  pathTemplate?: string;
  method: "GET" | "POST";
  actionId: string;
  authentication: "none" | "required";
  inputSchema?: Readonly<Record<string, JsonValue>>;
  surfaces?: readonly (
    "ui" | "http" | "agentJson" | "answerThread" | "cli" | "mcp"
  )[];
  precondition?: string;
}>;
export type PublicOperationDescriptor = Readonly<{
  operationRef: PublicOperationRef;
  operationId: string;
  contract: Readonly<{
    capabilityId: string;
    version: number;
    inputJsonSchema: Readonly<Record<string, JsonValue>>;
    outputJsonSchema: Readonly<Record<string, JsonValue>>;
    customerAnnotations: readonly Readonly<{
      annotationId: string;
      document: "input" | "output";
      pointer: string;
      label: string;
      role: CapabilityContract["customerAnnotations"][number]["role"];
      semanticIdentity?: string;
      inference?: "allowed" | "customer_required";
    }>[];
    inputExamples?: readonly CapabilityInputExample[];
  }>;
  business: PublicOperationBusinessRef;
  offering: PublicOperationOfferingRef;
  summary: string;
  commercial: PublicCommercialTerms;
  dataUse: PublicDataUsePolicy;
  effects: PublicEffectPolicy;
  evidence: PublicEvidencePolicy;
  cancellation: PublicCancellationPolicy;
  recovery: PublicRecoveryPolicy;
  authentication: PublicOperationAuthentication;
  transport: PublicOperationTransport;
  provenance: Readonly<{
    publisher:
      | "provider_owned"
      | "ae_curated_external"
      | "third_party_gateway"
      | "observed_external";
    sourceKind:
      "ae_envelope" | "openapi_http" | "mcp" | "agent_plugin_mcp" | "x402";
  }>;
  availability: PublicOperationAvailability;
  navigation: readonly PublicOperationNavigationRelation[];
  /** Additive catalog display aids derived from the contract/price; absent when not derivable. */
  parameters?: readonly PublicOperationParameter[];
  catalogPrice?: PublicOperationCatalogPrice;
}>;
export type PublicOperationParameterMapping = Readonly<{
  inputPointer: string;
  group: "path" | "query" | "header";
  name: string;
  required?: boolean;
  style?: "form" | "simple";
  explode?: boolean;
}>;
export type CapabilityOperationSourceRecord = Readonly<{
  operationId: string;
  publicationRef: string;
  publicationRevision: number;
  networkId: string;
  contract: CapabilityContract;
  business: PublicOperationBusinessRef;
  offering: PublicOperationOfferingRef;
  price: PublicOperationPrice;
  priceEvidence?: PublicOperationPriceEvidence;
  materialTerms: readonly Readonly<{ label: string; value: string }>[];
  commercialRelationship: Readonly<{
    kind: "none" | "direct" | "affiliate" | "ownership";
    summary: string;
  }>;
  cancellation: PublicCancellationPolicy;
  authentication: PublicOperationAuthentication;
  transport: PublicOperationTransport;
  parameterMappings?: readonly PublicOperationParameterMapping[];
  provenance: Readonly<{
    publisher:
      | "provider_owned"
      | "ae_curated_external"
      | "third_party_gateway"
      | "observed_external";
    sourceKind:
      "ae_envelope" | "openapi_http" | "mcp" | "agent_plugin_mcp" | "x402";
  }>;
  integrated: boolean;
  routeable: boolean;
  answerExecutable: boolean;
  unavailableReason?: PublicCapabilityUnavailableReason;
  readiness: Readonly<{ observedAt?: number; validUntil?: number }>;
  searchTerms: readonly string[];
  snapshotKey: string;
}>;
export type CapabilityOperationSourcePort = Readonly<{
  listCurrent: (
    input: Readonly<{ networkId?: string; limit: number; now: number }>,
  ) => Promise<
    Readonly<{
      operations: readonly CapabilityOperationSourceRecord[];
      snapshotKey: string;
    }>
  >;
  loadCurrent: (
    operationRef: PublicOperationRef,
  ) => Promise<CapabilityOperationSourceRecord | null>;
  resolveMapping?: (
    mappingRef: RegisteredOperationMappingRef,
    networkId?: string,
  ) => Promise<RegisteredOperationMapping | null>;
}>;
export type OperationSearchTextCandidate<T> = Readonly<{
  value: T;
  operationRef: string;
  searchText: readonly string[];
}>;
export type OperationSearchRanking = Readonly<{
  operationRef: PublicOperationRef;
  rank: number;
  score: number;
}>;
type RankedOperationSearchTextCandidate<T> = OperationSearchTextCandidate<T> &
  Readonly<{ score: number }>;

export function rankOperationSearchText<T>(
  query: string,
  candidates: readonly OperationSearchTextCandidate<T>[],
): readonly T[] {
  return rankOperationSearchCandidates(query, candidates).map(
    ({ value }) => value,
  );
}

function rankOperationSearchCandidates<T>(
  query: string,
  candidates: readonly OperationSearchTextCandidate<T>[],
): readonly RankedOperationSearchTextCandidate<T>[] {
  const tokens = searchTokens(query);
  const exactMatches = candidates.filter(
    ({ searchText }) =>
      tokens.length === 0 ||
      tokens.every((token) =>
        searchableText(searchText).some(
          (term) => term === token || term.startsWith(token),
        ),
      ),
  );
  const matches =
    tokens.length === 0 || exactMatches.length > 0
      ? exactMatches
      : candidates.filter(({ searchText }) =>
          tokens.some((token) =>
            searchableText(searchText).some(
              (term) => term === token || term.startsWith(token),
            ),
          ),
        );
  return matches
    .map((candidate) => ({
      ...candidate,
      score: scoreSearchText(candidate.searchText, tokens),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.operationRef.localeCompare(right.operationRef),
    );
}
export type OperationSearchFilters = Readonly<{
  networkId?: string;
  location?: string;
  effects?: readonly PublicEffectPolicy[number]["class"][];
  dataUse?: readonly PublicDataUsePolicy[number]["classification"][];
  availability?: readonly PublicOperationAvailability["posture"][];
  currency?: string;
  maximumPrice?: ExactAmount;
}>;
export type OperationSearchInput = Readonly<{
  query: string;
  limit?: number;
  cursor?: string;
  filters?: OperationSearchFilters;
}>;
export type OperationSearchResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      items: readonly PublicOperationDescriptor[];
      matchedCount: number;
      ranking: readonly OperationSearchRanking[];
      pagination: Readonly<{
        limit: number;
        nextCursor?: string;
        hasMore: boolean;
      }>;
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "no_candidates";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      appliedFilters: OperationSearchFilters;
      matchedCount: number;
      ranking: readonly OperationSearchRanking[];
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        "query_invalid" | "source_unavailable" | "source_capacity_exceeded";
      navigation: readonly PublicOperationNavigationRelation[];
    }>;
export type OperationDetailInput = Readonly<{ operationRef: string }>;
export type OperationDetailResult =
  | Readonly<{
      kind: "found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operation: PublicOperationDescriptor;
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      reason: PublicCapabilityUnavailableReason;
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "not_found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      navigation: readonly PublicOperationNavigationRelation[];
    }>;
export type OperationComparisonValue =
  | string
  | PublicOperationPrice
  | PublicEffectPolicy
  | PublicDataUsePolicy
  | PublicOperationAvailability
  | Readonly<{
      publisher:
        | "provider_owned"
        | "ae_curated_external"
        | "third_party_gateway"
        | "observed_external";
      sourceKind:
        "ae_envelope" | "openapi_http" | "mcp" | "agent_plugin_mcp" | "x402";
    }>
  | PublicRecoveryPolicy;
export type OperationComparisonFact = Readonly<{
  field:
    | "summary"
    | "price"
    | "effects"
    | "dataUse"
    | "availability"
    | "provenance"
    | "recovery";
  values: readonly Readonly<{
    operationRef: PublicOperationRef;
    value: OperationComparisonValue;
    source: "publication" | "readiness" | "contract" | "catalog";
    observedAt?: number;
    validUntil?: number;
  }>[];
}>;
export type OperationCompareInput = Readonly<{
  operationRefs: readonly string[];
}>;
export type OperationCompareResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operations: readonly PublicOperationDescriptor[];
      facts: readonly OperationComparisonFact[];
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason: "query_invalid" | "operation_not_found" | "operation_unavailable";
      navigation: readonly PublicOperationNavigationRelation[];
    }>;
export type InspectPlanInput = Readonly<{
  operationRefs: readonly string[];
  mappingRefs?: readonly string[];
  expiresInMs?: number;
}>;
export type InspectPlanResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      inspectPlanRef: string;
      operationRefs: readonly PublicOperationRef[];
      mappingRefs: readonly RegisteredOperationMappingRef[];
      summary: Readonly<{
        maximumCost:
          | Readonly<{ kind: "known"; amount: ExactAmount }>
          | Readonly<{ kind: "requires_preparation" }>;
        dataUse: PublicDataUsePolicy;
        effects: PublicEffectPolicy;
        expiry: number;
      }>;
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        | "query_invalid"
        | "operation_not_found"
        | "operation_unavailable"
        | "mapping_unavailable"
        | "mapping_incompatible"
        | "mapping_cycle";
      navigation: readonly PublicOperationNavigationRelation[];
    }>;
export type OperationSurfaceWireDescriptor = {
  operationRef: PublicOperationRef;
  operationId: string;
  contract: {
    capabilityId: string;
    version: number;
    inputJsonSchema: string;
    outputJsonSchema: string;
    customerAnnotations: DeepWritable<
      PublicOperationDescriptor["contract"]["customerAnnotations"][number]
    >[];
    inputExamples?: DeepWritable<CapabilityInputExample[]>;
  };
  business: DeepWritable<PublicOperationBusinessRef>;
  offering: DeepWritable<PublicOperationOfferingRef>;
  summary: string;
  commercial: {
    price: DeepWritable<PublicOperationPrice>;
    priceEvidence?: DeepWritable<
      NonNullable<PublicCommercialTerms["priceEvidence"]>
    >;
    materialTerms: DeepWritable<
      PublicCommercialTerms["materialTerms"][number]
    >[];
    relationship: DeepWritable<PublicCommercialTerms["relationship"]>;
  };
  dataUse: DeepWritable<PublicDataUsePolicy[number]>[];
  effects: DeepWritable<PublicEffectPolicy[number]>[];
  evidence: DeepWritable<PublicEvidencePolicy[number]>[];
  cancellation: DeepWritable<PublicCancellationPolicy>;
  recovery: DeepWritable<PublicRecoveryPolicy>;
  authentication: DeepWritable<PublicOperationAuthentication>;
  transport: DeepWritable<PublicOperationTransport>;
  provenance: DeepWritable<PublicOperationDescriptor["provenance"]>;
  availability: DeepWritable<PublicOperationAvailability>;
  navigation: OperationSurfaceWireNavigation[];
  parameters?: DeepWritable<PublicOperationParameter[]>;
  catalogPrice?: DeepWritable<PublicOperationCatalogPrice>;
};
type DeepWritable<Value> = Value extends
  string | number | boolean | bigint | null | undefined
  ? Value
  : Value extends readonly (infer Item)[]
    ? DeepWritable<Item>[]
    : Value extends object
      ? {
          -readonly [Key in keyof Value]: DeepWritable<
            Exclude<Value[Key], undefined>
          >;
        }
      : Value;
type OperationSurfaceWireNavigation = DeepWritable<
  Omit<PublicOperationNavigationRelation, "inputSchema">
> & { inputSchema?: string };
type OperationSearchWireFilters = DeepWritable<OperationSearchFilters>;
type OperationComparisonWireFact = DeepWritable<OperationComparisonFact>;
type InspectPlanOk = Extract<InspectPlanResult, { kind: "ok" }>;
export type OperationSearchWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      items: OperationSurfaceWireDescriptor[];
      matchedCount: number;
      ranking: DeepWritable<OperationSearchRanking>[];
      pagination: { limit: number; nextCursor?: string; hasMore: boolean };
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "no_candidates";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      query: string;
      appliedFilters: OperationSearchWireFilters;
      matchedCount: number;
      ranking: DeepWritable<OperationSearchRanking>[];
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        "query_invalid" | "source_unavailable" | "source_capacity_exceeded";
      navigation: OperationSurfaceWireNavigation[];
    };
export type OperationDetailWireResult =
  | {
      kind: "found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operation: OperationSurfaceWireDescriptor;
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      reason: PublicCapabilityUnavailableReason;
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "not_found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      navigation: OperationSurfaceWireNavigation[];
    };
export type OperationCompareWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operations: OperationSurfaceWireDescriptor[];
      facts: OperationComparisonWireFact[];
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason: "query_invalid" | "operation_not_found" | "operation_unavailable";
      navigation: OperationSurfaceWireNavigation[];
    };
export type InspectPlanWireResult =
  | {
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      inspectPlanRef: string;
      operationRefs: PublicOperationRef[];
      mappingRefs: RegisteredOperationMappingRef[];
      summary: {
        maximumCost: DeepWritable<InspectPlanOk["summary"]["maximumCost"]>;
        dataUse: DeepWritable<PublicDataUsePolicy[number]>[];
        effects: DeepWritable<PublicEffectPolicy[number]>[];
        expiry: number;
      };
      navigation: OperationSurfaceWireNavigation[];
    }
  | {
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        | "query_invalid"
        | "operation_not_found"
        | "operation_unavailable"
        | "mapping_unavailable"
        | "mapping_incompatible"
        | "mapping_cycle";
      navigation: OperationSurfaceWireNavigation[];
    };
export type OperationSurfaceWireResult =
  | OperationSearchWireResult
  | OperationDetailWireResult
  | OperationCompareWireResult
  | InspectPlanWireResult;

const MAX_SOURCE = 256;
const MAX_QUERY = 200;
const MAX_CURSOR = 512;
const MAX_LIMIT = 20;
const MAX_COMPARISON = 4;
const MAX_PLAN = 4;
const MAX_MAPPING_REFS = 32;
const MAX_SCHEMA_BYTES = 65_536;
const MAX_SCHEMA_DEPTH = 24;
const MAX_SCHEMA_PROPERTIES = 128;
const MAX_SCHEMA_REFS = 64;
const SCHEMA_KEYS = new Set([
  "$defs",
  "$ref",
  "$schema",
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "contains",
  "default",
  "dependentRequired",
  "dependentSchemas",
  "deprecated",
  "description",
  "enum",
  "examples",
  "exclusiveMaximum",
  "exclusiveMinimum",
  "format",
  "if",
  "items",
  "maxContains",
  "maxItems",
  "maxLength",
  "maxProperties",
  "maximum",
  "minContains",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "multipleOf",
  "not",
  "oneOf",
  "pattern",
  "patternProperties",
  "prefixItems",
  "properties",
  "propertyNames",
  "readOnly",
  "required",
  "then",
  "title",
  "type",
  "unevaluatedItems",
  "unevaluatedProperties",
  "uniqueItems",
  "writeOnly",
]);
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "from",
  "get",
  "how",
  "in",
  "into",
  "is",
  "latest",
  "lookup",
  "of",
  "on",
  "or",
  "please",
  "search",
  "that",
  "the",
  "this",
  "to",
  "value",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
  "find",
  "current",
  "can",
  "i",
  "me",
  "tell",
  "data",
  "use",
  "want",
  "need",
  "live",
  "result",
  "results",
]);
const EXECUTE_NAVIGATION: PublicOperationNavigationRelation = {
  relation: "execute",
  method: "POST",
  actionId: "operation.execute",
  authentication: "none",
  surfaces: ["answerThread", "mcp"],
  precondition: "free_keyless_read_only",
};
const INVOKE_NAVIGATION: PublicOperationNavigationRelation = {
  relation: "invoke",
  pathTemplate: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
  actionId: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
  authentication: "required",
  surfaces: ["answerThread"],
};
type OperationAccessMode = "anonymous_execute" | "authenticated_invoke" | "inspect_only";

function operationNavigation(
  accessMode: OperationAccessMode,
): readonly PublicOperationNavigationRelation[] {
  return Object.freeze([
    operationMarketNavigation("search"),
    operationMarketNavigation("detail"),
    operationMarketNavigation("compare"),
    operationMarketNavigation("inspect_plan"),
    ...(accessMode === "anonymous_execute"
      ? [EXECUTE_NAVIGATION]
      : accessMode === "authenticated_invoke"
        ? [INVOKE_NAVIGATION]
        : []),
  ]);
}
function noOperationNavigation(): readonly PublicOperationNavigationRelation[] {
  return Object.freeze([
    operationMarketNavigation("search"),
    operationMarketNavigation("detail"),
  ]);
}

export async function searchCapabilityOperations(
  port: CapabilityOperationSourcePort,
  input: OperationSearchInput,
  now = Date.now(),
): Promise<OperationSearchResult> {
  const normalized = normalizeSearch(input);
  if (normalized === undefined) return searchUnavailable("query_invalid");
  const source = await port.listCurrent({
    ...(normalized.filters.networkId === undefined
      ? {}
      : { networkId: normalized.filters.networkId }),
    limit: MAX_SOURCE + 1,
    now,
  });
  if (source.operations.length > MAX_SOURCE)
    return searchUnavailable("source_capacity_exceeded");
  const cursor = decodeCursor(
    normalized.cursor,
    normalized.query,
    normalized.filters,
    source.snapshotKey,
  );
  if (normalized.cursor !== undefined && cursor === undefined)
    return searchUnavailable("query_invalid");
  const projectedMatches: Array<
    OperationSearchTextCandidate<PublicOperationDescriptor>
  > = [];
  for (const record of source.operations) {
    const operation = projectCapabilityOperation(record, now);
    if (matchesFilters(operation, normalized.filters)) {
      projectedMatches.push({
        value: operation,
        operationRef: operation.operationRef,
        searchText: operationSearchText(operation, record.searchTerms),
      });
    }
  }
  const matches = rankOperationSearchCandidates(
    normalized.query,
    projectedMatches,
  );
  const start =
    cursor?.lastOperationRef === undefined
      ? 0
      : Math.max(
          0,
          matches.findIndex(
            (item) => item.operationRef === cursor.lastOperationRef,
          ) + 1,
        );
  const pageMatches = matches.slice(start, start + normalized.limit);
  const items = pageMatches.map(({ value }) => value);
  const ranking = pageMatches.map(({ operationRef, score }, index) => ({
    operationRef: operationRef as PublicOperationRef,
    rank: start + index + 1,
    score,
  }));
  const lastItem = items.at(-1);
  if (lastItem === undefined)
    return {
      kind: "no_candidates",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      query: normalized.query,
      appliedFilters: normalized.filters,
      matchedCount: matches.length,
      ranking: [],
      navigation: noOperationNavigation(),
    };
  const hasMore = start + items.length < matches.length;
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    query: normalized.query,
    items,
    matchedCount: matches.length,
    ranking,
    pagination: {
      limit: normalized.limit,
      hasMore,
      ...(hasMore
        ? {
            nextCursor: encodeCursor(
              normalized.query,
              normalized.filters,
              source.snapshotKey,
              lastItem.operationRef,
            ),
          }
        : {}),
    },
    navigation: operationNavigation("inspect_only"),
  };
}

export async function detailCapabilityOperation(
  port: CapabilityOperationSourcePort,
  input: OperationDetailInput,
  now = Date.now(),
): Promise<OperationDetailResult> {
  if (!isPublicOperationRef(input.operationRef))
    return {
      kind: "not_found",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operationRef: input.operationRef,
      navigation: noOperationNavigation(),
    };
  const record = await port.loadCurrent(input.operationRef);
  if (record === null)
    return {
      kind: "not_found",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operationRef: input.operationRef,
      navigation: noOperationNavigation(),
    };
  const operation = projectCapabilityOperation(record, now);
  return operation.availability.posture === "unavailable"
    ? {
        kind: "unavailable",
        schemaVersion: PublicOperationRegistrySchemaVersion,
        operationRef: operation.operationRef,
        reason: operation.availability.reason ?? "not_supported_by_ae",
        navigation: noOperationNavigation(),
      }
    : {
        kind: "found",
        schemaVersion: PublicOperationRegistrySchemaVersion,
        operation,
      };
}

export async function compareCapabilityOperations(
  port: CapabilityOperationSourcePort,
  input: OperationCompareInput,
  now = Date.now(),
): Promise<OperationCompareResult> {
  const refs = normalizeRefs(input.operationRefs, MAX_COMPARISON);
  if (refs === undefined)
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "query_invalid",
      navigation: noOperationNavigation(),
    };
  const records = await Promise.all(refs.map((ref) => port.loadCurrent(ref)));
  const presentRecords = records.filter(
    (record): record is CapabilityOperationSourceRecord => record !== null,
  );
  if (presentRecords.length !== records.length)
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_not_found",
      navigation: noOperationNavigation(),
    };
  const operations = presentRecords.map((record) =>
    projectCapabilityOperation(record, now),
  );
  if (
    operations.some(
      (operation) => operation.availability.posture === "unavailable",
    )
  )
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_unavailable",
      navigation: noOperationNavigation(),
    };
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    operations,
    facts: comparisonFacts(operations),
    navigation: operationNavigation("inspect_only"),
  };
}

export async function inspectCapabilityOperationPlan(
  port: CapabilityOperationSourcePort,
  input: InspectPlanInput,
  now = Date.now(),
): Promise<InspectPlanResult> {
  const refs = normalizeRefs(input.operationRefs, MAX_PLAN);
  const mappingRefs =
    input.mappingRefs === undefined
      ? []
      : input.mappingRefs.length <= MAX_MAPPING_REFS &&
          input.mappingRefs.every(mappingRefIsValid)
        ? ([...new Set(input.mappingRefs)] as RegisteredOperationMappingRef[])
        : undefined;
  const expiresInMs = input.expiresInMs ?? 300_000;
  if (
    refs === undefined ||
    mappingRefs === undefined ||
    !Number.isSafeInteger(expiresInMs) ||
    expiresInMs < 1_000 ||
    expiresInMs > 86_400_000
  )
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "query_invalid",
      navigation: noOperationNavigation(),
    };
  const records = await Promise.all(refs.map((ref) => port.loadCurrent(ref)));
  const presentRecords = records.filter(
    (record): record is CapabilityOperationSourceRecord => record !== null,
  );
  if (presentRecords.length !== records.length)
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_not_found",
      navigation: noOperationNavigation(),
    };
  const operations = presentRecords.map((record) =>
    projectCapabilityOperation(record, now),
  );
  // A plan may only be produced against ops that are genuinely routeable right now.
  // Keyed ops whose credential/readiness is absent and observed x402 ops project as
  // 'integrated' (reason 'setup_required') but are NOT routeable; they must be
  // refused here rather than presented as a buildable plan (the commit/plan gate
  // already requires listRouteable, so this closes the registry preview surface too).
  if (
    operations.some(
      (operation) => operation.availability.posture !== "routeable",
    )
  )
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_unavailable",
      navigation: noOperationNavigation(),
    };
  const mappings: RegisteredOperationMapping[] = [];
  const networkIds = new Set(presentRecords.map((record) => record.networkId));
  const networkId = networkIds.size === 1 ? [...networkIds][0] : undefined;
  for (const mappingRef of mappingRefs) {
    const mapping =
      port.resolveMapping === undefined
        ? null
        : await port.resolveMapping(mappingRef, networkId);
    if (mapping === null)
      return {
        kind: "unavailable",
        schemaVersion: PublicOperationRegistrySchemaVersion,
        reason: "mapping_unavailable",
        navigation: noOperationNavigation(),
      };
    mappings.push(mapping);
  }
  if (!mappingsCompatible(mappings, presentRecords))
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "mapping_incompatible",
      navigation: noOperationNavigation(),
    };
  if (mappingCycle(mappings))
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "mapping_cycle",
      navigation: noOperationNavigation(),
    };
  const expiry = Math.min(
    now + expiresInMs,
    ...operations.map(
      (operation) => operation.availability.validUntil ?? now + expiresInMs,
    ),
  );
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    inspectPlanRef: `inspect-plan:v1:${canonicalDigest({ operationRefs: refs, mappingRefs, expiresAt: expiry }).slice(7)}`,
    operationRefs: refs,
    mappingRefs,
    summary: {
      maximumCost: aggregatePrice(
        operations.map((operation) => operation.commercial.price),
      ),
      dataUse: mergeDataUse(operations),
      effects: mergeEffects(operations),
      expiry,
    },
    navigation: operationNavigation("inspect_only"),
  };
}

export function projectCapabilityOperation(
  record: CapabilityOperationSourceRecord,
  now = Date.now(),
): PublicOperationDescriptor {
  const operationRef = createPublicOperationRef({
    operationId: record.operationId,
    publicationRef: record.publicationRef,
    publicationRevision: record.publicationRevision,
    contractRef: record.contract.ref,
  });
  const availability = projectAvailability(record, now);
  const inputJsonSchema = projectPublicSchema(record.contract.inputSchema);
  const parameters = projectParameters(
    inputJsonSchema,
    record.parameterMappings,
  );
  const catalogPrice = projectCatalogPrice(record.price);
  return {
    operationRef,
    operationId: record.operationId,
    contract: {
      capabilityId: record.contract.ref.capabilityId,
      version: record.contract.ref.version,
      inputJsonSchema,
      outputJsonSchema: projectPublicSchema(record.contract.outputSchema),
      customerAnnotations: record.contract.customerAnnotations.map(
        (annotation) => ({
          annotationId: annotation.annotationId,
          document: annotation.document,
          pointer: annotation.pointer,
          label: annotation.label,
          role: annotation.role,
          ...(annotation.semanticIdentity === undefined
            ? {}
            : { semanticIdentity: annotation.semanticIdentity }),
          ...(annotation.inference === undefined
            ? {}
            : { inference: annotation.inference }),
        }),
      ),
      ...(record.contract.inputExamples === undefined
        ? {}
        : { inputExamples: record.contract.inputExamples }),
    },
    business: record.business,
    offering: record.offering,
    summary: record.contract.description,
    commercial: {
      price: record.price,
      ...(record.priceEvidence === undefined
        ? {}
        : { priceEvidence: record.priceEvidence }),
      materialTerms: record.materialTerms,
      relationship: record.commercialRelationship,
    },
    dataUse: record.contract.dataUse.map((declaration) => ({
      effectId: declaration.effectId,
      inputPointer: declaration.inputPointer,
      classification: declaration.classification,
      phase: declaration.phase,
      recipient: declaration.recipient.kind,
      purposes: declaration.purposes,
    })),
    effects: record.contract.effects,
    evidence: record.contract.evidence,
    cancellation: record.cancellation,
    recovery: record.contract.lifecycle,
    authentication: record.authentication,
    transport: record.transport,
    provenance: record.provenance,
    availability,
    navigation:
      availability.posture === "unavailable"
        ? noOperationNavigation()
        : operationNavigation(
            availability.posture !== "routeable" ||
              record.authentication.kind === "unknown"
              ? "inspect_only"
              : record.answerExecutable &&
                  record.authentication.kind === "keyless" &&
                  record.provenance.sourceKind !== "x402"
                ? "anonymous_execute"
                : "authenticated_invoke",
          ),
    ...(parameters === undefined ? {} : { parameters }),
    ...(catalogPrice === undefined ? {} : { catalogPrice }),
  };
}

function projectParameters(
  schema: Readonly<Record<string, JsonValue>>,
  mappings: readonly PublicOperationParameterMapping[] | undefined,
): readonly PublicOperationParameter[] | undefined {
  const properties = schema.properties;
  if (!isRecord(properties)) return undefined;
  const requiredSet = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      if (typeof name === "string") requiredSet.add(name);
    }
  }
  const bindings = new Map(
    (mappings ?? []).map((binding) => [binding.inputPointer, binding]),
  );
  const seen = new Set<string>();
  const parameters: PublicOperationParameter[] = [];
  for (const [name, raw] of Object.entries(properties)) {
    const pointer = `/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    const binding = bindings.get(pointer);
    const node = isRecord(raw) ? raw : {};
    parameters.push(
      publicParameterFromSchema(node, name, requiredSet.has(name), binding),
    );
    seen.add(pointer);
  }
  for (const binding of mappings ?? []) {
    if (seen.has(binding.inputPointer)) continue;
    const publicName = contractInputNameFromPointer(binding.inputPointer);
    if (publicName === undefined) continue;
    const node = resolvePointedSchema(schema, binding.inputPointer) ?? {};
    parameters.push(
      publicParameterFromSchema(
        node,
        publicName,
        binding.required ?? false,
        binding,
      ),
    );
  }
  return parameters.length === 0 ? undefined : parameters;
}

function contractInputNameFromPointer(
  inputPointer: string,
): string | undefined {
  if (!inputPointer.startsWith("/") || inputPointer.length < 2)
    return undefined;
  const token = inputPointer.slice(inputPointer.lastIndexOf("/") + 1);
  if (token.length === 0) return undefined;
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function publicParameterFromSchema(
  node: Readonly<Record<string, JsonValue>>,
  defaultName: string,
  defaultRequired: boolean,
  binding?: PublicOperationParameterMapping,
): PublicOperationParameter {
  const example =
    node.example ??
    (Array.isArray(node.examples) ? node.examples[0] : undefined);
  return {
    group: binding?.group ?? "body",
    name: defaultName,
    type: typeof node.type === "string" ? node.type : "any",
    ...(typeof node.description === "string"
      ? { description: node.description }
      : {}),
    ...(example !== undefined ? { example: example as JsonValue } : {}),
    ...(Array.isArray(node.enum)
      ? {
          enumValues: node.enum.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    ...(node.default !== undefined
      ? { default: node.default as JsonValue }
      : {}),
    required: binding?.required ?? defaultRequired,
    ...(binding?.style === undefined ? {} : { style: binding.style }),
    ...(binding?.explode === undefined ? {} : { explode: binding.explode }),
  };
}

/**
 * Project the exact executable price into a decimal-string catalog price
 * (agentic.market `pricing{scheme}`). `fixed` -> exact amount; `range`
 * -> upto min/max; `on_request` has no derivable decimal amount -> absent.
 */
function projectCatalogPrice(
  price: PublicOperationPrice,
): PublicOperationCatalogPrice | undefined {
  if (price.kind === "fixed") {
    const amount = formatExactAmount(price.amount);
    return amount === undefined
      ? undefined
      : { scheme: "exact", amount, currency: price.amount.currency };
  }
  if (
    price.kind === "on_request" ||
    price.minimum.currency !== price.maximum.currency
  )
    return undefined;
  const commonExponent = Math.max(
    price.minimum.exponent,
    price.maximum.exponent,
  );
  const minimum = rescaleExactAmount(price.minimum, commonExponent);
  const maximum = rescaleExactAmount(price.maximum, commonExponent);
  if (minimum === undefined || maximum === undefined) return undefined;
  const minAmount = formatExactAmount(minimum);
  const maxAmount = formatExactAmount(maximum);
  return minAmount === undefined || maxAmount === undefined
    ? undefined
    : { scheme: "upto", minAmount, maxAmount, currency: minimum.currency };
}
export function serializeOperationDescriptor(
  operation: PublicOperationDescriptor,
): OperationSurfaceWireDescriptor {
  return {
    operationRef: operation.operationRef,
    operationId: operation.operationId,
    contract: {
      capabilityId: operation.contract.capabilityId,
      version: operation.contract.version,
      inputJsonSchema: JSON.stringify(operation.contract.inputJsonSchema),
      outputJsonSchema: JSON.stringify(operation.contract.outputJsonSchema),
      customerAnnotations: operation.contract.customerAnnotations.map(
        (annotation) => ({
          annotationId: annotation.annotationId,
          document: annotation.document,
          pointer: annotation.pointer,
          label: annotation.label,
          role: annotation.role,
          ...(annotation.semanticIdentity === undefined
            ? {}
            : { semanticIdentity: annotation.semanticIdentity }),
          ...(annotation.inference === undefined
            ? {}
            : { inference: annotation.inference }),
        }),
      ),
      ...(operation.contract.inputExamples === undefined
        ? {}
        : {
            inputExamples: serializeInputExamples(
              operation.contract.inputExamples,
            ),
          }),
    },
    business: {
      businessId: operation.business.businessId,
      slug: operation.business.slug,
      name: operation.business.name,
    },
    offering: {
      offeringRef: operation.offering.offeringRef,
      revision: operation.offering.revision,
      label: operation.offering.label,
      summary: operation.offering.summary,
    },
    summary: operation.summary,
    commercial: {
      price: serializePrice(operation.commercial.price),
      ...(operation.commercial.priceEvidence === undefined
        ? {}
        : {
            priceEvidence: serializePriceEvidence(
              operation.commercial.priceEvidence,
            ),
          }),
      materialTerms: operation.commercial.materialTerms.map((term) => ({
        label: term.label,
        value: term.value,
      })),
      relationship: {
        kind: operation.commercial.relationship.kind,
        summary: operation.commercial.relationship.summary,
      },
    },
    dataUse: operation.dataUse.map(serializeDataUse),
    effects: operation.effects.map(serializeEffect),
    evidence: operation.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      outputPointer: evidence.outputPointer,
      purpose: evidence.purpose,
    })),
    cancellation: { kind: operation.cancellation.kind },
    recovery: {
      idempotency: operation.recovery.idempotency,
      recovery: operation.recovery.recovery,
    },
    authentication: operation.authentication,
    transport: operation.transport,
    provenance: {
      publisher: operation.provenance.publisher,
      sourceKind: operation.provenance.sourceKind,
    },
    availability: serializeAvailability(operation.availability),
    navigation: serializeNavigation(operation.navigation),
    ...(operation.parameters === undefined
      ? {}
      : { parameters: operation.parameters.map(serializeParameter) }),
    ...(operation.catalogPrice === undefined
      ? {}
      : {
          catalogPrice: {
            scheme: operation.catalogPrice.scheme,
            ...(operation.catalogPrice.amount === undefined
              ? {}
              : { amount: operation.catalogPrice.amount }),
            ...(operation.catalogPrice.minAmount === undefined
              ? {}
              : { minAmount: operation.catalogPrice.minAmount }),
            ...(operation.catalogPrice.maxAmount === undefined
              ? {}
              : { maxAmount: operation.catalogPrice.maxAmount }),
            currency: operation.catalogPrice.currency,
          },
        }),
  };
}
function serializeInputExamples(
  examples: readonly CapabilityInputExample[],
): DeepWritable<CapabilityInputExample[]> {
  return examples.map((example) => ({
    ...(example.label === undefined ? {} : { label: example.label }),
    input: serializeJsonRecord(example.input),
  }));
}
function serializeJsonRecord(
  value: Readonly<Record<string, JsonValue>>,
): DeepWritable<Record<string, JsonValue>> {
  const result: DeepWritable<Record<string, JsonValue>> = {};
  for (const [key, item] of Object.entries(value))
    result[key] = serializeJsonValue(item);
  return result;
}
function serializeParameter(
  parameter: PublicOperationParameter,
): DeepWritable<PublicOperationParameter> {
  return {
    group: parameter.group,
    name: parameter.name,
    type: parameter.type,
    ...(parameter.description === undefined
      ? {}
      : { description: parameter.description }),
    ...(parameter.example === undefined
      ? {}
      : { example: serializeJsonValue(parameter.example) }),
    ...(parameter.enumValues === undefined
      ? {}
      : { enumValues: [...parameter.enumValues] }),
    ...(parameter.default === undefined
      ? {}
      : { default: serializeJsonValue(parameter.default) }),
    required: parameter.required,
    ...(parameter.style === undefined ? {} : { style: parameter.style }),
    ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
  };
}
function serializePriceEvidence(
  evidence: PublicOperationPriceEvidence,
): DeepWritable<PublicOperationPriceEvidence> {
  return {
    priceDigest: evidence.priceDigest,
    ...(evidence.sourceRef === undefined
      ? {}
      : { sourceRef: evidence.sourceRef }),
    evidenceRefs: [...evidence.evidenceRefs],
    ...(evidence.observedAt === undefined
      ? {}
      : { observedAt: evidence.observedAt }),
    ...(evidence.validUntil === undefined
      ? {}
      : { validUntil: evidence.validUntil }),
  };
}

/** Deep-clone a contained JsonValue into its mutable wire form (readonly→mutable). */
function serializeJsonValue(value: JsonValue): DeepWritable<JsonValue> {
  return JSON.parse(JSON.stringify(value)) as DeepWritable<JsonValue>;
}

export function deserializeOperationDescriptor(
  operation: OperationSurfaceWireDescriptor,
): PublicOperationDescriptor {
  return {
    operationRef: operation.operationRef,
    operationId: operation.operationId,
    contract: {
      capabilityId: operation.contract.capabilityId,
      version: operation.contract.version,
      inputJsonSchema: decodePublicSchema(operation.contract.inputJsonSchema),
      outputJsonSchema: decodePublicSchema(operation.contract.outputJsonSchema),
      customerAnnotations: operation.contract.customerAnnotations.map(
        (annotation) => ({
          annotationId: annotation.annotationId,
          document: annotation.document,
          pointer: annotation.pointer,
          label: annotation.label,
          role: annotation.role,
          ...(annotation.semanticIdentity === undefined
            ? {}
            : { semanticIdentity: annotation.semanticIdentity }),
          ...(annotation.inference === undefined
            ? {}
            : { inference: annotation.inference }),
        }),
      ),
      ...(operation.contract.inputExamples === undefined
        ? {}
        : {
            inputExamples: operation.contract.inputExamples.map((example) => ({
              ...(example.label === undefined ? {} : { label: example.label }),
              input: example.input,
            })),
          }),
    },
    business: operation.business,
    offering: operation.offering,
    summary: operation.summary,
    commercial: {
      price: operation.commercial.price,
      ...(operation.commercial.priceEvidence === undefined
        ? {}
        : { priceEvidence: operation.commercial.priceEvidence }),
      materialTerms: operation.commercial.materialTerms,
      relationship: operation.commercial.relationship,
    },
    dataUse: operation.dataUse,
    effects: operation.effects,
    evidence: operation.evidence,
    cancellation: operation.cancellation,
    recovery: operation.recovery,
    authentication: operation.authentication,
    transport: operation.transport,
    provenance: operation.provenance,
    availability: operation.availability,
    navigation: deserializeNavigation(operation.navigation),
    ...(operation.parameters === undefined
      ? {}
      : { parameters: operation.parameters }),
    ...(operation.catalogPrice === undefined
      ? {}
      : { catalogPrice: operation.catalogPrice }),
  };
}
export function serializeOperationSearchResult(
  result: OperationSearchResult,
): OperationSearchWireResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      query: result.query,
      items: result.items.map(serializeOperationDescriptor),
      matchedCount: result.matchedCount,
      ranking: result.ranking.map((entry) => ({
        operationRef: entry.operationRef,
        rank: entry.rank,
        score: entry.score,
      })),
      pagination: {
        limit: result.pagination.limit,
        hasMore: result.pagination.hasMore,
        ...(result.pagination.nextCursor === undefined
          ? {}
          : { nextCursor: result.pagination.nextCursor }),
      },
      navigation: serializeNavigation(result.navigation),
    };
  }
  if (result.kind === "no_candidates") {
    return {
      kind: "no_candidates",
      schemaVersion: result.schemaVersion,
      query: result.query,
      appliedFilters: serializeSearchFilters(result.appliedFilters),
      matchedCount: result.matchedCount,
      ranking: result.ranking.map((entry) => ({
        operationRef: entry.operationRef,
        rank: entry.rank,
        score: entry.score,
      })),
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: serializeNavigation(result.navigation),
  };
}

export function deserializeOperationSearchResult(
  result: OperationSearchWireResult,
): OperationSearchResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      query: result.query,
      items: result.items.map(deserializeOperationDescriptor),
      matchedCount: result.matchedCount,
      ranking: result.ranking,
      pagination: result.pagination,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  if (result.kind === "no_candidates") {
    return {
      kind: "no_candidates",
      schemaVersion: result.schemaVersion,
      query: result.query,
      appliedFilters: result.appliedFilters,
      matchedCount: result.matchedCount,
      ranking: result.ranking,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function serializeOperationDetailResult(
  result: OperationDetailResult,
): OperationDetailWireResult {
  if (result.kind === "found") {
    return {
      kind: "found",
      schemaVersion: result.schemaVersion,
      operation: serializeOperationDescriptor(result.operation),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      operationRef: result.operationRef,
      reason: result.reason,
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "not_found",
    schemaVersion: result.schemaVersion,
    operationRef: result.operationRef,
    navigation: serializeNavigation(result.navigation),
  };
}

export function deserializeOperationDetailResult(
  result: OperationDetailWireResult,
): OperationDetailResult {
  if (result.kind === "found") {
    return {
      kind: "found",
      schemaVersion: result.schemaVersion,
      operation: deserializeOperationDescriptor(result.operation),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      operationRef: result.operationRef,
      reason: result.reason,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "not_found",
    schemaVersion: result.schemaVersion,
    operationRef: result.operationRef,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function serializeOperationCompareResult(
  result: OperationCompareResult,
): OperationCompareWireResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      operations: result.operations.map(serializeOperationDescriptor),
      facts: result.facts.map((fact) => ({
        field: fact.field,
        values: fact.values.map((value) => ({
          operationRef: value.operationRef,
          value: serializeComparisonValue(value.value, fact.field),
          source: value.source,
          ...(value.observedAt === undefined
            ? {}
            : { observedAt: value.observedAt }),
          ...(value.validUntil === undefined
            ? {}
            : { validUntil: value.validUntil }),
        })),
      })),
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: serializeNavigation(result.navigation),
  };
}

export function deserializeOperationCompareResult(
  result: OperationCompareWireResult,
): OperationCompareResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      operations: result.operations.map(deserializeOperationDescriptor),
      facts: result.facts,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function serializeInspectPlanResult(
  result: InspectPlanResult,
): InspectPlanWireResult {
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      reason: result.reason,
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "ok",
    schemaVersion: result.schemaVersion,
    inspectPlanRef: result.inspectPlanRef,
    operationRefs: [...result.operationRefs],
    mappingRefs: [...result.mappingRefs],
    summary: {
      maximumCost:
        result.summary.maximumCost.kind === "known"
          ? { kind: "known", amount: { ...result.summary.maximumCost.amount } }
          : { kind: "requires_preparation" },
      dataUse: result.summary.dataUse.map(serializeDataUse),
      effects: result.summary.effects.map(serializeEffect),
      expiry: result.summary.expiry,
    },
    navigation: serializeNavigation(result.navigation),
  };
}

export function deserializeInspectPlanResult(
  result: InspectPlanWireResult,
): InspectPlanResult {
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      reason: result.reason,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "ok",
    schemaVersion: result.schemaVersion,
    inspectPlanRef: result.inspectPlanRef,
    operationRefs: result.operationRefs,
    mappingRefs: result.mappingRefs,
    summary: {
      maximumCost: result.summary.maximumCost,
      dataUse: result.summary.dataUse,
      effects: result.summary.effects,
      expiry: result.summary.expiry,
    },
    navigation: deserializeNavigation(result.navigation),
  };
}

function serializePrice(
  price: PublicOperationPrice,
): DeepWritable<PublicOperationPrice> {
  if (price.kind === "fixed")
    return { kind: "fixed", amount: { ...price.amount } };
  if (price.kind === "range")
    return {
      kind: "range",
      minimum: { ...price.minimum },
      maximum: { ...price.maximum },
    };
  return { kind: "on_request" };
}

function serializeDataUse(
  dataUse: PublicDataUsePolicy[number],
): DeepWritable<PublicDataUsePolicy[number]> {
  return {
    effectId: dataUse.effectId,
    inputPointer: dataUse.inputPointer,
    classification: dataUse.classification,
    phase: dataUse.phase,
    recipient: dataUse.recipient,
    purposes: [...dataUse.purposes],
  };
}

function serializeEffect(
  effect: PublicEffectPolicy[number],
): DeepWritable<PublicEffectPolicy[number]> {
  return {
    effectId: effect.effectId,
    class: effect.class,
    authority: effect.authority,
    reversibility: effect.reversibility,
  };
}

function serializeAvailability(
  availability: PublicOperationAvailability,
): DeepWritable<PublicOperationAvailability> {
  return {
    posture: availability.posture,
    ...(availability.observedAt === undefined
      ? {}
      : { observedAt: availability.observedAt }),
    ...(availability.validUntil === undefined
      ? {}
      : { validUntil: availability.validUntil }),
    ...(availability.reason === undefined
      ? {}
      : { reason: availability.reason }),
  };
}

function deserializeNavigation(
  navigation: readonly OperationSurfaceWireNavigation[],
): PublicOperationNavigationRelation[] {
  return navigation.map(({ inputSchema, ...relation }) => ({
    ...relation,
    ...(inputSchema === undefined
      ? {}
      : { inputSchema: decodePublicSchema(inputSchema) }),
  }));
}

function serializeNavigation(
  navigation: readonly PublicOperationNavigationRelation[],
): OperationSurfaceWireNavigation[] {
  return navigation.map((relation) => ({
    relation: relation.relation,
    ...(relation.pathTemplate === undefined
      ? {}
      : { pathTemplate: relation.pathTemplate }),
    method: relation.method,
    actionId: relation.actionId,
    authentication: relation.authentication,
    ...(relation.inputSchema === undefined
      ? {}
      : { inputSchema: JSON.stringify(relation.inputSchema) }),
    ...(relation.surfaces === undefined
      ? {}
      : { surfaces: [...relation.surfaces] }),
    ...(relation.precondition === undefined
      ? {}
      : { precondition: relation.precondition }),
  }));
}

function serializeSearchFilters(
  filters: OperationSearchFilters,
): OperationSearchWireFilters {
  return {
    ...(filters.networkId === undefined
      ? {}
      : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: [...filters.effects] }),
    ...(filters.dataUse === undefined ? {} : { dataUse: [...filters.dataUse] }),
    ...(filters.availability === undefined
      ? {}
      : { availability: [...filters.availability] }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined
      ? {}
      : { maximumPrice: { ...filters.maximumPrice } }),
  };
}

function serializeComparisonValue(
  value: OperationComparisonValue,
  field: OperationComparisonFact["field"],
): DeepWritable<OperationComparisonValue> {
  if (field === "summary") {
    if (typeof value !== "string")
      throw new Error("operation_comparison_value_invalid");
    return value;
  }
  if (field === "price") {
    if (!isPublicOperationPrice(value))
      throw new Error("operation_comparison_value_invalid");
    return serializePrice(value);
  }
  if (field === "effects") {
    if (!isPublicEffectPolicy(value))
      throw new Error("operation_comparison_value_invalid");
    return value.map(serializeEffect);
  }
  if (field === "dataUse") {
    if (!isPublicDataUsePolicy(value))
      throw new Error("operation_comparison_value_invalid");
    return value.map(serializeDataUse);
  }
  if (field === "availability") {
    if (!isPublicAvailability(value))
      throw new Error("operation_comparison_value_invalid");
    return serializeAvailability(value);
  }
  if (field === "provenance") {
    if (!isPublicProvenance(value))
      throw new Error("operation_comparison_value_invalid");
    return { publisher: value.publisher, sourceKind: value.sourceKind };
  }
  if (!isPublicRecoveryPolicy(value))
    throw new Error("operation_comparison_value_invalid");
  return { idempotency: value.idempotency, recovery: value.recovery };
}

function isPublicOperationPrice(value: unknown): value is PublicOperationPrice {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "on_request") return true;
  if (value.kind === "fixed")
    return exactAmountSchema.safeParse(value.amount).success;
  return (
    value.kind === "range" &&
    exactAmountSchema.safeParse(value.minimum).success &&
    exactAmountSchema.safeParse(value.maximum).success
  );
}

function isPublicEffectPolicy(value: unknown): value is PublicEffectPolicy {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.effectId === "string" &&
        (item.class === "data_release" ||
          item.class === "financial_exposure" ||
          item.class === "external_state_change") &&
        (item.authority === "none" ||
          item.authority === "explicit" ||
          item.authority === "mandate_or_explicit") &&
        (item.reversibility === "not_applicable" ||
          item.reversibility === "reversible" ||
          item.reversibility === "conditional" ||
          item.reversibility === "irreversible"),
    )
  );
}

function isPublicDataUsePolicy(value: unknown): value is PublicDataUsePolicy {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => {
      if (
        !isRecord(item) ||
        typeof item.effectId !== "string" ||
        typeof item.inputPointer !== "string" ||
        (item.classification !== "public" &&
          item.classification !== "personal" &&
          item.classification !== "sensitive" &&
          item.classification !== "credential") ||
        (item.phase !== "preparation" && item.phase !== "execution") ||
        (item.recipient !== "candidate_binding" &&
          item.recipient !== "selected_binding" &&
          item.recipient !== "named_recipient") ||
        !Array.isArray(item.purposes) ||
        !item.purposes.every((purpose: unknown) => typeof purpose === "string")
      ) {
        return false;
      }
      return true;
    })
  );
}

function isPublicAvailability(
  value: unknown,
): value is PublicOperationAvailability {
  if (
    !isRecord(value) ||
    (value.posture !== "integrated" &&
      value.posture !== "routeable" &&
      value.posture !== "unavailable")
  )
    return false;
  if (value.observedAt !== undefined && typeof value.observedAt !== "number")
    return false;
  if (value.validUntil !== undefined && typeof value.validUntil !== "number")
    return false;
  return (
    value.reason === undefined ||
    value.reason === "setup_required" ||
    value.reason === "temporarily_unavailable" ||
    value.reason === "readiness_expired" ||
    value.reason === "publisher_withdrew" ||
    value.reason === "under_review" ||
    value.reason === "updated_terms_require_review" ||
    value.reason === "not_supported_by_ae"
  );
}

function isPublicProvenance(
  value: unknown,
): value is PublicOperationDescriptor["provenance"] {
  return (
    isRecord(value) &&
    (value.publisher === "provider_owned" ||
      value.publisher === "ae_curated_external" ||
      value.publisher === "third_party_gateway" ||
      value.publisher === "observed_external") &&
    (value.sourceKind === "ae_envelope" ||
      value.sourceKind === "openapi_http" ||
      value.sourceKind === "mcp" ||
      value.sourceKind === "agent_plugin_mcp" ||
      value.sourceKind === "x402")
  );
}

function isPublicRecoveryPolicy(value: unknown): value is PublicRecoveryPolicy {
  return (
    isRecord(value) &&
    (value.idempotency === "not_applicable" ||
      value.idempotency === "required") &&
    (value.recovery === "retry_safe" || value.recovery === "reconcile_required")
  );
}

function decodePublicSchema(
  serialized: string,
): Readonly<Record<string, JsonValue>> {
  if (new TextEncoder().encode(serialized).byteLength > MAX_SCHEMA_BYTES) {
    throw new Error("operation_public_schema_wire_too_large");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("operation_public_schema_wire_invalid");
  }
  const checked = jsonValueSchema.safeParse(parsed);
  if (!checked.success || !isRecord(checked.data)) {
    throw new Error("operation_public_schema_wire_invalid");
  }
  return projectPublicSchema(
    checked.data as Readonly<Record<string, JsonValue>>,
  );
}

function searchUnavailable(
  reason: "query_invalid" | "source_unavailable" | "source_capacity_exceeded",
): OperationSearchResult {
  return {
    kind: "unavailable",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    reason,
    navigation: noOperationNavigation(),
  };
}
function projectAvailability(
  record: CapabilityOperationSourceRecord,
  now: number,
): PublicOperationAvailability {
  const { observedAt, validUntil } = record.readiness;
  if (record.routeable && validUntil !== undefined && validUntil > now)
    return {
      posture: "routeable",
      ...(observedAt === undefined ? {} : { observedAt }),
      validUntil,
    };
  const reason =
    validUntil !== undefined && validUntil <= now
      ? ("readiness_expired" as const)
      : (record.unavailableReason ?? "setup_required");
  return {
    posture: record.integrated ? "integrated" : "unavailable",
    ...(observedAt === undefined ? {} : { observedAt }),
    ...(validUntil === undefined ? {} : { validUntil }),
    reason,
  };
}
function normalizeSearch(input: OperationSearchInput):
  | Readonly<{
      query: string;
      limit: number;
      cursor?: string;
      filters: OperationSearchFilters;
    }>
  | undefined {
  if (typeof input.query !== "string" || input.query.trim().length > MAX_QUERY)
    return undefined;
  const limit = input.limit ?? MAX_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_LIMIT ||
    (input.cursor !== undefined &&
      (input.cursor.length === 0 || input.cursor.length > MAX_CURSOR))
  )
    return undefined;
  const filters = input.filters ?? {};
  if (filters.currency !== undefined && !/^[A-Z]{3}$/.test(filters.currency))
    return undefined;
  if (
    filters.maximumPrice !== undefined &&
    !exactAmountSchema.safeParse(filters.maximumPrice).success
  )
    return undefined;
  return {
    query: input.query.trim().toLowerCase(),
    limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    filters: {
      ...(filters.networkId === undefined
        ? {}
        : { networkId: filters.networkId.trim() }),
      ...(filters.location === undefined
        ? {}
        : { location: filters.location.trim().toLowerCase() }),
      ...(filters.effects === undefined
        ? {}
        : { effects: [...new Set(filters.effects)] }),
      ...(filters.dataUse === undefined
        ? {}
        : { dataUse: [...new Set(filters.dataUse)] }),
      ...(filters.availability === undefined
        ? {}
        : { availability: [...new Set(filters.availability)] }),
      ...(filters.currency === undefined ? {} : { currency: filters.currency }),
      ...(filters.maximumPrice === undefined
        ? {}
        : { maximumPrice: { ...filters.maximumPrice } }),
    },
  };
}
function matchesFilters(
  operation: PublicOperationDescriptor,
  filters: OperationSearchFilters,
): boolean {
  if (
    filters.effects !== undefined &&
    !filters.effects.some((effect) =>
      operation.effects.some((candidate) => candidate.class === effect),
    )
  )
    return false;
  if (
    filters.dataUse !== undefined &&
    !filters.dataUse.some((classification) =>
      operation.dataUse.some(
        (candidate) => candidate.classification === classification,
      ),
    )
  )
    return false;
  if (
    filters.availability !== undefined &&
    !filters.availability.includes(operation.availability.posture)
  )
    return false;
  if (filters.currency !== undefined) {
    const currency =
      operation.commercial.price.kind === "on_request"
        ? undefined
        : operation.commercial.price.kind === "fixed"
          ? operation.commercial.price.amount.currency
          : operation.commercial.price.minimum.currency;
    if (currency !== filters.currency) return false;
  }
  if (
    filters.maximumPrice !== undefined &&
    !priceWithin(operation.commercial.price, filters.maximumPrice)
  )
    return false;
  if (
    filters.location !== undefined &&
    !`${operation.business.slug} ${operation.business.name}`
      .toLowerCase()
      .includes(filters.location)
  )
    return false;
  return true;
}
function searchTokens(query: string): string[] {
  return (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => !SEARCH_STOP_WORDS.has(token),
  );
}
function searchableText(searchText: readonly string[]): string[] {
  return (
    searchText
      .join(" ")
      .toLowerCase()
      .match(/[a-z0-9]+/g) ?? []
  );
}
function operationSearchText(
  operation: PublicOperationDescriptor,
  searchTerms: readonly string[],
): readonly string[] {
  return [
    operation.operationId,
    operation.contract.capabilityId,
    operation.summary,
    operation.business.slug,
    operation.business.name,
    operation.offering.label,
    operation.offering.summary,
    ...operation.contract.customerAnnotations.map(
      (annotation) => annotation.label,
    ),
    ...searchTerms,
  ];
}
function scoreSearchText(
  searchText: readonly string[],
  tokens: readonly string[],
): number {
  return tokens.reduce(
    (total, token) =>
      total +
      searchableText(searchText).reduce(
        (best, term) =>
          term === token
            ? Math.max(best, 4)
            : term.startsWith(token)
              ? Math.max(best, 2)
              : term.includes(token)
                ? Math.max(best, 1)
                : best,
        0,
      ),
    0,
  );
}
function priceWithin(
  price: PublicCommercialTerms["price"],
  maximum: ExactAmount,
): boolean {
  if (price.kind === "on_request") return false;
  const candidate = price.kind === "fixed" ? price.amount : price.minimum;
  const comparison = compareExactAmounts(candidate, maximum);
  return comparison !== undefined && comparison <= 0;
}
function normalizeRefs(
  values: readonly string[],
  max: number,
): PublicOperationRef[] | undefined {
  return values.length >= 1 &&
    values.length <= max &&
    new Set(values).size === values.length &&
    values.every(isPublicOperationRef)
    ? (values as PublicOperationRef[])
    : undefined;
}
function mappingRefIsValid(
  value: string,
): value is RegisteredOperationMappingRef {
  return /^mapping:v1:[0-9a-f]{64}$/.test(value);
}
function comparisonFacts(
  operations: readonly PublicOperationDescriptor[],
): OperationComparisonFact[] {
  const fields: OperationComparisonFact["field"][] = [
    "summary",
    "price",
    "effects",
    "dataUse",
    "availability",
    "provenance",
    "recovery",
  ];
  return fields.map((field) => ({
    field,
    values: operations.map((operation) => ({
      operationRef: operation.operationRef,
      value: comparisonValue(operation, field),
      source:
        field === "availability"
          ? ("readiness" as const)
          : field === "price"
            ? ("catalog" as const)
            : field === "provenance"
              ? ("publication" as const)
              : ("contract" as const),
      ...(operation.availability.observedAt === undefined
        ? {}
        : { observedAt: operation.availability.observedAt }),
      ...(operation.availability.validUntil === undefined
        ? {}
        : { validUntil: operation.availability.validUntil }),
    })),
  }));
}
function comparisonValue(
  operation: PublicOperationDescriptor,
  field: OperationComparisonFact["field"],
): OperationComparisonValue {
  if (field === "summary") return operation.summary;
  if (field === "price") return operation.commercial.price;
  if (field === "effects") return operation.effects;
  if (field === "dataUse") return operation.dataUse;
  if (field === "availability") return operation.availability;
  if (field === "provenance") return operation.provenance;
  return operation.recovery;
}
function aggregatePrice(
  prices: readonly PublicCommercialTerms["price"][],
):
  | Readonly<{ kind: "known"; amount: ExactAmount }>
  | Readonly<{ kind: "requires_preparation" }> {
  let amount: ExactAmount | undefined;
  for (const price of prices) {
    if (price.kind === "on_request") return { kind: "requires_preparation" };
    const candidate = price.kind === "fixed" ? price.amount : price.maximum;
    amount =
      amount === undefined ? candidate : addExactAmounts(amount, candidate);
    if (amount === undefined) return { kind: "requires_preparation" };
  }
  return amount === undefined
    ? { kind: "requires_preparation" }
    : { kind: "known", amount };
}
function mergeDataUse(
  operations: readonly PublicOperationDescriptor[],
): PublicDataUsePolicy {
  return dedupe(operations.flatMap((operation) => operation.dataUse));
}
function mergeEffects(
  operations: readonly PublicOperationDescriptor[],
): PublicEffectPolicy {
  return dedupe(operations.flatMap((operation) => operation.effects));
}
function dedupe<T>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const digest = canonicalDigest(value as JsonValue);
    if (seen.has(digest)) return false;
    seen.add(digest);
    return true;
  });
}
function mappingsCompatible(
  mappings: readonly RegisteredOperationMapping[],
  records: readonly CapabilityOperationSourceRecord[],
): boolean {
  const contracts = new Map(
    records.map((record) => [
      `${record.contract.ref.capabilityId}:${record.contract.ref.version}`,
      record.contract,
    ]),
  );
  return mappings.every((mapping) => {
    const source = contracts.get(
      `${mapping.sourceContractRef.capabilityId}:${mapping.sourceContractRef.version}`,
    );
    const target = contracts.get(
      `${mapping.targetContractRef.capabilityId}:${mapping.targetContractRef.version}`,
    );
    if (
      source === undefined ||
      target === undefined ||
      source.ref.contractDigest !== mapping.sourceContractRef.contractDigest ||
      target.ref.contractDigest !== mapping.targetContractRef.contractDigest
    ) {
      return false;
    }
    const sourcePointer =
      mapping.kind === "array_project"
        ? mapping.sourceArrayPointer
        : mapping.sourceOutputPointer;
    const targetPointer =
      mapping.kind === "array_project"
        ? mapping.targetArrayPointer
        : mapping.targetInputPointer;
    const sourceSchema = resolvePointedSchema(
      source.outputSchema,
      sourcePointer,
    );
    const targetSchema = resolvePointedSchema(
      target.inputSchema,
      targetPointer,
    );
    if (
      sourceSchema === undefined ||
      targetSchema === undefined ||
      canonicalDigest(sourceSchema as StableHashValue) !==
        mapping.sourceSchemaIdentity ||
      canonicalDigest(targetSchema as StableHashValue) !==
        mapping.targetSchemaIdentity
    ) {
      return false;
    }
    return (
      mapping.kind !== "array_project" ||
      resolvePointedSchema(
        source.outputSchema,
        `${mapping.sourceArrayPointer}/0${mapping.sourceItemPointer}`,
      ) !== undefined
    );
  });
}
function mappingCycle(
  mappings: readonly RegisteredOperationMapping[],
): boolean {
  const graph = new Map<string, string[]>();
  for (const mapping of mappings) {
    const source =
      mapping.sourceContractRef.capabilityId +
      ":" +
      mapping.sourceContractRef.version;
    const target =
      mapping.targetContractRef.capabilityId +
      ":" +
      mapping.targetContractRef.version;
    graph.set(source, [...(graph.get(source) ?? []), target]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if ((graph.get(node) ?? []).some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
}
function encodeCursor(
  query: string,
  filters: OperationSearchFilters,
  snapshotKey: string,
  lastOperationRef: PublicOperationRef,
): string {
  return `cursor:v1:${canonicalDigest({ query, filters, snapshotKey, lastOperationRef }).slice(7)}:${encodeURIComponent(snapshotKey)}:${encodeURIComponent(lastOperationRef)}`;
}
type CursorPayload = Readonly<{ lastOperationRef?: PublicOperationRef }>;
function decodeCursor(
  cursor: string | undefined,
  query: string,
  filters: OperationSearchFilters,
  snapshotKey: string,
): CursorPayload | undefined {
  if (cursor === undefined) return {};
  const match = /^cursor:v1:([0-9a-f]{64}):([^:]*):(.+)$/.exec(cursor);
  if (match === null) return undefined;
  const digest = match[1];
  const encodedSnapshot = match[2];
  const encodedRef = match[3];
  if (
    digest === undefined ||
    encodedSnapshot === undefined ||
    encodedRef === undefined
  )
    return undefined;
  let cursorSnapshot: string;
  let lastRef: string;
  try {
    cursorSnapshot = decodeURIComponent(encodedSnapshot);
    lastRef = decodeURIComponent(encodedRef);
  } catch {
    return undefined;
  }
  if (cursorSnapshot !== snapshotKey || !isPublicOperationRef(lastRef))
    return undefined;
  return canonicalDigest({
    query,
    filters,
    snapshotKey: cursorSnapshot,
    lastOperationRef: lastRef,
  }).slice(7) === digest
    ? { lastOperationRef: lastRef }
    : undefined;
}
function projectPublicSchema(
  schema: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  const state = { depth: 0, properties: 0, refs: 0 };
  const projected = projectSchemaValue(schema, state);
  if (
    new TextEncoder().encode(JSON.stringify(projected)).byteLength >
    MAX_SCHEMA_BYTES
  )
    throw new Error("operation_public_schema_too_large");
  return projected as Readonly<Record<string, JsonValue>>;
}
function projectSchemaValue(
  value: JsonValue,
  state: { depth: number; properties: number; refs: number },
): JsonValue {
  if (state.depth > MAX_SCHEMA_DEPTH)
    throw new Error("operation_public_schema_too_deep");
  if (Array.isArray(value)) {
    state.depth += 1;
    const result = value.map((item) => projectSchemaValue(item, state));
    state.depth -= 1;
    return result;
  }
  if (!isRecord(value)) return value;
  state.depth += 1;
  const object = value as Readonly<Record<string, JsonValue>>;
  const result: Record<string, JsonValue> = {};
  for (const [key, child] of Object.entries(object)) {
    if (!SCHEMA_KEYS.has(key))
      throw new Error("operation_public_schema_keyword_unsupported");
    if (key === "$ref") {
      state.refs += 1;
      if (
        state.refs > MAX_SCHEMA_REFS ||
        typeof child !== "string" ||
        !child.startsWith("#/")
      ) {
        throw new Error("operation_public_schema_ref_invalid");
      }
    }
    if (
      key === "properties" ||
      key === "$defs" ||
      key === "patternProperties"
    ) {
      if (!isRecord(child))
        throw new Error("operation_public_schema_properties_invalid");
      const childObject = child as Readonly<Record<string, JsonValue>>;
      state.properties += Object.keys(childObject).length;
      if (state.properties > MAX_SCHEMA_PROPERTIES)
        throw new Error("operation_public_schema_properties_exceeded");
      result[key] = Object.fromEntries(
        Object.entries(childObject).map(([childKey, childValue]) => [
          childKey,
          projectSchemaValue(childValue, state),
        ]),
      );
    } else {
      result[key] = projectSchemaValue(child, state);
    }
  }
  state.depth -= 1;
  return result;
}
