import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";

import type { SchemaDereferencer } from "./admit-provider-schema";
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
  const manifest = inspectSource(input.manifest);
  if (manifest.kind === "refused") return manifest;
  if (
    !isRecord(input.manifest) ||
    !boundedTrimmed(input.manifest.name, MAX_TOOL_NAME_LENGTH)
  ) {
    return { kind: "refused", reason: "source_invalid" };
  }
  if (!boundedTrimmed(input.serverName, MAX_TOOL_NAME_LENGTH)) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const servers = input.manifest.mcpServers;
  if (!isRecord(servers)) return { kind: "refused", reason: "source_invalid" };
  const selectedServer = servers[input.serverName];
  if (!isRecord(selectedServer))
    return { kind: "refused", reason: "transport_unsupported" };
  if (selectedServer.type !== "http") {
    return { kind: "refused", reason: "transport_unsupported" };
  }
  if (
    typeof selectedServer.url !== "string" ||
    Object.keys(selectedServer).some((key) => key !== "type" && key !== "url")
  ) {
    return { kind: "refused", reason: "transport_unsupported" };
  }
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
          manifest: manifest.digest,
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
