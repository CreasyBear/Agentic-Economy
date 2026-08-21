import {
  CAPABILITY_CONTRACT_FORMAT,
  defineCapabilityContract,
  type CapabilityContractDocument,
  type JsonValue,
} from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  stableStringify,
  type StableHashValue,
} from "@/modules/common/stable-hash";

import type {
  CapabilityOfferingRegistration,
  CapabilityTransportBindingRegistration,
} from "../public";
import type { AdmitProviderSchemaRefusal } from "./admit-provider-schema";
import { validPublicHttpsEndpoint } from "./transport-adapters";

export const MAX_PROTOCOL_VERSION_LENGTH = 64;
export const MAX_TOOL_NAME_LENGTH = 200;

const MAX_SOURCE_BYTES = 262_144;
const MAX_SOURCE_DEPTH = 64;
const MAX_SOURCE_NODES = 10_000;
const encoder = new TextEncoder();

export type CapabilityPublicationOfferingDraft = Readonly<
  Omit<CapabilityOfferingRegistration, "businessId" | "contractRef">
>;
export type CapabilityPublicationBindingDraft = Readonly<
  Omit<
    CapabilityTransportBindingRegistration,
    "offeringId" | "networkId" | "contractRef"
  >
>;
export type CapabilityContractMetadata = Readonly<
  Omit<
    CapabilityContractDocument,
    "contractFormat" | "inputSchema" | "outputSchema"
  >
>;
export type CapabilityImporterCommercialInput = Readonly<{
  offering: CapabilityPublicationOfferingDraft;
  bindingId: string;
  authority: CapabilityTransportBindingRegistration["authority"];
  registrationEvidenceRefs: readonly string[];
  requestTimeoutMs: number;
}>;

export type CapabilityPublicationSource =
  | Readonly<{
      kind: "ae_envelope";
      descriptorDigest: string;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "openapi_http";
      descriptorDigest: string;
      selector: Readonly<{ path: string; method: "get" | "post" }>;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "mcp";
      descriptorDigest: string;
      selector: Readonly<{ toolName: string; protocolVersion: string }>;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "agent_plugin_mcp";
      descriptorDigest: string;
      selector: Readonly<{
        serverName: string;
        toolName: string;
        protocolVersion: string;
      }>;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "x402";
      descriptorDigest: string;
      selector: Readonly<{ resourceUrl: string }>;
      evidenceRefs: readonly string[];
    }>;

export type CapabilityPublicationSourceSelector =
  | Readonly<Record<string, never>>
  | Readonly<{ path: string; method: "get" | "post" }>
  | Readonly<{ toolName: string; protocolVersion: string }>
  | Readonly<{ serverName: string; toolName: string; protocolVersion: string }>
  | Readonly<{ resourceUrl: string }>;

export type CanonicalCapabilityPublicationDraft = Readonly<{
  source: CapabilityPublicationSource;
  documentJson: string;
  offering: CapabilityPublicationOfferingDraft;
  binding: CapabilityPublicationBindingDraft;
}>;

export type CapabilityPublicationImport =
  | Readonly<{
      kind: "ae_envelope";
      documentJson: string;
      offering: CapabilityPublicationOfferingDraft;
      binding: CapabilityPublicationBindingDraft;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "openapi_http";
      document: unknown;
      operation: Readonly<{ path: string; method: "get" | "post" }>;
      fixedQuery?: readonly Readonly<{ parameter: string; value: string }>[];
      contract: CapabilityContractMetadata;
      commercial: CapabilityImporterCommercialInput;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "mcp";
      serverUrl: string;
      tool: unknown;
      protocolVersion: string;
      contract: CapabilityContractMetadata;
      commercial: CapabilityImporterCommercialInput;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "agent_plugin_mcp";
      manifest: unknown;
      serverName: string;
      tool: unknown;
      protocolVersion: string;
      contract: CapabilityContractMetadata;
      commercial: CapabilityImporterCommercialInput;
      evidenceRefs: readonly string[];
    }>
  | Readonly<{
      kind: "x402";
      resource: unknown;
      contract: CapabilityContractMetadata;
      commercial: CapabilityImporterCommercialInput;
      evidenceRefs: readonly string[];
    }>;

export type CapabilityPublicationImportRefusal =
  | "source_invalid"
  | "source_too_large"
  | "source_too_deep"
  | "source_version_unsupported"
  | "selector_invalid"
  | "operation_not_found"
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
  | AdmitProviderSchemaRefusal
  | "transport_unsupported"
  | "commercial_metadata_inconsistent"
  | "payment_execution_unsupported"
  | "payment_required_invalid"
  | "bazaar_discovery_invalid";

export type CapabilityPublicationImportResult =
  | Readonly<{ kind: "normalized"; draft: CanonicalCapabilityPublicationDraft }>
  | Readonly<{ kind: "refused"; reason: CapabilityPublicationImportRefusal }>;

export type OpenApiOperationPreflightOutcome =
  | Readonly<{
      selector: Readonly<{ path: string; method: string }>;
      kind: "executable";
    }>
  | Readonly<{
      selector: Readonly<{ path: string; method: string }>;
      kind: "credential_required";
      credential: Readonly<{
        kind: "api_key" | "http_bearer";
        location?: "query" | "header";
        name?: string;
      }>;
    }>
  | Readonly<{
      selector: Readonly<{ path: string; method: string }>;
      kind: "unsupported_shape" | "unsafe";
      reason: CapabilityPublicationImportRefusal;
    }>;

export type OpenApiDocumentPreflightResult =
  | Readonly<{
      kind: "preflighted";
      sourceDigest: string;
      outcomes: readonly OpenApiOperationPreflightOutcome[];
      truncated: boolean;
    }>
  | Readonly<{
      kind: "refused";
      reason: Extract<
        CapabilityPublicationImportRefusal,
        | "source_invalid"
        | "source_too_large"
        | "source_too_deep"
        | "source_version_unsupported"
        | "schema_missing"
      >;
    }>;

export type SourceInspection =
  | Readonly<{ kind: "accepted"; digest: string }>
  | Readonly<{
      kind: "refused";
      reason: "source_invalid" | "source_too_large" | "source_too_deep";
    }>;

export function inspectSource(source: unknown): SourceInspection {
  let raw: string;
  try {
    raw = JSON.stringify(source);
  } catch {
    return { kind: "refused", reason: "source_invalid" };
  }
  if (raw === undefined) return { kind: "refused", reason: "source_invalid" };
  if (encoder.encode(raw).byteLength > MAX_SOURCE_BYTES)
    return { kind: "refused", reason: "source_too_large" };
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [
    { value: source, depth: 0 },
  ];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > MAX_SOURCE_NODES)
      return { kind: "refused", reason: "source_too_large" };
    if (current.depth > MAX_SOURCE_DEPTH)
      return { kind: "refused", reason: "source_too_deep" };
    if (Array.isArray(current.value)) {
      for (const value of current.value)
        pending.push({ value, depth: current.depth + 1 });
    } else if (isRecord(current.value)) {
      for (const [key, value] of Object.entries(current.value)) {
        if (
          key === "__proto__" ||
          key === "prototype" ||
          key === "constructor"
        ) {
          return { kind: "refused", reason: "source_invalid" };
        }
        pending.push({ value, depth: current.depth + 1 });
      }
    } else if (
      current.value !== null &&
      typeof current.value !== "string" &&
      typeof current.value !== "boolean" &&
      (typeof current.value !== "number" || !Number.isFinite(current.value))
    ) {
      return { kind: "refused", reason: "source_invalid" };
    }
  }
  try {
    return {
      kind: "accepted",
      digest: canonicalDigest(source as StableHashValue),
    };
  } catch {
    return { kind: "refused", reason: "source_invalid" };
  }
}

function mapCapabilityContractRefusal(
  error: unknown,
  schemas: readonly Readonly<Record<string, JsonValue>>[],
): CapabilityPublicationImportRefusal {
  const message = error instanceof Error ? error.message : "";
  if (message === "capability_json_schema_too_complex") {
    const tooDeep = schemas.some((schema) => {
      const inspected = inspectSource(schema);
      return (
        inspected.kind === "refused" && inspected.reason === "source_too_deep"
      );
    });
    return tooDeep ? "admit_schema_too_deep" : "schema_profile_unsupported";
  }
  switch (message) {
    case "capability_input_schema_profile_invalid":
    case "capability_input_schema_projection_invalid":
    case "capability_data_use_pointer_invalid":
    case "capability_json_schema_invalid":
    case "capability_customer_annotation_pointer_invalid":
    case "capability_semantic_projection_invalid":
    case "capability_semantic_projection_failed":
      return "schema_profile_unsupported";
    case "capability_evidence_pointer_invalid":
    case "capability_completion_evidence_missing":
    case "capability_completion_evidence_annotation_missing":
    case "capability_completion_evidence_not_guaranteed":
      return "admit_output_no_guaranteed_field";
    default:
      return "source_invalid";
  }
}

function contractSchemas(
  value: unknown,
): Readonly<Record<string, JsonValue>>[] {
  if (!isRecord(value)) return [];
  return [value.inputSchema, value.outputSchema].filter(
    (schema): schema is Readonly<Record<string, JsonValue>> => isRecord(schema),
  );
}

export function normalizeDirectEnvelope(
  input: Extract<CapabilityPublicationImport, { kind: "ae_envelope" }>,
): CapabilityPublicationImportResult {
  if (encoder.encode(input.documentJson).byteLength > MAX_SOURCE_BYTES) {
    return { kind: "refused", reason: "source_too_large" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.documentJson);
  } catch {
    return { kind: "refused", reason: "source_invalid" };
  }
  const bounded = inspectSource(parsed);
  if (bounded.kind === "refused") return bounded;
  let contract;
  try {
    contract = defineCapabilityContract(parsed);
  } catch (error) {
    return {
      kind: "refused",
      reason: mapCapabilityContractRefusal(error, contractSchemas(parsed)),
    };
  }
  const { ref: _ref, ...document } = contract;
  return {
    kind: "normalized",
    draft: {
      source: {
        kind: "ae_envelope",
        descriptorDigest: bounded.digest,
        evidenceRefs: input.evidenceRefs,
      },
      documentJson: stableStringify(document as StableHashValue),
      offering: input.offering,
      binding: input.binding,
    },
  };
}

export function normalizedFromSchemas(
  input: Readonly<{
    source: CapabilityPublicationSource;
    contract: CapabilityContractMetadata;
    inputSchema: Readonly<Record<string, JsonValue>>;
    outputSchema: Readonly<Record<string, JsonValue>>;
    commercial: CapabilityImporterCommercialInput;
    endpointUrl: string;
    adapter: Readonly<{ adapterId: string; config: JsonValue }>;
  }>,
): CapabilityPublicationImportResult {
  let contract;
  try {
    contract = defineCapabilityContract({
      contractFormat: CAPABILITY_CONTRACT_FORMAT,
      ...input.contract,
      inputSchema: input.inputSchema,
      outputSchema: input.outputSchema,
    });
  } catch (error) {
    return {
      kind: "refused",
      reason: mapCapabilityContractRefusal(error, [
        input.inputSchema,
        input.outputSchema,
      ]),
    };
  }
  const { ref: _ref, ...document } = contract;
  return {
    kind: "normalized",
    draft: {
      source: input.source,
      documentJson: stableStringify(document as StableHashValue),
      offering: input.commercial.offering,
      binding: {
        bindingId: input.commercial.bindingId,
        endpointUrl: input.endpointUrl,
        authority: input.commercial.authority,
        continuation: {
          kind: "single_response",
          evidenceRefs: [...input.commercial.registrationEvidenceRefs],
        },
        cancellation: {
          kind: "unsupported",
          evidenceRefs: [...input.commercial.registrationEvidenceRefs],
        },
        adapter: input.adapter,
        registrationEvidenceRefs: [
          ...input.commercial.registrationEvidenceRefs,
        ],
      },
    },
  };
}

export function validHttpsUrl(value: string): string | undefined {
  const url = validPublicHttpsEndpoint(value);
  return url !== undefined && url.hash === "" ? url.toString() : undefined;
}

export function boundedTrimmed(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim()
  );
}
