import { describe, expect, it } from "vitest";

import { publicationSourceDescriptorJson } from "@/modules/capability-supply/internal/publication/source";

import {
  admitRegisteredTransport,
  importAgentPluginMcpCapability,
  importMcpCapability,
} from "@/modules/capability-supply/public";

import {
  commercialInput,
  contractMetadata,
  inputSchema,
  outputSchema,
  providerAuthority,
} from "./publication-importers-harness";

describe("capability publication importers", () => {
  it("normalizes one MCP tool with a distinct admitted JSON-RPC transport", async () => {
    const result = await importMcpCapability({
      kind: "mcp",
      serverUrl: "https://tools.example.test/mcp",
      protocolVersion: "2025-06-18",
      tool: {
        name: "reference_lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      },
      contract: contractMetadata("independent.mcp-lookup"),
      commercial: commercialInput({ authority: providerAuthority }),
      evidenceRefs: ["source:mcp"],
    });

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: {
          kind: "mcp",
          selector: {
            toolName: "reference_lookup",
            protocolVersion: "2025-06-18",
          },
        },
        binding: {
          endpointUrl: "https://tools.example.test/mcp",
          adapter: {
            adapterId: "mcp-jsonrpc:v1",
            config: {
              protocolVersion: "2025-06-18",
              toolName: "reference_lookup",
              requestTimeoutMs: 5_000,
              credential: { kind: "bearer" },
            },
          },
        },
      },
    });
    if (result.kind === "normalized") {
      expect(
        admitRegisteredTransport({
          adapterId: result.draft.binding.adapter.adapterId,
          endpointUrl: result.draft.binding.endpointUrl,
          authority: result.draft.binding.authority,
          continuation: result.draft.binding.continuation,
          cancellation: result.draft.binding.cancellation,
          config: result.draft.binding.adapter.config,
        }),
      ).toMatchObject({
        kind: "admitted",
        transport: { adapterId: "mcp-jsonrpc:v1" },
      });
    }
  });

  it("normalizes an Agent Plugin MCP server through the canonical MCP importer", async () => {
    const source = {
      kind: "agent_plugin_mcp" as const,
      manifest: {
        name: "Reference Plugin",
        mcpServers: {
          reference: { type: "http", url: "https://tools.example.test/mcp" },
          local: { type: "stdio", command: "node" },
          legacy: { type: "sse", url: "https://tools.example.test/sse" },
        },
      },
      serverName: "reference",
      protocolVersion: "2025-06-18",
      tool: {
        name: "reference_lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      },
      contract: contractMetadata("independent.agent-plugin-mcp"),
      commercial: commercialInput(),
      evidenceRefs: ["source:agent-plugin"],
    };
    const result = await importAgentPluginMcpCapability(source);

    expect(result).toMatchObject({
      kind: "normalized",
      draft: {
        source: {
          kind: "agent_plugin_mcp",
          selector: {
            serverName: "reference",
            toolName: "reference_lookup",
            protocolVersion: "2025-06-18",
          },
        },
        binding: {
          endpointUrl: "https://tools.example.test/mcp",
          adapter: { adapterId: "mcp-jsonrpc:v1" },
        },
      },
    });
    expect(JSON.parse(publicationSourceDescriptorJson(source))).toEqual({
      manifest: {
        name: "Reference Plugin",
        mcpServers: {
          reference: { type: "http", url: "https://tools.example.test/mcp" },
        },
      },
      serverName: "reference",
      tool: {
        name: "reference_lookup",
        inputSchema: inputSchema(),
        outputSchema: outputSchema(),
      },
    });
  });

  it.each([
    [
      {
        name: "",
        mcpServers: {
          reference: { type: "http", url: "https://tools.example.test/mcp" },
        },
      },
      "source_invalid",
    ],
    [{ name: "Reference Plugin" }, "source_invalid"],
    [
      {
        name: "Reference Plugin",
        mcpServers: { reference: "https://tools.example.test/mcp" },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: {
          reference: {
            type: "http",
            url: "https://tools.example.test/mcp",
            headers: { Authorization: "opaque-provider-credential" },
          },
        },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: { reference: { type: "stdio", command: "node" } },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: {
          reference: { type: "sse", url: "https://tools.example.test/sse" },
        },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: {
          reference: {
            type: "http",
            url: "https://tools.example.test/mcp",
            command: "node",
          },
        },
      },
      "transport_unsupported",
    ],
    [
      {
        name: "Reference Plugin",
        mcpServers: { reference: { type: "http", url: "/local/mcp" } },
      },
      "transport_unsupported",
    ],
  ] as const)(
    "rejects unresolved or local Agent Plugin MCP server manifests",
    async (manifest, reason) => {
      await expect(
        importAgentPluginMcpCapability({
          kind: "agent_plugin_mcp",
          manifest,
          serverName: "reference",
          protocolVersion: "2025-06-18",
          tool: {
            name: "reference_lookup",
            inputSchema: inputSchema(),
            outputSchema: outputSchema(),
          },
          contract: contractMetadata("independent.agent-plugin-invalid"),
          commercial: commercialInput(),
          evidenceRefs: ["source:agent-plugin:invalid"],
        }),
      ).resolves.toEqual({ kind: "refused", reason });
    },
  );
});
