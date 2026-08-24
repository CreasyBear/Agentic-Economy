import type { PricingConfig } from "@/modules/money/public";
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from "@/modules/security/source-write-admission";
import type { CapabilityPublicationSourceSelector } from "../publication-importers";

type BusinessOfferingStatus = "draft" | "published" | "paused" | "retired";
type OfferingAccessPathDescriptor =
  | Readonly<{
      kind: "human_request";
      channel: "phone" | "website";
      disclosure: string;
      url?: string;
    }>
  | Readonly<{
      kind: "external_operation";
      name: string;
      summary: string;
      url: string;
      method?: string;
      documentationUrl?: string;
      interfaceDescription?: Readonly<{ format: string; url?: string }>;
      authenticationSummary?: string;
      pricingSummary?: string;
      provenance: "business_declared" | "publicly_observed";
    }>;

export const OWNER_SUPPLY_UNAVAILABLE_MESSAGE =
  "Owner supply is temporarily unavailable. Try again.";

export type SupplyFunnelStep = "describe" | "admission" | "readiness" | "test";
export type SupplyFunnelStepState =
  "not_started" | "in_progress" | "completed" | "refused" | "stale";
export type SupplyFunnelRefusal =
  | "publication_missing"
  | "publication_not_found"
  | "publication_stale"
  | "binding_invalid"
  | "contract_missing"
  | "input_unrepresentable"
  | "mcp_tool_missing"
  | "authority_stale"
  | "admission_unproven"
  | "conformance_unproven"
  | "credential_readiness_unobserved"
  | "health_unobserved"
  | "health_unhealthy"
  | "health_stale"
  | "eligibility_integrity_failure"
  | "withdrawn"
  | "incompatible_revision"
  | "invalid_offering"
  | "authorization_denied"
  | "source_unavailable"
  | "source_invalid"
  | "source_too_large"
  | "source_too_deep"
  | "source_version_unsupported"
  | "selector_invalid"
  | "operation_not_found"
  | "operation_not_keyless"
  | "operation_not_executable"
  | "schema_missing"
  | "schema_profile_unsupported"
  | "openapi_query_parameter_definition_unsupported"
  | "openapi_query_parameter_serialization_unsupported"
  | "openapi_query_parameter_schema_unsupported"
  | "openapi_path_parameter_required"
  | "openapi_path_parameter_serialization_unsupported"
  | "openapi_header_parameter_unsafe"
  | "openapi_header_parameter_serialization_unsupported"
  | "openapi_media_type_unsupported"
  | "openapi_request_body_parameter_mix_unsupported"
  | "openapi_response_status_unsupported"
  | "openapi_operation_unsupported"
  | "adapter_not_registered"
  | "adapter_config_invalid"
  | "adapter_config_too_large"
  | "credential_rejected"
  | "credential_unavailable"
  | "target_not_public"
  | "transport_unreachable"
  | "http_redirect"
  | "http_4xx"
  | "http_5xx"
  | "response_content_type_invalid"
  | "response_too_large"
  | "response_invalid"
  | "target_changed"
  | "revision_changed"
  | "price_unavailable"
  | "pricing_config_invalid"
  | "currency_mismatch"
  | "input_invalid"
  | "outcome_unknown"
  | "registration_context_invalid"
  | "contract_identity_conflict"
  | "offering_identity_conflict"
  | "operation_key_conflict"
  | "offering_integrity_failure"
  | "binding_integrity_failure"
  | "catalog_offering_origin_changed";

export type SupplyFunnelStepCompletion = Readonly<{
  step: SupplyFunnelStep;
  state: SupplyFunnelStepState;
  offeringRef?: string;
  revision?: number;
  sourceHash?: string;
  publicationRef?: string;
  operationRef?: string;
  refusal?: SupplyFunnelRefusal;
  message?: string;
}>;

export type SupplyFunnelActionContext = Readonly<{
  businessId: string;
  offeringRef: string;
  offeringRevision: number;
  offeringSourceHash: string;
  publicationRef: string;
  publicationRevision: number;
}>;
export type OwnerSupplyActionInput = SupplyFunnelActionContext &
  Readonly<{
    operationKey: string;
  }>;
export type OwnerSupplyMaintenanceCommand = OwnerSupplyActionInput &
  Readonly<{
    correlationId: string;
    reasonCode: string;
    evidenceRefs: readonly string[];
  }>;
export type OwnerSupplyMaintenanceInput = OwnerSupplyMaintenanceCommand;
export type OwnerSupplyMaintenanceSourceInput = OwnerSupplyMaintenanceCommand &
  Readonly<{
    sourceWrite: SourceWriteAdmission;
    sourceWriteRequest: SourceWriteAdmissionRequest;
  }>;
export type OwnerSupplyCommandResult = Readonly<
  | {
      kind: "withdrawn";
      publicationRef: string;
      revision: number;
      lifecycle: Readonly<{ state: "withdrawn"; reasons: readonly string[] }>;
    }
  | {
      kind: "refreshed";
      publicationRef: string;
      revision: number;
      disposition: "current" | "incompatible";
      lifecycle: Readonly<{
        state: "active" | "inactive" | "incompatible";
        reasons: readonly string[];
      }>;
    }
  | {
      kind: "republished";
      publicationRef: string;
      revision: number;
      operationRef: string;
      bindingId: string;
      lifecycle: Readonly<{
        state: "active" | "inactive";
        reasons: readonly string[];
      }>;
    }
  | { kind: "refused"; reason: string }
>;

export type OwnerSupplyReadbackSource = Readonly<{
  kind: "ae_envelope" | "openapi_http" | "mcp" | "agent_plugin_mcp" | "x402";
  selector: CapabilityPublicationSourceSelector;
  revision: string;
  digest: string;
}>;

export type OwnerSupplyOfferingReadback = Readonly<{
  offeringRef: string;
  revision: number;
  name: string;
  summary: string;
  status: BusinessOfferingStatus;
  sourceHash?: string;
  endpointUrl?: string;
  source?: OwnerSupplyReadbackSource;
  pricing?: Readonly<{ config: PricingConfig; priceDigest: string }>;
  authority?: Readonly<{
    mode:
      | "provider_owned"
      | "ae_curated_external"
      | "third_party_gateway"
      | "observed_external";
    kind: "keyless" | "provider_connection";
    providerRef?: string;
    authorityGeneration?: number;
    authorityDigest?: string;
  }>;
  admission: Readonly<{
    state: "not_admitted" | "admitted";
    reason?: SupplyFunnelRefusal;
  }>;
  publication?: Readonly<{
    state: "current" | "withdrawn" | "superseded" | "incompatible";
    publicationRef: string;
    publicationRevision: number;
    operationRef: string;
    authorityMode:
      | "provider_owned"
      | "ae_curated_external"
      | "third_party_gateway"
      | "observed_external";
    contractRef: Readonly<{
      capabilityId: string;
      version: number;
      contractDigest: string;
    }>;
    source: OwnerSupplyReadbackSource;
    pricing?: Readonly<{ config: PricingConfig; priceDigest: string }>;
    binding: Readonly<{
      bindingId: string;
      bindingDigest: string;
      endpointUrl: string;
      adapterId: string;
      admission: "not_admitted" | "admitted";
      conformance: "not_conformant" | "conformant";
      authority: Readonly<
        | { kind: "keyless" }
        | { kind: "provider_connection"; providerRef: string }
      >;
      authoritySnapshot?: Readonly<{
        providerRef: string;
        authorityGeneration: number;
        authorityDigest: string;
      }>;
    }>;
    lifecycle: Readonly<{
      state: "inactive" | "active" | "withdrawn" | "incompatible";
      reasons: readonly SupplyFunnelRefusal[];
    }>;
    readiness: Readonly<{
      outcome:
        | "unobserved"
        | "healthy"
        | "credential_unavailable"
        | "credential_rejected"
        | "target_not_public"
        | "transport_unreachable"
        | "http_redirect"
        | "http_4xx"
        | "http_5xx"
        | "response_content_type_invalid"
        | "response_too_large"
        | "response_invalid";
      observedAt?: number;
      validUntil?: number;
      targetDigest?: string;
      requestDigest?: string;
      responseStatus?: number;
      responseContentType?: string;
      responseDigest?: string;
      evidenceRefs: readonly string[];
    }>;
  }>;
  lifecycle: Readonly<{
    state: "inactive" | "active" | "withdrawn" | "incompatible";
    reasons: readonly SupplyFunnelRefusal[];
  }>;
  readiness: Readonly<{
    outcome:
      | "unobserved"
      | "healthy"
      | "credential_unavailable"
      | "credential_rejected"
      | "target_not_public"
      | "transport_unreachable"
      | "http_redirect"
      | "http_4xx"
      | "http_5xx"
      | "response_content_type_invalid"
      | "response_too_large"
      | "response_invalid";
    observedAt?: number;
    validUntil?: number;
    evidenceRefs: readonly string[];
  }>;
  live: Readonly<{ available: boolean; reason?: SupplyFunnelRefusal }>;
  currentStep: SupplyFunnelStep;
  stepStates: Readonly<Record<SupplyFunnelStep, SupplyFunnelStepState>>;
  actionableReason?: SupplyFunnelRefusal;
  accessPaths: readonly Readonly<{
    accessPathRef: string;
    offeringSourceHash: string;
    sourceHash: string;
    status: "draft" | "published" | "withdrawn";
    descriptor: OfferingAccessPathDescriptor;
  }>[];
}>;

export type SupplyCallLogRow = Readonly<{
  eventRef: string;
  offeringRef: string;
  publicationRef?: string;
  observedAt: number;
  outcome: "filled" | "zero";
  zeroReason?: string;
  durationMs?: number;
  evidenceRefs: readonly string[];
  environment: "local" | "development" | "sandbox" | "production";
}>;

export type SupplyLiquiditySummary = Readonly<{
  fillCount: number;
  zeroCount: number;
  firstSuccessP50Ms?: number;
  firstSuccessP95Ms?: number;
  depthSamples: number;
  environment: "local" | "development" | "sandbox" | "production";
}>;
export type OwnerSupplyFunnelReadback = Readonly<
  | {
      kind: "error";
      code: "unauthenticated" | "source_unavailable";
      reason?: string;
    }
  | { kind: "not_found" }
  | { kind: "incomplete" }
  | {
      kind: "available";
      businessId: string;
      business: Readonly<{ name: string; slug: string }>;
      offerings: readonly OwnerSupplyOfferingReadback[];
      callLog: readonly SupplyCallLogRow[];
      activityTruncated: boolean;
      liquidity: SupplyLiquiditySummary;
    }
>;

export function ownerSupplyActionContext(
  businessId: string,
  offering: OwnerSupplyOfferingReadback,
): SupplyFunnelActionContext | undefined {
  const publication = offering.publication;
  if (
    offering.sourceHash === undefined ||
    publication === undefined ||
    (publication.state !== "current" && publication.state !== "withdrawn")
  )
    return undefined;
  return {
    businessId,
    offeringRef: offering.offeringRef,
    offeringRevision: offering.revision,
    offeringSourceHash: offering.sourceHash,
    publicationRef: publication.publicationRef,
    publicationRevision: publication.publicationRevision,
  };
}
