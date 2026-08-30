import type {
  CapabilityContract,
  CapabilityInputExample,
  JsonValue,
} from "@/modules/capability-contract/public";
import type { ExactAmount } from "@/modules/money/public";
import type {
  PublicOperationRef,
  RegisteredOperationMapping,
  RegisteredOperationMappingRef,
} from "../public";
import type { X402CatalogPayment } from "./transport-adapters";

export const CURRENT_OPERATION_CALL_VIA = "/api/v1/operations/call" as const;
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
export type PublicOperationPriceBreakdown = Readonly<{
  providerQuotedAmount: ExactAmount;
  agenticEconomyFee: ExactAmount;
  totalBuyerAuthorization: ExactAmount;
  network: "eip155:8453";
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
}>;
export type PublicCommercialTerms = Readonly<{
  price: PublicOperationPrice;
  priceEvidence?: PublicOperationPriceEvidence;
  priceBreakdown?: PublicOperationPriceBreakdown;
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
  | Readonly<{ kind: "ae_api_key" }>
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
    "ui" | "http" | "agentJson" | "chat" | "cli" | "mcp"
  )[];
  precondition?: string;
}>;
type PublicOperationNavigationFor<
  Relation extends PublicOperationNavigationRelation["relation"],
> = PublicOperationNavigationRelation & Readonly<{ relation: Relation }>;
export type OperationProjectionNavigationContract = Readonly<{
  market: Readonly<{
    search: PublicOperationNavigationFor<"search">;
    detail: PublicOperationNavigationFor<"detail">;
    compare: PublicOperationNavigationFor<"compare">;
    inspectPlan: PublicOperationNavigationFor<"inspect_plan">;
  }>;
  invoke: PublicOperationNavigationFor<"invoke"> &
    Readonly<{
      pathTemplate: typeof CURRENT_OPERATION_CALL_VIA;
      method: "POST";
      authentication: "required";
    }>;
}>;
export type PublicOperationDescriptor = Readonly<{
  operationRef: PublicOperationRef;
  operationId: string;
  callVia: typeof CURRENT_OPERATION_CALL_VIA;
  paymentLane: "brokered";
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
  priceBreakdown?: PublicOperationPriceBreakdown;
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
  unavailableReason?: PublicCapabilityUnavailableReason;
  readiness: Readonly<{ observedAt?: number; validUntil?: number }>;
  searchTerms: readonly string[];
  snapshotKey: string;
}>;
export type CapabilityOperationSourcePort = Readonly<{
  navigation: OperationProjectionNavigationContract;
  listCurrent: (
    input: Readonly<{ networkId?: string; limit: number; now: number }>,
  ) => Promise<
    Readonly<{
      operations: readonly CapabilityOperationSourceRecord[];
      sourceCount: number;
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
