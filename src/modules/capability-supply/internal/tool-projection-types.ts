import type {
  CapabilityContract,
  CapabilityInputExample,
  JsonValue,
} from "@/modules/capability-contract/public";
import type { ExactAmount } from "@/modules/money/public";
import type { PublicToolRef } from "../public";
import type { X402CatalogPayment } from "./transport-adapters";

export const CURRENT_TOOL_CALL_VIA = "/api/v1/tools/call" as const;
export const PublicToolRegistrySchemaVersion =
  "registry-tools:v1" as const;
export type PublicToolRegistrySchemaVersion =
  typeof PublicToolRegistrySchemaVersion;
export type PublicToolBusinessRef = Readonly<{
  businessId: string;
  slug: string;
  name: string;
}>;
export type PublicToolOfferingRef = Readonly<{
  offeringRef: string;
  revision: number;
  label: string;
  summary: string;
}>;
export type PublicToolPrice =
  | Readonly<{ kind: "fixed"; amount: ExactAmount }>
  | Readonly<{ kind: "range"; minimum: ExactAmount; maximum: ExactAmount }>
  | Readonly<{ kind: "on_request" }>;
export type PublicToolPriceEvidence = Readonly<{
  priceDigest: string;
  sourceRef?: string;
  evidenceRefs: readonly string[];
  observedAt?: number;
  validUntil?: number;
}>;
export type PublicToolPriceBreakdown = Readonly<{
  providerQuotedAmount: ExactAmount;
  agenticEconomyFee: ExactAmount;
  totalBuyerAuthorization: ExactAmount;
  network: "eip155:8453";
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
}>;
export type PublicToolDisplayPrice =
  | Readonly<{ kind: "indicative"; amount: ExactAmount; rateObservedAt: number; validUntil: number }>
  | Readonly<{ kind: "unavailable"; reason: "upstream_price_missing" | "fx_missing" | "fx_stale" | "unsupported_payment" }>;
export type PublicCommercialTerms = Readonly<{
  price: PublicToolPrice;
  displayPrice?: PublicToolDisplayPrice;
  priceEvidence?: PublicToolPriceEvidence;
  priceBreakdown?: PublicToolPriceBreakdown;
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
  | "inspection_required"
  | "temporarily_unavailable"
  | "readiness_expired"
  | "publisher_withdrew"
  | "under_review"
  | "updated_terms_require_review"
  | "not_supported_by_ae";
/**
 * Flat, self-describing catalog parameter (catalogue `parameters[]`),
 * additive to the execution contract's `inputJsonSchema`.
 */
export type PublicToolParameter = Readonly<{
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

export type PublicToolCatalogPrice = Readonly<{
  scheme: "exact" | "upto";
  amount?: string;
  minAmount?: string;
  maxAmount?: string;
  currency: string;
}>;
export type PublicToolAuthentication =
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
export type PublicToolTransport = Readonly<{
  method: "GET" | "POST";
  pathTemplate?: string;
  responseStatus?: number;
  responseContentType?: string;
  requestTimeoutMs: number;
}>;
export type PublicToolPayment = Readonly<{
  protocol: "x402";
  scheme: "exact";
  network: string;
  asset: string;
  currency: string;
}>;
export type PublicToolReadiness = Readonly<{
  observedAt?: number;
  validUntil?: number;
}>;

/**
 * The W1 origin seam: each catalog access path has its own exact admitted
 * operation entry. Endpoint URLs remain in this server-side linkage seam;
 * operation search/detail descriptors never carry them.
 */
export type CatalogOfferingToolMapEntry = Readonly<{
  offeringRef: string;
  offeringRevision: number;
  offeringSourceHash: string;
  declaredAccessPathRef: string;
  accessPathSourceHash: string;
  endpointUrl: string;
  method: "GET" | "POST";
  authorityMode: PublicToolDescriptor["provenance"]["publisher"];
  sourceKind: PublicToolDescriptor["provenance"]["sourceKind"];
  authentication: PublicToolAuthentication;
  routeable: boolean;
  readiness: PublicToolReadiness;
  toolRef: PublicToolRef;
  parameters?: readonly PublicToolParameter[];
  catalogPrice?: PublicToolCatalogPrice;
  payment?: X402CatalogPayment;
}>;
export type PublicToolAvailability = Readonly<{
  posture: "setup_required" | "routeable" | "unavailable";
  observedAt?: number;
  validUntil?: number;
  lastHealthyAt?: number;
  reason?: PublicCapabilityUnavailableReason;
}>;
export type PublicToolNavigationRelation = Readonly<{
  relation:
    | "search"
    | "list"
    | "describe"
    | "compare"
    | "call"
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
type PublicToolNavigationFor<
  Relation extends PublicToolNavigationRelation["relation"],
> = PublicToolNavigationRelation & Readonly<{ relation: Relation }>;
export type ToolProjectionNavigationContract = Readonly<{
  market: Readonly<{
    list: PublicToolNavigationFor<"list">;
    search: PublicToolNavigationFor<"search">;
    describe: PublicToolNavigationFor<"describe">;
    compare: PublicToolNavigationFor<"compare">;
  }>;
  call: PublicToolNavigationFor<"call"> &
    Readonly<{
      pathTemplate: typeof CURRENT_TOOL_CALL_VIA;
      method: "POST";
      authentication: "required";
    }>;
}>;
export type PublicToolDescriptor = Readonly<{
  toolRef: PublicToolRef;
  toolId: string;
  callVia: typeof CURRENT_TOOL_CALL_VIA;
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
  business: PublicToolBusinessRef;
  offering: PublicToolOfferingRef;
  summary: string;
  commercial: PublicCommercialTerms;
  dataUse: PublicDataUsePolicy;
  effects: PublicEffectPolicy;
  evidence: PublicEvidencePolicy;
  cancellation: PublicCancellationPolicy;
  recovery: PublicRecoveryPolicy;
  authentication: PublicToolAuthentication;
  payment?: PublicToolPayment;
  transport: PublicToolTransport;
  provenance: Readonly<{
    publisher:
      | "provider_owned"
      | "ae_curated_external"
      | "third_party_gateway"
      | "observed_external";
    sourceKind:
      "ae_envelope" | "openapi_http" | "mcp" | "agent_plugin_mcp" | "x402";
  }>;
  availability: PublicToolAvailability;
  navigation: readonly PublicToolNavigationRelation[];
  /** Additive catalog display aids derived from the contract/price; absent when not derivable. */
  parameters?: readonly PublicToolParameter[];
  catalogPrice?: PublicToolCatalogPrice;
}>;
export type PublicToolParameterMapping = Readonly<{
  inputPointer: string;
  group: "path" | "query" | "header";
  name: string;
  required?: boolean;
  style?: "form" | "simple";
  explode?: boolean;
}>;
export type CapabilityToolSourceRecord = Readonly<{
  operationId: string;
  publicationRef: string;
  publicationRevision: number;
  networkId: string;
  contract: CapabilityContract;
  business: PublicToolBusinessRef;
  offering: PublicToolOfferingRef;
  price: PublicToolPrice;
  priceEvidence?: PublicToolPriceEvidence;
  priceBreakdown?: PublicToolPriceBreakdown;
  materialTerms: readonly Readonly<{ label: string; value: string }>[];
  commercialRelationship: Readonly<{
    kind: "none" | "direct" | "affiliate" | "ownership";
    summary: string;
  }>;
  cancellation: PublicCancellationPolicy;
  authentication: PublicToolAuthentication;
  payment?: PublicToolPayment;
  transport: PublicToolTransport;
  parameterMappings?: readonly PublicToolParameterMapping[];
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
  readiness: Readonly<{ observedAt?: number; validUntil?: number; lastHealthyAt?: number }>;
  searchTerms: readonly string[];
  snapshotKey: string;
}>;
export type CapabilityToolSourcePort = Readonly<{
  navigation: ToolProjectionNavigationContract;
  listCurrent: (
    input: Readonly<{ networkId?: string; limit: number; now: number }>,
  ) => Promise<
    Readonly<{
      tools: readonly CapabilityToolSourceRecord[];
      sourceCount: number;
      snapshotKey: string;
    }>
  >;
  loadCurrent: (
    toolRef: PublicToolRef,
  ) => Promise<CapabilityToolSourceRecord | null>;
}>;
