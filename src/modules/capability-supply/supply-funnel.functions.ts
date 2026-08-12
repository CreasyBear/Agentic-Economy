import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { jsonValueSchema } from "@/modules/capability-contract/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  callSourceAction,
  callSourceMutation,
  callSourceQuery,
  sourceAction,
  sourceMutation,
  sourceQuery,
} from "@/lib/server/convex-source";
import { sourceWriteAdmissionFromContext } from "@/lib/server/source-write-admission";
import {
  SourceWriteAdmissionError,
  sourceWriteRequestFromAdmission,
} from "@/modules/security/source-write-admission";
import { isRecord } from "@/modules/common/is-record";
import { describeActionForAgent, listMcpActions } from "@/modules/actions";
import type {
  BusinessOfferingStatus,
  OfferingAccessPathDescriptor,
} from "@/modules/catalog/public";
import type { PublicServicesApiPage } from "@/modules/registry/public";
import { registryServicesListAction } from "@/modules/registry/registry.actions";
import type {
  PayoutStatusView,
  PricingConfig,
  ProviderEarningsView,
} from "@/modules/money/public";
import type {
  PricingPreview,
  SupplyPricingRefusal,
} from "./internal/supply-funnel/pricing-port";
import type { ProviderConnectionOwnerProjection } from "./provider-connection";
import { realPricingConfigPort } from "./internal/supply-funnel/pricing-port";
import {
  preflightOpenApiHttpDocument,
  type OpenApiDocumentPreflightResult,
  type OpenApiOperationPreflightOutcome,
} from "./public";
import {
  preparePublicationDraft,
  publicationMaterialContainsCredential,
  validCapabilityPublicationSourceRevision,
  type PreparedPublicationMaterial,
  type PreparePublicationDraftRefusal,
  type PublishPreparedCapabilityCommandResult,
} from "./internal/publication";
import type {
  SourceWriteAdmission,
  SourceWriteAdmissionRequest,
} from "@/modules/security/source-write-admission";
import { dereferenceOpenApiSchema } from "./internal/schema-deref";
export type OwnerSupplyAdmissionResult =
  | PublishPreparedCapabilityCommandResult
  | Extract<OwnerSupplyPreflightResult, { kind: "refused" }>;
export type OwnerOpenApiDocumentPreflightResult =
  | OpenApiDocumentPreflightResult
  | Readonly<{
      kind: "refused";
      reason: "authorization_denied" | "source_unavailable";
    }>;
import type {
  CapabilityContractMetadata,
  CapabilityImporterCommercialInput,
  CapabilityPublicationBindingDraft,
  CapabilityPublicationImport,
  CapabilityPublicationOfferingDraft,
  CapabilityPublicationSourceSelector,
} from "./internal/publication-importers";
import { boundedTrimmed, validEvidenceRefs } from "./internal/shared";
export type SupplyLandingTool = Readonly<{
  id: string;
  name: string;
  summary: string;
  boundaries: readonly string[];
  inputJsonSchema?: string;
  outputJsonSchema?: string;
}>;
export type SupplyLandingReadback =
  | Readonly<{
      kind: "available";
      tools: readonly SupplyLandingTool[];
      services: PublicServicesApiPage;
      evidence: "source" | "labelled_local_dev";
    }>
  | Readonly<{
      kind: "error";
      reason: "source_unavailable";
      retryable: true;
    }>;

export const loadSupplyLandingReadbackServer = createServerFn({
  method: "GET",
}).handler(async (): Promise<SupplyLandingReadback> => {
  try {
    const tools = listMcpActions()
      .filter(
        (action) => action.readOnly && action.credentialAdmission === undefined,
      )
      .map(describeActionForAgent)
      .slice(0, 32)
      .map((tool) => ({
        id: tool.id,
        name: tool.name,
        summary: tool.summary,
        boundaries: tool.boundaries,
        ...(tool.inputJsonSchema === undefined
          ? {}
          : { inputJsonSchema: JSON.stringify(tool.inputJsonSchema, null, 2) }),
        ...(tool.outputJsonSchema === undefined
          ? {}
          : {
              outputJsonSchema: JSON.stringify(tool.outputJsonSchema, null, 2),
            }),
      }));
    const services = await registryServicesListAction.run({
      data: registryServicesListAction.schema.parse({ limit: 10 }),
      context: { caller: "ui" },
    });
    return { kind: "available", tools, services, evidence: "source" };
  } catch {
    return { kind: "error", reason: "source_unavailable", retryable: true };
  }
});
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
  | "source_draft_missing"
  | "source_draft_stale"
  | "source_draft_unprepared"
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
type OwnerSupplyMaintenanceCommand = OwnerSupplyActionInput &
  Readonly<{
    correlationId: string;
    reasonCode: string;
    evidenceRefs: readonly string[];
  }>;
export type OwnerSupplyMaintenanceInput = OwnerSupplyMaintenanceCommand;
type OwnerSupplyMaintenanceSourceInput = OwnerSupplyMaintenanceCommand &
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
export type OwnerSourceDraftPreflight = Readonly<{
  status: "pending" | "prepared" | "refused";
  draftRevision: number;
  sourceDigest: string;
  observedAt: number;
  reason?: string;
  summary?: Readonly<{
    sourceKind: string;
    sourceRevision: string;
    sourceDigest: string;
    priceDigest: string;
    preparedDigest: string;
  }>;
  openApi?: Readonly<{
    sourceDigest: string;
    outcomes: readonly OpenApiOperationPreflightOutcome[];
    truncated: boolean;
  }>;
  evidenceRefs: readonly string[];
}>;
export type OwnerSourceDraftReadback = Readonly<
  | {
      kind: "available";
      businessId: string;
      offeringRef: string;
      offeringRevision: number;
      revision: number;
      operationKey: string;
      sourceJson: string;
      sourceDigest: string;
      preflight: OwnerSourceDraftPreflight;
    }
  | { kind: "not_found" }
  | {
      kind: "error";
      code: "unauthenticated" | "source_unavailable";
      reason?: string;
    }
>;
export type OwnerSourceDraftSaveResult = Readonly<
  | {
      kind: "saved" | "replayed";
      revision: number;
      sourceDigest: string;
      preflightStatus: OwnerSourceDraftPreflight["status"];
    }
  | { kind: "revision_conflict"; revision: number }
  | { kind: "refused"; reason: string }
>;

export function filterOwnerSupplyAuthorityOptions<
  T extends Pick<
    ProviderConnectionOwnerProjection,
    "businessId" | "adapterId" | "credentialConfigured"
  >,
>(businessId: string, connections: readonly T[]): readonly T[] {
  return connections.filter(
    (connection) =>
      connection.businessId === businessId &&
      (connection.adapterId === "x402-fetch:v2" ||
        connection.credentialConfigured),
  );
}
export type OwnerProviderEarningsAccountReadback = Readonly<{
  currency: string;
  earnings: Readonly<{ kind: "ok" } & ProviderEarningsView>;
  payout: Readonly<{ kind: "ok" } & PayoutStatusView>;
}>;

export type OwnerProviderEarningsReadback = Readonly<
  | { kind: "error"; code: "unauthenticated" | "source_unavailable" }
  | { kind: "not_found" }
  | {
      kind: "available";
      businessId: string;
      accounts: readonly OwnerProviderEarningsAccountReadback[];
      accountsTruncated: boolean;
    }
>;

type OwnerProviderEarningsSourceResult = OwnerProviderEarningsReadback;

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

type SourceWriteFields = Readonly<{
  sourceWrite: SourceWriteAdmission;
  sourceWriteRequest: SourceWriteAdmissionRequest;
}>;
type OwnerSupplyPreparedCommand = Readonly<{
  businessId: string;
  offeringRef: string;
  revision: number;
  sourceHash: string;
  sourceDraftRevision: number;
  sourceDigest: string;
  runtimeEnvironment: "production";
  prepared: PreparedPublicationMaterial;
  operationKey: string;
  correlationId: string;
  reasonCode: string;
  evidenceRefs: readonly string[];
}>;
type OwnerSupplyPreparedInput = OwnerSupplyPreparedCommand & SourceWriteFields;
const readOwnerSupplyQuery = sourceQuery<
  { businessId: string },
  OwnerSupplyFunnelReadback
>("capabilitySupplyOwnerFunnel:readOwnerSupplyFunnel");
const readOwnerProviderConnectionsQuery = sourceQuery<
  Record<string, never>,
  readonly ProviderConnectionOwnerProjection[]
>("capabilityProviderConnections:listOwner");
const readOwnerProviderEarningsQuery = sourceQuery<
  Record<string, never>,
  OwnerProviderEarningsReadback
>("moneyLedger:readOwnerProviderEarnings");
const OWNER_SUPPLY_UNAVAILABLE_MESSAGE =
  "Owner supply is temporarily unavailable. Try again.";
const publishMutation = sourceMutation<
  OwnerSupplyPreparedInput,
  PublishPreparedCapabilityCommandResult
>("capabilitySupply:publishPreparedCapability");
const probeAction = sourceAction<
  OwnerSupplyActionInput,
  SupplyFunnelStepCompletion
>("capabilitySupplyOwnerSupply:runOwnerSupplyReadiness");
const testAction = sourceAction<
  OwnerSupplyActionInput,
  SupplyFunnelStepCompletion
>("capabilitySupplyOwnerSupply:runOwnerSupplyTest");
const withdrawMutation = sourceMutation<
  OwnerSupplyMaintenanceSourceInput,
  OwnerSupplyCommandResult
>("capabilitySupplyOwnerFunnel:withdrawOwnerCapability");
const refreshMutation = sourceMutation<
  OwnerSupplyMaintenanceSourceInput,
  OwnerSupplyCommandResult
>("capabilitySupplyOwnerFunnel:refreshOwnerCapability");
const republishMutation = sourceMutation<
  OwnerSupplyMaintenanceSourceInput,
  OwnerSupplyCommandResult
>("capabilitySupplyOwnerFunnel:republishOwnerCapability");
type OwnerSourceDraftQueryResult = Readonly<
  | {
      kind: "available";
      businessId: string;
      offeringRef: string;
      offeringRevision: number;
      revision: number;
      operationKey: string;
      sourceJson: string;
      sourceDigest: string;
      preflight: OwnerSourceDraftPreflight;
    }
  | { kind: "not_found" }
  | {
      kind: "error";
      code: "unauthenticated" | "source_unavailable";
      reason?: string;
    }
>;
type OwnerSourceDraftMutationCommand = Readonly<{
  businessId: string;
  offeringRef: string;
  offeringRevision: number;
  expectedRevision: number;
  operationKey: string;
  correlationId: string;
  sourceJson: string;
}>;
type OwnerSourceDraftMutationInput = OwnerSourceDraftMutationCommand &
  SourceWriteFields;
const readOwnerSourceDraftQuery = sourceQuery<
  { businessId: string; offeringRef: string },
  OwnerSourceDraftQueryResult
>("capabilitySupplyOwnerFunnel:readOwnerSourceDraft");
const saveOwnerSourceDraftMutation = sourceMutation<
  OwnerSourceDraftMutationInput,
  OwnerSourceDraftSaveResult
>("capabilitySupplyOwnerFunnel:saveOwnerSourceDraft");
type OwnerSourceDraftPreflightMutationCommand = Readonly<{
  businessId: string;
  offeringRef: string;
  expectedRevision: number;
  sourceDigest: string;
  status: "prepared" | "refused";
  reason?: string;
  summary?: OwnerSourceDraftPreflight["summary"];
  openApi?: OwnerSourceDraftPreflight["openApi"];
  evidenceRefs: readonly string[];
  operationKey: string;
  correlationId: string;
}>;
type OwnerSourceDraftPreflightMutationInput =
  OwnerSourceDraftPreflightMutationCommand & SourceWriteFields;
const recordOwnerSourceDraftPreflightMutation = sourceMutation<
  OwnerSourceDraftPreflightMutationInput,
  boolean
>("capabilitySupplyOwnerFunnel:recordOwnerSourceDraftPreflight");

function boundedSourceText(
  value: unknown,
  maximumLength: number,
): value is string {
  return typeof value === "string" && boundedTrimmed(value, maximumLength);
}

function sourceEvidenceRefs(value: unknown): value is readonly string[] {
  return Array.isArray(value) && validEvidenceRefs(value);
}

function capabilityContractMetadata(
  value: unknown,
): value is CapabilityContractMetadata {
  return (
    isRecord(value) &&
    boundedSourceText(value.capabilityId, 200) &&
    typeof value.version === "number" &&
    Number.isSafeInteger(value.version) &&
    value.version > 0 &&
    boundedSourceText(value.name, 160) &&
    boundedSourceText(value.description, 1_000) &&
    Array.isArray(value.customerAnnotations) &&
    value.customerAnnotations.length > 0 &&
    value.customerAnnotations.length <= 128 &&
    Array.isArray(value.dataUse) &&
    value.dataUse.length <= 128 &&
    Array.isArray(value.effects) &&
    value.effects.length <= 64 &&
    Array.isArray(value.evidence) &&
    value.evidence.length > 0 &&
    value.evidence.length <= 64 &&
    isRecord(value.lifecycle) &&
    (value.inputExamples === undefined || Array.isArray(value.inputExamples))
  );
}

function capabilityOfferingDraft(
  value: unknown,
): value is CapabilityPublicationOfferingDraft {
  if (
    !isRecord(value) ||
    !boundedSourceText(value.offeringId, 200) ||
    !boundedSourceText(value.networkId, 200) ||
    !isRecord(value.presentation) ||
    !boundedSourceText(value.presentation.label, 160) ||
    !boundedSourceText(value.presentation.summary, 2_000) ||
    !isRecord(value.presentation.price) ||
    !Array.isArray(value.presentation.materialTerms) ||
    !isRecord(value.presentation.commercialRelationship) ||
    !Array.isArray(value.searchTerms) ||
    value.searchTerms.length === 0 ||
    value.searchTerms.length > 64 ||
    value.searchTerms.some((term) => !boundedSourceText(term, 120)) ||
    !sourceEvidenceRefs(value.registrationEvidenceRefs)
  )
    return false;
  return value.origin === undefined || isRecord(value.origin);
}

function capabilityTransportAuthority(
  value: unknown,
): value is CapabilityImporterCommercialInput["authority"] {
  if (!isRecord(value)) return false;
  if (value.kind === "keyless") return true;
  return (
    value.kind === "provider_connection" &&
    boundedSourceText(value.connectionRef, 200) &&
    boundedSourceText(value.providerRef, 200)
  );
}

function capabilityBindingDraft(
  value: unknown,
): value is CapabilityPublicationBindingDraft {
  if (
    !isRecord(value) ||
    !boundedSourceText(value.bindingId, 200) ||
    !boundedSourceText(value.endpointUrl, 2_000) ||
    !capabilityTransportAuthority(value.authority) ||
    !isRecord(value.continuation) ||
    (value.continuation.kind !== "single_response" &&
      value.continuation.kind !== "adapter_managed") ||
    !sourceEvidenceRefs(value.continuation.evidenceRefs) ||
    !isRecord(value.cancellation) ||
    (value.cancellation.kind !== "unsupported" &&
      value.cancellation.kind !== "adapter_managed") ||
    !sourceEvidenceRefs(value.cancellation.evidenceRefs) ||
    !isRecord(value.adapter) ||
    !boundedSourceText(value.adapter.adapterId, 200) ||
    !Object.hasOwn(value.adapter, "config") ||
    !jsonValueSchema.safeParse(value.adapter.config).success ||
    !sourceEvidenceRefs(value.registrationEvidenceRefs)
  )
    return false;
  return true;
}

function capabilityCommercialInput(
  value: unknown,
): value is CapabilityImporterCommercialInput {
  return (
    isRecord(value) &&
    capabilityOfferingDraft(value.offering) &&
    boundedSourceText(value.bindingId, 200) &&
    capabilityTransportAuthority(value.authority) &&
    sourceEvidenceRefs(value.registrationEvidenceRefs) &&
    typeof value.requestTimeoutMs === "number" &&
    Number.isSafeInteger(value.requestTimeoutMs) &&
    value.requestTimeoutMs >= 100 &&
    value.requestTimeoutMs <= 120_000
  );
}

function openApiOperation(
  value: unknown,
): value is Readonly<{ path: string; method: "get" | "post" }> {
  return (
    isRecord(value) &&
    boundedSourceText(value.path, 2_000) &&
    (value.method === "get" || value.method === "post")
  );
}

function fixedQuery(
  value: unknown,
): value is readonly Readonly<{ parameter: string; value: string }>[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        boundedSourceText(entry.parameter, 200) &&
        typeof entry.value === "string" &&
        entry.value.length <= 2_000,
    )
  );
}

function mcpTool(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    boundedSourceText(value.name, 200) &&
    isRecord(value.inputSchema) &&
    isRecord(value.outputSchema)
  );
}

function agentPluginManifest(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    boundedSourceText(value.name, 200) &&
    isRecord(value.mcpServers)
  );
}

function x402Resource(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    boundedSourceText(value.resourceUrl, 2_000) &&
    isRecord(value.inputSchema) &&
    isRecord(value.outputSchema)
  );
}

function ownerPublicationImport(source: Record<string, unknown>):
  | Readonly<{
      source: CapabilityPublicationImport;
      sourceRevision: string;
      pricingConfig: unknown;
    }>
  | undefined {
  const sourceRevision = source.sourceRevision;
  const evidenceRefs = source.evidenceRefs;
  if (
    typeof sourceRevision !== "string" ||
    !validCapabilityPublicationSourceRevision(sourceRevision) ||
    !sourceEvidenceRefs(evidenceRefs)
  )
    return undefined;

  switch (source.kind) {
    case "ae_envelope": {
      const documentJson = source.documentJson;
      const offering = source.offering;
      const binding = source.binding;
      if (
        typeof documentJson !== "string" ||
        !capabilityOfferingDraft(offering) ||
        !capabilityBindingDraft(binding)
      )
        return undefined;
      let document: unknown;
      try {
        document = JSON.parse(documentJson);
      } catch {
        return undefined;
      }
      if (publicationMaterialContainsCredential(document)) return undefined;
      return {
        source: {
          kind: "ae_envelope",
          documentJson,
          offering,
          binding,
          evidenceRefs,
        },
        sourceRevision,
        pricingConfig: ownerPricingConfig(offering),
      };
    }
    case "openapi_http": {
      const contract = source.contract;
      const commercial = source.commercial;
      const operation = source.operation;
      const fixedQueryValue = source.fixedQuery;
      const query =
        fixedQueryValue === undefined
          ? undefined
          : fixedQuery(fixedQueryValue)
            ? fixedQueryValue
            : null;
      if (
        !isRecord(source.document) ||
        !openApiOperation(operation) ||
        query === null ||
        !capabilityContractMetadata(contract) ||
        !capabilityCommercialInput(commercial)
      )
        return undefined;
      return {
        source: {
          kind: "openapi_http",
          document: source.document,
          operation,
          ...(query === undefined ? {} : { fixedQuery: query }),
          contract,
          commercial,
          evidenceRefs,
        },
        sourceRevision,
        pricingConfig: ownerPricingConfig(commercial.offering),
      };
    }
    case "mcp": {
      const contract = source.contract;
      const commercial = source.commercial;
      const serverUrl = source.serverUrl;
      const tool = source.tool;
      const protocolVersion = source.protocolVersion;
      if (
        !boundedSourceText(serverUrl, 2_000) ||
        !mcpTool(tool) ||
        !boundedSourceText(protocolVersion, 64) ||
        !capabilityContractMetadata(contract) ||
        !capabilityCommercialInput(commercial)
      )
        return undefined;
      return {
        source: {
          kind: "mcp",
          serverUrl,
          tool,
          protocolVersion,
          contract,
          commercial,
          evidenceRefs,
        },
        sourceRevision,
        pricingConfig: ownerPricingConfig(commercial.offering),
      };
    }
    case "agent_plugin_mcp": {
      const contract = source.contract;
      const commercial = source.commercial;
      const manifest = source.manifest;
      const serverName = source.serverName;
      const tool = source.tool;
      const protocolVersion = source.protocolVersion;
      if (
        !agentPluginManifest(manifest) ||
        !boundedSourceText(serverName, 200) ||
        !mcpTool(tool) ||
        !boundedSourceText(protocolVersion, 64) ||
        !capabilityContractMetadata(contract) ||
        !capabilityCommercialInput(commercial)
      )
        return undefined;
      return {
        source: {
          kind: "agent_plugin_mcp",
          manifest,
          serverName,
          tool,
          protocolVersion,
          contract,
          commercial,
          evidenceRefs,
        },
        sourceRevision,
        pricingConfig: ownerPricingConfig(commercial.offering),
      };
    }
    case "x402": {
      const contract = source.contract;
      const commercial = source.commercial;
      const resource = source.resource;
      if (
        !x402Resource(resource) ||
        !capabilityContractMetadata(contract) ||
        !capabilityCommercialInput(commercial)
      )
        return undefined;
      return {
        source: { kind: "x402", resource, contract, commercial, evidenceRefs },
        sourceRevision,
        pricingConfig: ownerPricingConfig(commercial.offering),
      };
    }
    default:
      return undefined;
  }
}

function ownerPricingConfig(
  offering: CapabilityPublicationOfferingDraft,
): unknown {
  const price = offering.presentation.price;
  return {
    version: "pricing:v2",
    unit: "call",
    paidAmount: price.kind === "fixed" ? price.amount : undefined,
  };
}
const ownerSupplyReadInputSchema = z.strictObject({
  businessId: z.string().min(1),
});
export const readOwnerSupplyFunnelServer = createServerFn()
  .validator((data) => ownerSupplyReadInputSchema.parse(data))
  .handler(async ({ data }): Promise<OwnerSupplyFunnelReadback> => {
    try {
      return await callSourceQuery(readOwnerSupplyQuery, data);
    } catch {
      return {
        kind: "error",
        code: "source_unavailable",
        reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
      };
    }
  });
const ownerSourceDraftReadInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
});
export const readOwnerSourceDraftServer = createServerFn()
  .validator((data) => ownerSourceDraftReadInputSchema.parse(data))
  .handler(async ({ data }): Promise<OwnerSourceDraftReadback> => {
    const parsed = ownerSourceDraftReadInputSchema.parse(data);
    try {
      const result = await callSourceQuery(readOwnerSourceDraftQuery, parsed);
      if (result.kind !== "available") return result;
      let sourceValue: unknown;
      try {
        sourceValue = JSON.parse(result.sourceJson);
      } catch {
        return {
          kind: "error",
          code: "source_unavailable",
          reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
        };
      }
      if (!isRecord(sourceValue))
        return {
          kind: "error",
          code: "source_unavailable",
          reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
        };
      const imported = ownerPublicationImport(sourceValue);
      if (
        imported === undefined ||
        publicationMaterialContainsCredential(imported.source)
      ) {
        return {
          kind: "error",
          code: "source_unavailable",
          reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
        };
      }
      return result;
    } catch {
      return {
        kind: "error",
        code: "source_unavailable",
        reason: OWNER_SUPPLY_UNAVAILABLE_MESSAGE,
      };
    }
  });
export const readOwnerProviderConnectionsServer = createServerFn().handler(
  async (): Promise<readonly ProviderConnectionOwnerProjection[]> => {
    try {
      return await callSourceQuery(readOwnerProviderConnectionsQuery, {});
    } catch {
      throw new Error(OWNER_SUPPLY_UNAVAILABLE_MESSAGE);
    }
  },
);
export const readOwnerProviderEarningsServer = createServerFn().handler(
  async (): Promise<OwnerProviderEarningsReadback> => {
    try {
      return await callSourceQuery(readOwnerProviderEarningsQuery, {});
    } catch {
      return { kind: "error", code: "source_unavailable" };
    }
  },
);
const ownerSupplyActionInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().min(1),
  publicationRef: z.string().min(1),
  publicationRevision: z.number().int().positive(),
  operationKey: z.string().min(8).max(200),
});
const ownerSourceSchema = z.record(z.string(), jsonValueSchema);
const ownerSourceDraftSaveInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  expectedRevision: z.number().int().nonnegative(),
  operationKey: z.string().min(8).max(200),
  source: ownerSourceSchema,
});
const preflightOwnerCapabilityInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  sourceDraftRevision: z.number().int().positive(),
  sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evidenceRefs: z.array(z.string().min(1)).max(64),
});
const ownerOpenApiDocumentPreflightInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  document: ownerSourceSchema,
});
const ownerSupplyAdmissionInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  sourceDraftRevision: z.number().int().positive(),
  sourceDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  operationKey: z.string().min(8).max(200),
  correlationId: z.string().min(1).max(200),
  reasonCode: z.string().min(1).max(200),
  evidenceRefs: z.array(z.string().min(1)).max(64),
});
const ownerSupplyMaintenanceInputSchema = z.strictObject({
  businessId: z.string().min(1),
  offeringRef: z.string().min(1),
  offeringRevision: z.number().int().positive(),
  offeringSourceHash: z.string().min(1),
  publicationRef: z.string().min(1),
  publicationRevision: z.number().int().positive(),
  operationKey: z.string().min(8).max(200),
  correlationId: z.string().min(1).max(200),
  reasonCode: z.string().min(1).max(200),
  evidenceRefs: z.array(z.string().min(1)).max(64),
});
export const saveOwnerSourceDraftServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSourceDraftSaveInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerSourceDraftSaveResult> => {
    const imported = ownerPublicationImport(data.source);
    if (
      imported === undefined ||
      publicationMaterialContainsCredential(imported.source)
    ) {
      return { kind: "refused", reason: "source_invalid" };
    }
    let sourceJson: string;
    try {
      sourceJson = JSON.stringify(data.source);
      if (new TextEncoder().encode(sourceJson).byteLength > 262_144) {
        return { kind: "refused", reason: "source_too_large" };
      }
    } catch {
      return { kind: "refused", reason: "source_invalid" };
    }
    try {
      const command: OwnerSourceDraftMutationCommand = {
        businessId: data.businessId,
        offeringRef: data.offeringRef,
        offeringRevision: data.offeringRevision,
        expectedRevision: data.expectedRevision,
        operationKey: data.operationKey,
        correlationId: `owner-supply:source-draft:${data.businessId}:${data.offeringRef}`,
        sourceJson,
      };
      const sourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command,
        scope: "catalog_publish",
        operationKey: command.operationKey,
        correlationId: command.correlationId,
      });
      return await callSourceMutation(saveOwnerSourceDraftMutation, {
        ...command,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
        sourceWrite,
      });
    } catch {
      return { kind: "refused", reason: "source_unavailable" };
    }
  });
export const preflightOwnerOpenApiDocumentServer = createServerFn({
  method: "POST",
})
  .validator((data) => ownerOpenApiDocumentPreflightInputSchema.parse(data))
  .handler(async ({ data }): Promise<OwnerOpenApiDocumentPreflightResult> => {
    let readback: OwnerSupplyFunnelReadback;
    try {
      readback = await callSourceQuery(readOwnerSupplyQuery, {
        businessId: data.businessId,
      });
    } catch {
      return { kind: "refused", reason: "source_unavailable" };
    }
    if (readback.kind === "error") {
      return {
        kind: "refused",
        reason:
          readback.code === "unauthenticated"
            ? "authorization_denied"
            : "source_unavailable",
      };
    }
    if (readback.kind === "incomplete") {
      return { kind: "refused", reason: "source_unavailable" };
    }
    if (
      readback.kind !== "available" ||
      !readback.offerings.some(
        (offering) =>
          offering.offeringRef === data.offeringRef &&
          offering.revision === data.offeringRevision,
      )
    )
      return { kind: "refused", reason: "authorization_denied" };
    try {
      return await preflightOpenApiHttpDocument(
        data.document,
        dereferenceOpenApiSchema,
      );
    } catch {
      return { kind: "refused", reason: "source_unavailable" };
    }
  });
export type OwnerSupplyPreflightResult = Readonly<
  | {
      kind: "prepared";
      prepared: PreparedPublicationMaterial;
      summary: Readonly<{
        sourceKind: string;
        sourceRevision: string;
        sourceDigest: string;
        priceDigest: string;
        preparedDigest: string;
      }>;
    }
  | {
      kind: "refused";
      reason:
        | PreparePublicationDraftRefusal
        | "catalog_offering_invalid"
        | "source_unavailable"
        | "authorization_denied"
        | "source_draft_missing"
        | "source_draft_stale"
        | "source_draft_unprepared";
    }
>;
function ownerPublicationEndpoint(
  source: CapabilityPublicationImport,
): Readonly<{ url: string; method: "GET" | "POST" }> | undefined {
  if (source.kind === "openapi_http") {
    if (
      !isRecord(source.document) ||
      !Array.isArray(source.document.servers) ||
      source.document.servers.length !== 1
    )
      return undefined;
    const server = source.document.servers[0];
    if (!isRecord(server) || typeof server.url !== "string") return undefined;
    try {
      return {
        url: new URL(
          source.operation.path.replace(/^\/+/, ""),
          server.url.endsWith("/") ? server.url : `${server.url}/`,
        ).toString(),
        method: source.operation.method.toUpperCase() as "GET" | "POST",
      };
    } catch {
      return undefined;
    }
  }
  if (source.kind === "mcp") return { url: source.serverUrl, method: "POST" };
  if (source.kind === "agent_plugin_mcp") {
    if (!isRecord(source.manifest) || !isRecord(source.manifest.mcpServers))
      return undefined;
    const server = source.manifest.mcpServers[source.serverName];
    if (!isRecord(server) || typeof server.url !== "string") return undefined;
    return { url: server.url, method: "POST" };
  }
  if (source.kind === "x402") {
    if (
      !isRecord(source.resource) ||
      typeof source.resource.resourceUrl !== "string"
    )
      return undefined;
    const method =
      source.resource.method === undefined ? "POST" : source.resource.method;
    return method === "GET" || method === "POST"
      ? { url: source.resource.resourceUrl, method }
      : undefined;
  }
  return undefined;
}

function canonicalOwnerEndpoint(value: string): string | undefined {
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" ? endpoint.toString() : undefined;
  } catch {
    return undefined;
  }
}

function ownerPublicationWithCatalogOrigin(
  source: CapabilityPublicationImport,
  offering: OwnerSupplyOfferingReadback,
): CapabilityPublicationImport | undefined {
  const endpoint = ownerPublicationEndpoint(source);
  const endpointUrl =
    endpoint === undefined ? undefined : canonicalOwnerEndpoint(endpoint.url);
  if (
    endpoint === undefined ||
    endpointUrl === undefined ||
    offering.sourceHash === undefined
  )
    return undefined;
  if (source.kind === "ae_envelope") return undefined;
  const path = offering.accessPaths.find(
    (candidate) =>
      candidate.status === "published" &&
      candidate.offeringSourceHash === offering.sourceHash &&
      candidate.descriptor.kind === "external_operation" &&
      canonicalOwnerEndpoint(candidate.descriptor.url) === endpointUrl &&
      candidate.descriptor.method?.trim().toUpperCase() === endpoint.method,
  );
  if (path === undefined) return undefined;
  return {
    ...source,
    commercial: {
      ...source.commercial,
      offering: {
        ...source.commercial.offering,
        origin: {
          kind: "catalog_offering",
          offeringRef: offering.offeringRef,
          offeringRevision: offering.revision,
          offeringSourceHash: offering.sourceHash,
          declaredAccessPathRef: path.accessPathRef,
          accessPathSourceHash: path.sourceHash,
        },
      },
    },
  };
}

async function prepareOwnerPublicationSource(
  data: Readonly<{
    businessId: string;
    offeringRef: string;
    offeringRevision: number;
    source: Record<string, unknown>;
    evidenceRefs: readonly string[];
  }>,
): Promise<OwnerSupplyPreflightResult> {
  try {
    if (
      new TextEncoder().encode(JSON.stringify(data.source)).byteLength > 300_000
    ) {
      return { kind: "refused", reason: "source_too_large" };
    }
  } catch {
    return { kind: "refused", reason: "source_invalid" };
  }
  const imported = ownerPublicationImport(data.source);
  if (
    imported === undefined ||
    publicationMaterialContainsCredential(imported.source)
  )
    return { kind: "refused", reason: "source_invalid" };
  const readback = await callSourceQuery(readOwnerSupplyQuery, {
    businessId: data.businessId,
  });
  if (readback.kind === "incomplete")
    return { kind: "refused", reason: "source_unavailable" };
  const offering =
    readback.kind === "available"
      ? readback.offerings.find(
          (candidate) =>
            candidate.offeringRef === data.offeringRef &&
            candidate.revision === data.offeringRevision,
        )
      : undefined;
  const sourced =
    offering === undefined
      ? undefined
      : ownerPublicationWithCatalogOrigin(imported.source, offering);
  if (sourced === undefined)
    return { kind: "refused", reason: "catalog_offering_invalid" };
  const prepared = await preparePublicationDraft({
    source: sourced,
    sourceRevision: imported.sourceRevision,
    pricingConfig: imported.pricingConfig,
    evidenceRefs: data.evidenceRefs,
    derefSchema: dereferenceOpenApiSchema,
  });
  if (prepared.kind === "refused") return prepared;
  return {
    kind: "prepared",
    prepared: prepared.prepared,
    summary: {
      sourceKind: prepared.prepared.sourceKind,
      sourceRevision: prepared.prepared.sourceRevision,
      sourceDigest: prepared.prepared.sourceDigest,
      priceDigest: prepared.prepared.priceDigest,
      preparedDigest: canonicalDigest(prepared.prepared),
    },
  };
}
async function prepareOwnerStoredSourceDraft(
  data: Readonly<{
    businessId: string;
    offeringRef: string;
    offeringRevision: number;
    sourceDraftRevision: number;
    sourceDigest: string;
  }>,
): Promise<OwnerSupplyPreflightResult> {
  const draft = await callSourceQuery(readOwnerSourceDraftQuery, {
    businessId: data.businessId,
    offeringRef: data.offeringRef,
  });
  if (draft.kind === "not_found")
    return { kind: "refused", reason: "source_draft_missing" };
  if (draft.kind === "error") {
    return {
      kind: "refused",
      reason:
        draft.code === "unauthenticated"
          ? "authorization_denied"
          : "source_unavailable",
    };
  }
  if (
    draft.offeringRevision !== data.offeringRevision ||
    draft.revision !== data.sourceDraftRevision ||
    draft.sourceDigest !== data.sourceDigest ||
    draft.preflight.draftRevision !== data.sourceDraftRevision ||
    draft.preflight.sourceDigest !== data.sourceDigest
  )
    return { kind: "refused", reason: "source_draft_stale" };
  if (
    draft.preflight.status !== "prepared" ||
    draft.preflight.summary === undefined
  ) {
    return { kind: "refused", reason: "source_draft_unprepared" };
  }
  let source: unknown;
  try {
    source = JSON.parse(draft.sourceJson);
  } catch {
    return { kind: "refused", reason: "source_draft_unprepared" };
  }
  if (!isRecord(source))
    return { kind: "refused", reason: "source_draft_unprepared" };
  const prepared = await prepareOwnerPublicationSource({
    businessId: data.businessId,
    offeringRef: data.offeringRef,
    offeringRevision: data.offeringRevision,
    source,
    evidenceRefs: draft.preflight.evidenceRefs,
  });
  if (prepared.kind === "refused") return prepared;
  if (
    prepared.summary.sourceKind !== draft.preflight.summary.sourceKind ||
    prepared.summary.sourceRevision !==
      draft.preflight.summary.sourceRevision ||
    prepared.summary.sourceDigest !== draft.preflight.summary.sourceDigest ||
    prepared.summary.priceDigest !== draft.preflight.summary.priceDigest ||
    prepared.summary.preparedDigest !== draft.preflight.summary.preparedDigest
  )
    return { kind: "refused", reason: "source_draft_stale" };
  return prepared;
}
async function prepareOwnerSourceDraftPreflight(
  data: Readonly<{
    businessId: string;
    offeringRef: string;
    offeringRevision: number;
    sourceDraftRevision: number;
    sourceDigest: string;
    evidenceRefs: readonly string[];
  }>,
): Promise<
  | Readonly<{ kind: "loaded"; checked: OwnerSupplyPreflightResult }>
  | Extract<OwnerSupplyPreflightResult, { kind: "refused" }>
> {
  const draft = await callSourceQuery(readOwnerSourceDraftQuery, {
    businessId: data.businessId,
    offeringRef: data.offeringRef,
  });
  if (draft.kind === "not_found")
    return { kind: "refused", reason: "source_draft_missing" };
  if (draft.kind === "error") {
    return {
      kind: "refused",
      reason:
        draft.code === "unauthenticated"
          ? "authorization_denied"
          : "source_unavailable",
    };
  }
  if (
    draft.offeringRevision !== data.offeringRevision ||
    draft.revision !== data.sourceDraftRevision ||
    draft.sourceDigest !== data.sourceDigest
  ) {
    return { kind: "refused", reason: "source_draft_stale" };
  }
  let source: unknown;
  try {
    source = JSON.parse(draft.sourceJson);
  } catch {
    return { kind: "refused", reason: "source_draft_unprepared" };
  }
  if (!isRecord(source))
    return { kind: "refused", reason: "source_draft_unprepared" };
  return {
    kind: "loaded",
    checked: await prepareOwnerPublicationSource({
      businessId: data.businessId,
      offeringRef: data.offeringRef,
      offeringRevision: data.offeringRevision,
      source,
      evidenceRefs: data.evidenceRefs,
    }),
  };
}

async function recordOwnerSourcePreflight(
  data: Readonly<{
    businessId: string;
    offeringRef: string;
    sourceDraftRevision: number;
    sourceDigest: string;
  }>,
  checked: OwnerSupplyPreflightResult,
  context: unknown,
): Promise<boolean> {
  const command: OwnerSourceDraftPreflightMutationCommand = {
    businessId: data.businessId,
    offeringRef: data.offeringRef,
    expectedRevision: data.sourceDraftRevision,
    sourceDigest: data.sourceDigest,
    status: checked.kind === "prepared" ? "prepared" : "refused",
    ...(checked.kind === "prepared"
      ? { summary: checked.summary }
      : { reason: checked.reason }),
    evidenceRefs:
      checked.kind === "prepared" ? checked.prepared.evidenceRefs : [],
    operationKey: `owner-supply:preflight:${data.businessId}:${data.offeringRef}:${data.sourceDraftRevision}:${data.sourceDigest}`,
    correlationId: `owner-supply:preflight:${data.businessId}:${data.offeringRef}`,
  };
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: "catalog_publish",
    operationKey: command.operationKey,
    correlationId: command.correlationId,
  });
  return callSourceMutation(recordOwnerSourceDraftPreflightMutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  });
}

export const preflightOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => preflightOwnerCapabilityInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerSupplyPreflightResult> => {
    const loaded = await prepareOwnerSourceDraftPreflight(data);
    if (loaded.kind === "refused") return loaded;
    const recorded = await recordOwnerSourcePreflight(
      data,
      loaded.checked,
      context,
    );
    return recorded
      ? loaded.checked
      : { kind: "refused", reason: "source_draft_stale" };
  });

export const admitOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyAdmissionInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerSupplyAdmissionResult> => {
    const prepared = await prepareOwnerStoredSourceDraft(data);
    if (prepared.kind === "refused") return prepared;
    const command: OwnerSupplyPreparedCommand = {
      businessId: data.businessId,
      offeringRef: data.offeringRef,
      revision: data.offeringRevision,
      sourceHash: data.offeringSourceHash,
      sourceDraftRevision: data.sourceDraftRevision,
      sourceDigest: data.sourceDigest,
      runtimeEnvironment: "production",
      prepared: prepared.prepared,
      operationKey: data.operationKey,
      correlationId: data.correlationId,
      reasonCode: data.reasonCode,
      evidenceRefs: data.evidenceRefs,
    };
    try {
      const sourceWrite = await sourceWriteAdmissionFromContext({
        context,
        command,
        scope: "catalog_publish",
        operationKey: command.operationKey,
        correlationId: command.correlationId,
      });
      return callSourceMutation(publishMutation, {
        ...command,
        sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
        sourceWrite,
      });
    } catch (error) {
      if (error instanceof SourceWriteAdmissionError)
        return { kind: "refused", reason: "authorization_denied" };
      throw error;
    }
  });

export const runOwnerSupplyReadinessServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyActionInputSchema.parse(data))
  .handler(async ({ data }) => callSourceAction(probeAction, data));
export const runOwnerSupplyTestServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyActionInputSchema.parse(data))
  .handler(async ({ data }) => callSourceAction(testAction, data));

async function writeOwnerSupplyMaintenance(
  context: unknown,
  command: OwnerSupplyMaintenanceCommand,
  mutation: typeof refreshMutation,
): Promise<OwnerSupplyCommandResult> {
  const sourceWrite = await sourceWriteAdmissionFromContext({
    context,
    command,
    scope: "catalog_publish",
    operationKey: command.operationKey,
    correlationId: command.correlationId,
  });
  return await callSourceMutation(mutation, {
    ...command,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  });
}

export const recheckOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(async ({ data, context }) =>
    writeOwnerSupplyMaintenance(context, data, refreshMutation),
  );
export const withdrawOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(async ({ data, context }) =>
    writeOwnerSupplyMaintenance(context, data, withdrawMutation),
  );
export const republishOwnerCapabilityServer = createServerFn({ method: "POST" })
  .validator((data) => ownerSupplyMaintenanceInputSchema.parse(data))
  .handler(async ({ data, context }) =>
    writeOwnerSupplyMaintenance(context, data, republishMutation),
  );

export type PricingStepResult = Readonly<
  | { kind: "ready"; config: PricingConfig; preview: PricingPreview }
  | { kind: "refused"; reason: SupplyPricingRefusal }
>;

export function resolveSupplyPricing(
  config: unknown,
  options?: Readonly<{ freeCallsUsed?: number; priceDigest?: string }>,
): PricingStepResult {
  const resolved = realPricingConfigPort.normalize(config);
  if (resolved.kind === "refused") return resolved;
  return realPricingConfigPort.resolve({
    config: resolved.config,
    freeCallsUsed: options?.freeCallsUsed ?? 0,
    ...(options?.priceDigest === undefined
      ? {}
      : { priceDigest: options.priceDigest }),
  });
}
