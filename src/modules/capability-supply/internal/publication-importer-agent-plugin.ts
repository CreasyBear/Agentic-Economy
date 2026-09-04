import { canonicalDigest } from "@/modules/common/canonical-digest";

import type { SchemaDereferencer } from "./admit-provider-schema";
import { validateAgentPluginSource } from "./agent-plugin-source";
import { publicationMaterialContainsCredential } from "./publication/source";
import { importMcpCapability } from "./publication-importer-mcp";
import {
  MAX_TOOL_NAME_LENGTH,
  boundedTrimmed,
  inspectSource,
  validHttpsUrl,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportResult,
} from "./publication-importer-types";

export async function importAgentPluginMcpCapability(
  input: Extract<CapabilityPublicationImport, { kind: "agent_plugin_mcp" }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  const bundle = inspectSource({ pluginJson: input.pluginJson, mcpJson: input.mcpJson });
  if (bundle.kind === "refused") return bundle;
  if (!boundedTrimmed(input.serverName, MAX_TOOL_NAME_LENGTH)) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const validated = validateAgentPluginSource(input.pluginJson, input.mcpJson);
  if (validated.kind === "refused") return { kind: "refused", reason: "source_invalid" };
  const selectedServer = validated.servers.find((server) => server.name === input.serverName);
  if (selectedServer === undefined)
    return { kind: "refused", reason: "transport_unsupported" };
  if (
    publicationMaterialContainsCredential({
      server: selectedServer,
      tool: input.tool,
    })
  ) {
    return { kind: "refused", reason: "source_invalid" };
  }
  const serverUrl = validHttpsUrl(selectedServer.url);
  if (serverUrl === undefined)
    return { kind: "refused", reason: "transport_unsupported" };
  const normalized = await importMcpCapability(
    {
      kind: "mcp",
      serverUrl,
      tool: input.tool,
      protocolVersion: input.protocolVersion,
      contract: input.contract,
      commercial: input.commercial,
      evidenceRefs: input.evidenceRefs,
    },
    derefSchema,
  );
  if (normalized.kind === "refused") return normalized;
  if (normalized.draft.source.kind !== "mcp")
    return { kind: "refused", reason: "source_invalid" };
  return {
    kind: "normalized",
    draft: {
      ...normalized.draft,
      source: {
        kind: "agent_plugin_mcp",
        descriptorDigest: canonicalDigest({
          bundle: bundle.digest,
          serverName: input.serverName,
          tool: normalized.draft.source.descriptorDigest,
        }),
        selector: {
          serverName: input.serverName,
          toolName: normalized.draft.source.selector.toolName,
          protocolVersion: normalized.draft.source.selector.protocolVersion,
        },
        evidenceRefs: [...input.evidenceRefs],
      },
    },
  };
}
