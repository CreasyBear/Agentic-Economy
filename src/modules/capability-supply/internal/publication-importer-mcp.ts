import type { JsonValue } from "@/modules/capability-contract/public";
import { isRecord } from "@/modules/common/is-record";

import {
  admitProviderSchema,
  type AdmitCredentialSpec,
  type SchemaDereferencer,
} from "./admit-provider-schema";
import { publicationMaterialContainsCredential } from "./publication/source";
import {
  MAX_PROTOCOL_VERSION_LENGTH,
  MAX_TOOL_NAME_LENGTH,
  boundedTrimmed,
  inspectSource,
  normalizedFromSchemas,
  validHttpsUrl,
  type CapabilityPublicationImport,
  type CapabilityPublicationImportResult,
} from "./publication-importer-types";

export async function importMcpCapability(
  input: Extract<CapabilityPublicationImport, { kind: "mcp" }>,
  derefSchema?: SchemaDereferencer,
): Promise<CapabilityPublicationImportResult> {
  const bounded = inspectSource(input.tool);
  if (bounded.kind === "refused") return bounded;
  if (
    publicationMaterialContainsCredential({
      serverUrl: input.serverUrl,
      tool: input.tool,
    })
  ) {
    return { kind: "refused", reason: "source_invalid" };
  }
  const endpoint = validHttpsUrl(input.serverUrl);
  if (endpoint === undefined)
    return { kind: "refused", reason: "transport_unsupported" };
  if (!boundedTrimmed(input.protocolVersion, MAX_PROTOCOL_VERSION_LENGTH)) {
    return { kind: "refused", reason: "source_version_unsupported" };
  }
  if (
    !isRecord(input.tool) ||
    !boundedTrimmed(input.tool.name, MAX_TOOL_NAME_LENGTH)
  ) {
    return { kind: "refused", reason: "selector_invalid" };
  }
  const inputSchema = input.tool.inputSchema;
  const outputSchema = input.tool.outputSchema;
  if (!isRecord(inputSchema) || !isRecord(outputSchema)) {
    return { kind: "refused", reason: "schema_missing" };
  }
  const credential: AdmitCredentialSpec =
    input.commercial.authority.kind === "public_upstream"
      ? { kind: "public_upstream" }
      : { kind: "http_bearer", schemeName: "mcp-http-bearer" };
  const admit = await admitProviderSchema(
    {
      inputSchema: inputSchema as Readonly<Record<string, JsonValue>>,
      outputSchema: outputSchema as Readonly<Record<string, JsonValue>>,
      contract: input.contract,
      authority: input.commercial.authority,
      credential,
      resolutionRoot: input.tool,
      credentialParameterNames: [],
    },
    derefSchema,
  );
  if (admit.kind === "refused")
    return { kind: "refused", reason: admit.reason };
  return normalizedFromSchemas({
    source: {
      kind: "mcp",
      descriptorDigest: bounded.digest,
      selector: {
        toolName: input.tool.name,
        protocolVersion: input.protocolVersion,
      },
      evidenceRefs: input.evidenceRefs,
    },
    contract: admit.contract,
    inputSchema: admit.inputSchema,
    outputSchema: admit.outputSchema,
    commercial: input.commercial,
    endpointUrl: endpoint,
    adapter: {
      adapterId: "mcp-jsonrpc:v1",
      config: {
        protocolVersion: input.protocolVersion,
        toolName: input.tool.name,
        requestTimeoutMs: input.commercial.requestTimeoutMs,
        credential:
          credential.kind === "public_upstream" ? { kind: "none" } : { kind: "bearer" },
      },
    },
  });
}
