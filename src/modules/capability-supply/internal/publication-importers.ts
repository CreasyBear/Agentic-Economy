import type { SchemaDereferencer } from "./admit-provider-schema";
import { importAgentPluginMcpCapability } from "./publication-importer-agent-plugin";
import { importMcpCapability } from "./publication-importer-mcp";
import {
  importOpenApiHttpCapability,
  preflightOpenApiHttpDocument,
} from "./publication-importer-openapi";
import { importX402Capability } from "./publication-importer-x402";
import {
  normalizeDirectEnvelope,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportResult,
} from "./publication-importer-types";

export type {
  CanonicalCapabilityPublicationDraft,
  CapabilityContractMetadata,
  CapabilityImporterCommercialInput,
  CapabilityPublicationBindingDraft,
  CapabilityPublicationImport,
  CapabilityPublicationImportRefusal,
  CapabilityPublicationImportResult,
  CapabilityPublicationOfferingDraft,
  CapabilityPublicationSource,
  CapabilityPublicationSourceSelector,
  OpenApiDocumentPreflightResult,
  OpenApiOperationPreflightOutcome,
} from "./publication-importer-types";
export { importOpenApiHttpCapability, preflightOpenApiHttpDocument };
export { importMcpCapability };
export { importAgentPluginMcpCapability };
export { importX402Capability };

export async function normalizeCapabilityPublication(
  input: CapabilityPublicationImport,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  switch (input.kind) {
    case "ae_envelope":
      return normalizeDirectEnvelope(input);
    case "openapi_http":
      return importOpenApiHttpCapability(input, derefSchema);
    case "mcp":
      return importMcpCapability(input, derefSchema);
    case "agent_plugin_mcp":
      return importAgentPluginMcpCapability(input, derefSchema);
    case "x402":
      return await importX402Capability(input, derefSchema);
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
}
