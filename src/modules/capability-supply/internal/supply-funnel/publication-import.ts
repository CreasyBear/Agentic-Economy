import { jsonValueSchema } from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";
import {
  publicationMaterialContainsCredential,
  validCapabilityPublicationSourceRevision,
} from "../publication";
import type {
  CapabilityContractMetadata,
  CapabilityImporterCommercialInput,
  CapabilityPublicationBindingDraft,
  CapabilityPublicationImport,
  CapabilityPublicationOfferingDraft,
} from "../publication-importers";
import { boundedTrimmed, validEvidenceRefs } from "../shared";

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
  if (value.kind === "public_upstream") return true;
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

export function ownerPublicationImport(source: Record<string, unknown>):
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
