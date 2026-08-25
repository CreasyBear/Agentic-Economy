import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type {
  FetchLike,
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import { validateJsonSchema } from "@/modules/capability-contract/public";
import { readBoundedRequestText } from "@/lib/server/bounded-request-body";
import { isRecord } from "@/modules/common/is-record";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  injectHttpJsonCredential,
  parseMcpJsonRpcTransportConfiguration,
  type HttpJsonTransportConfiguration,
  type McpJsonRpcTransportConfiguration,
} from "./transport-adapters";
import {
  findMcpToolAcrossPages,
  type McpToolListPageRead,
} from "../route-transport-runtime";
import {
  authorityCredentialPlacement,
  parseJsonTransportConfig,
} from "./readiness-probe-http";
import {
  MAX_RESPONSE_BYTES,
  healthy,
  parseJson,
  responseMetadata,
  unhealthy,
  type CapabilityProbeObservation,
  type CapabilityProbeTarget,
  type ProbeCommand,
  type ProbeObservationBase,
  type ResponseMetadata,
} from "./readiness-probe-shared";

export const mcpProbeCommand: ProbeCommand = {
  parse(target) {
    const value = parseJsonTransportConfig(target);
    if (value === undefined) {
      return { kind: "invalid", evidence: "probe:request_unrepresentable" };
    }
    const mcp = parseMcpJsonRpcTransportConfiguration(value);
    if (mcp === undefined) {
      return { kind: "invalid", evidence: "probe:request_unrepresentable" };
    }
    if (mcp.protocolVersion !== LATEST_PROTOCOL_VERSION) {
      return { kind: "invalid", evidence: "probe:mcp_protocol_unsupported" };
    }
    return { kind: "valid", transport: "mcp", mcp };
  },
  credentialPlacement(target, parsed) {
    return authorityCredentialPlacement(
      target,
      parsed.transport === "mcp" ? parsed.mcp.credential : undefined,
    );
  },
  execute(context) {
    return runMcpProbe(
      context.target,
      context.endpoint,
      context.parsed.transport === "mcp" ? context.parsed.mcp : undefined,
      context.credential,
      context.send,
      context.now,
      context.base,
      context.credentialEvidence,
    );
  },
};

type McpToolsListFailure =
  | Readonly<{ kind: "transport_unreachable" }>
  | Readonly<{ kind: "credential_rejected"; metadata: ResponseMetadata }>
  | Readonly<{
      kind: "http_refused";
      outcome: "http_4xx" | "http_5xx";
      metadata: ResponseMetadata;
    }>
  | Readonly<{ kind: "invalid"; metadata: ResponseMetadata }>;

async function runMcpProbe(
  target: CapabilityProbeTarget,
  endpoint: URL,
  configuration: McpJsonRpcTransportConfiguration | undefined,
  credential: string | undefined,
  send: (request: Request) => Promise<Response>,
  now: number,
  base: ProbeObservationBase,
  credentialEvidence: string,
): Promise<CapabilityProbeObservation> {
  if (configuration === undefined || target.probeInputJson === undefined) {
    return unhealthy(now, base, "ready", "response_invalid", [
      credentialEvidence,
      "probe:request_unrepresentable",
    ]);
  }
  const input = parseJson(target.probeInputJson);
  if (!isRecord(input)) {
    return unhealthy(now, base, "ready", "response_invalid", [
      credentialEvidence,
      "probe:request_unrepresentable",
    ]);
  }
  const httpConfiguration: HttpJsonTransportConfiguration = {
    method: "POST",
    requestTimeoutMs: configuration.requestTimeoutMs,
    ...(configuration.credential === undefined
      ? {}
      : { credential: configuration.credential }),
  };
  const common = injectHttpJsonCredential(
    httpConfiguration,
    endpoint,
    {
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
    },
    credential,
  );
  if (common === undefined) {
    return unhealthy(now, base, "unavailable", "credential_unavailable", [
      credentialEvidence,
      "probe:credential_unavailable",
    ]);
  }

  let lastResponseMetadata: ResponseMetadata = {};
  const fetchThroughGuard: FetchLike = async (inputUrl, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body;
    const headers = init?.headers;
    const requestSignal = init?.signal;
    const signal =
      requestSignal === undefined ||
      requestSignal === null ||
      requestSignal.aborted
        ? AbortSignal.timeout(configuration.requestTimeoutMs)
        : AbortSignal.any([
            requestSignal,
            AbortSignal.timeout(configuration.requestTimeoutMs),
          ]);
    const request = new Request(inputUrl, {
      method,
      redirect: "manual",
      ...(headers === undefined ? {} : { headers }),
      signal,
      ...(body === undefined || method === "GET" || method === "HEAD"
        ? {}
        : { body }),
    });
    const response = await send(request);
    const responseMeta = responseMetadata(response);
    const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES);
    if (!bounded.ok) {
      throw Object.assign(new Error("payload_too_large"), {
        name: "PayloadTooLarge",
      });
    }
    const responseDigest = canonicalDigest(bounded.text);
    if (method !== "GET" && method !== "DELETE") {
      lastResponseMetadata = { ...responseMeta, responseDigest };
    }
    return new Response(bounded.text, {
      status: response.status,
      headers: response.headers,
    });
  };
  const transport = new StreamableHTTPClientTransport(common.target, {
    requestInit: { redirect: "manual", headers: common.headers },
    fetch: fetchThroughGuard,
    reconnectionOptions: {
      initialReconnectionDelay: configuration.requestTimeoutMs,
      maxReconnectionDelay: configuration.requestTimeoutMs,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  });
  const clientTransport: Transport = {
    start: () => transport.start(),
    send: (message, options?: TransportSendOptions) =>
      transport.send(message, options),
    close: () => transport.close(),
    setProtocolVersion: (version) => transport.setProtocolVersion(version),
  };
  Object.defineProperties(clientTransport, {
    onclose: {
      configurable: true,
      get: () => transport.onclose,
      set: (handler: Transport["onclose"]) => {
        if (handler === undefined) delete transport.onclose;
        else transport.onclose = handler;
      },
    },
    onerror: {
      configurable: true,
      get: () => transport.onerror,
      set: (handler: Transport["onerror"]) => {
        if (handler === undefined) delete transport.onerror;
        else transport.onerror = handler;
      },
    },
    onmessage: {
      configurable: true,
      get: () => transport.onmessage,
      set: (handler: Transport["onmessage"]) => {
        if (handler === undefined) delete transport.onmessage;
        else transport.onmessage = handler;
      },
    },
  });
  const client = new Client({ name: "Agentic Economy", version: "1" });
  const requestOptions = {
    timeout: configuration.requestTimeoutMs,
    maxTotalTimeout: configuration.requestTimeoutMs,
  };
  const evidence = [credentialEvidence, "probe:target_public"];
  try {
    try {
      await client.connect(clientTransport, requestOptions);
    } catch (error) {
      const status = mcpHttpStatus(error);
      if (status === 401 || status === 403) {
        return unhealthy(
          now,
          base,
          "unavailable",
          "credential_rejected",
          [...evidence, "probe:credential_rejected"],
          lastResponseMetadata,
        );
      }
      if (status !== undefined) {
        return unhealthy(
          now,
          base,
          "ready",
          status >= 500 ? "http_5xx" : "http_4xx",
          [...evidence, "probe:mcp_initialize_refused"],
          lastResponseMetadata,
        );
      }
      if (mcpInvalidError(error)) {
        return unhealthy(
          now,
          base,
          "ready",
          "response_invalid",
          [...evidence, "probe:mcp_initialize_invalid"],
          lastResponseMetadata,
        );
      }
      return unhealthy(now, base, "ready", "transport_unreachable", [
        ...evidence,
        "probe:transport_unreachable",
      ]);
    }
    if (
      transport.protocolVersion !== LATEST_PROTOCOL_VERSION ||
      client.getServerCapabilities()?.tools === undefined
    ) {
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:mcp_initialize_invalid"],
        lastResponseMetadata,
      );
    }

    let toolsMetadata = lastResponseMetadata;
    const toolsLookup = await findMcpToolAcrossPages<McpToolsListFailure>(
      configuration.toolName,
      async (cursor): Promise<McpToolListPageRead<McpToolsListFailure>> => {
        try {
          const result = await client.listTools(
            cursor === undefined ? {} : { cursor },
            requestOptions,
          );
          toolsMetadata = lastResponseMetadata;
          return {
            kind: "ok",
            page: {
              tools: result.tools,
              ...(result.nextCursor === undefined
                ? {}
                : { nextCursor: result.nextCursor }),
            },
          };
        } catch (error) {
          const status = mcpHttpStatus(error);
          if (status === 401 || status === 403) {
            return {
              kind: "error",
              failure: {
                kind: "credential_rejected",
                metadata: lastResponseMetadata,
              },
            };
          }
          if (status !== undefined) {
            return {
              kind: "error",
              failure: {
                kind: "http_refused",
                outcome: status >= 500 ? "http_5xx" : "http_4xx",
                metadata: lastResponseMetadata,
              },
            };
          }
          if (mcpInvalidError(error)) {
            return {
              kind: "error",
              failure: { kind: "invalid", metadata: lastResponseMetadata },
            };
          }
          return { kind: "error", failure: { kind: "transport_unreachable" } };
        }
      },
    );
    if (toolsLookup.kind === "error") {
      const failure = toolsLookup.failure;
      if (failure.kind === "transport_unreachable") {
        return unhealthy(now, base, "ready", "transport_unreachable", [
          ...evidence,
          "probe:mcp_tools_list_unreachable",
        ]);
      }
      if (failure.kind === "credential_rejected") {
        return unhealthy(
          now,
          base,
          "unavailable",
          "credential_rejected",
          [...evidence, "probe:credential_rejected"],
          failure.metadata,
        );
      }
      if (failure.kind === "http_refused") {
        return unhealthy(
          now,
          base,
          "ready",
          failure.outcome,
          [...evidence, "probe:mcp_tools_list_refused"],
          failure.metadata,
        );
      }
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:mcp_tools_list_invalid"],
        failure.metadata,
      );
    }
    if (toolsLookup.kind === "missing") {
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:mcp_tool_missing"],
        toolsMetadata,
      );
    }
    if (toolsLookup.kind === "cursor_cycle") {
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:mcp_tools_list_cursor_cycle"],
        toolsMetadata,
      );
    }
    if (toolsLookup.kind === "page_limit") {
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:mcp_tools_list_page_limit"],
        toolsMetadata,
      );
    }
    if (toolsLookup.kind === "tool_limit") {
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:mcp_tools_list_tool_limit"],
        toolsMetadata,
      );
    }

    try {
      const callResult = await client.callTool(
        { name: configuration.toolName, arguments: input },
        undefined,
        requestOptions,
      );
      const callMetadata = lastResponseMetadata;
      if (isRecord(callResult) && callResult.isError === true) {
        return unhealthy(
          now,
          base,
          "ready",
          "response_invalid",
          [...evidence, "probe:mcp_result_invalid"],
          callMetadata,
        );
      }
      const output = mcpOutput(callResult);
      const outputSchema = parseJson(target.outputSchemaJson ?? "");
      if (
        output === undefined ||
        !isRecord(outputSchema) ||
        !validateJsonSchema(outputSchema, output)
      ) {
        return unhealthy(
          now,
          base,
          "ready",
          "response_invalid",
          [...evidence, "probe:response_invalid"],
          callMetadata,
        );
      }
      return healthy(
        now,
        base,
        [...evidence, "probe:mcp_tools_call_valid"],
        callMetadata,
      );
    } catch (error) {
      const status = mcpHttpStatus(error);
      if (status === 401 || status === 403) {
        return unhealthy(
          now,
          base,
          "unavailable",
          "credential_rejected",
          [...evidence, "probe:credential_rejected"],
          lastResponseMetadata,
        );
      }
      if (status !== undefined) {
        return unhealthy(
          now,
          base,
          "ready",
          status >= 500 ? "http_5xx" : "http_4xx",
          [...evidence, "probe:mcp_tools_call_refused"],
          lastResponseMetadata,
        );
      }
      if (mcpInvalidError(error)) {
        return unhealthy(
          now,
          base,
          "ready",
          "response_invalid",
          [...evidence, "probe:mcp_result_invalid"],
          lastResponseMetadata,
        );
      }
      return unhealthy(now, base, "ready", "transport_unreachable", [
        ...evidence,
        "probe:mcp_tools_call_unreachable",
      ]);
    }
  } finally {
    if (transport.sessionId !== undefined) {
      try {
        await transport.terminateSession();
      } catch {
        // Cleanup failures must not replace the readiness outcome.
      }
    }
    try {
      await transport.close();
    } catch {
      // Cleanup failures must not replace the readiness outcome.
    }
  }
}

function mcpHttpStatus(error: unknown): number | undefined {
  return error instanceof StreamableHTTPError &&
    error.code !== undefined &&
    error.code >= 100
    ? error.code
    : undefined;
}

function mcpInvalidError(error: unknown): boolean {
  return (
    (error instanceof StreamableHTTPError && error.code === -1) ||
    (error instanceof Error &&
      [
        "mcperror",
        "$zoderror",
        "payloadtoolarge",
        "syntaxerror",
        "zoderror",
      ].includes(error.name.toLowerCase()))
  );
}

function mcpOutput(result: unknown): unknown {
  if (!isRecord(result)) return undefined;
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (!Array.isArray(result.content)) return undefined;
  const text = result.content.find(
    (item) =>
      isRecord(item) && item.type === "text" && typeof item.text === "string",
  );
  return isRecord(text) && typeof text.text === "string"
    ? parseJson(text.text)
    : undefined;
}
