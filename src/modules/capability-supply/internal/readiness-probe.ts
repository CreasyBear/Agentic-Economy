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
import { z } from "zod";
import { defaultBodySerializer } from "openapi-fetch";
import { isProviderConnectionCredentialRef } from "../provider-connection";
import type { CapabilityTransportBindingRegistration } from "@/modules/capability-supply/public";
import { validateJsonSchema } from "@/modules/capability-contract/public";
import {
  compareExactAmounts,
  exactAmountSchema,
  rescaleExactAmount,
  type ExactAmount,
} from "@/modules/money/public";
import {
  cancelResponseBody,
  readBoundedRequestText,
} from "@/lib/server/bounded-request-body";
import { isRecord } from "@/modules/common/is-record";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { credentialFromEnvironment } from "./server-credential";
import {
  decodeX402PaymentRequiredHeader,
  validateX402PaymentRequired,
} from "./x402-payment-signer";
import { probeRequestDigest } from "./graph/probe-digest";
import {
  injectHttpJsonCredential,
  parseHttpJsonTransportConfiguration,
  parseMcpJsonRpcTransportConfiguration,
  parseX402FetchTransportConfiguration,
  type HttpJsonTransportConfiguration,
  type McpJsonRpcTransportConfiguration,
  type X402FetchTransportConfiguration,
  validPublicHttpsEndpoint,
} from "./transport-adapters";
import {
  findMcpToolAcrossPages,
  prepareHttpJsonRequest,
  responseContentTypeMatches,
  type McpToolListPageRead,
} from "../route-transport-runtime";
const HEALTHY_TTL_MS = 5 * 60_000;
const UNHEALTHY_TTL_MS = 60_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

const quoteResponse = z.looseObject({
  kind: z.literal("quoted"),
  expectedCost: exactAmountSchema,
  maximumCost: exactAmountSchema,
  expectedLatencyMs: z.number().int().nonnegative(),
  dataFields: z.array(z.string()).max(128),
  disclosures: z.array(z.string()).max(64),
});

export type CapabilityProbeTarget = Readonly<{
  publicationRef: string;
  revision: number;
  bindingId: string;
  capabilityId: string;
  endpointUrl: string;
  authority: CapabilityTransportBindingRegistration["authority"];
  adapterId: string;
  probeKind?: "ae_quote" | "openapi_http" | "mcp" | "x402";
  probeQuery?: readonly Readonly<{ parameter: string; value: string }>[];
  probeMethod?: "GET" | "POST";
  transportConfigJson?: string;
  probeInputJson?: string;
  outputSchemaJson?: string;
  expectedPaymentJson?: string;
  targetDigest: string;
}>;

export type CapabilityProbeObservation = Readonly<{
  targetDigest: string;
  requestDigest: string;
  responseStatus?: number;
  responseContentType?: string;
  responseDigest?: string;
  outcome: CapabilityProbeOutcome;
  credentialState: "ready" | "unavailable";
  healthState: "healthy" | "unhealthy";
  observedAt: number;
  validUntil: number;
  evidenceRefs: readonly string[];
}>;

export type CapabilityProbeOutcome =
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

export type CapabilityProbeDependencies = Readonly<{
  /**
   * Returns the current opaque `env:` locator from the authority row. Tests may
   * inject a resolved value; production resolves the locator through the
   * server-only helper immediately before the request.
   */
  resolveProviderConnectionCredential: (
    authority: Extract<
      CapabilityTransportBindingRegistration["authority"],
      { kind: "provider_connection" }
    >,
  ) => Promise<string | undefined>;
  resolveCredential?: (reference: string) => string | undefined;
  validateTarget: (url: URL) => Promise<boolean>;
  send: (request: Request) => Promise<Response>;
  now?: () => number;
}>;

type ExpectedX402Payment = Readonly<{
  scheme: "exact";
  network: string;
  asset: string;
  payTo: string;
  currency: string;
  routeAmountExponent: number;
  assetAmountExponent: number;
  paidAmount: ExactAmount;
}>;

export async function runCapabilityReadinessProbe(
  target: CapabilityProbeTarget,
  dependencies: CapabilityProbeDependencies,
): Promise<CapabilityProbeObservation> {
  const now = (dependencies.now ?? Date.now)();
  const probeKind =
    target.probeKind ??
    (target.adapterId === "mcp-jsonrpc:v1" ? "mcp" : "ae_quote");
  const requestDigest = probeRequestDigest(target);
  const base = { targetDigest: target.targetDigest, requestDigest };

  const parsed = parseProbeConfiguration(target, probeKind);
  if (parsed.kind === "invalid") {
    return unhealthy(now, base, "ready", "response_invalid", [
      "probe:request_unrepresentable",
    ]);
  }
  if (
    probeKind === "mcp" &&
    parsed.kind === "valid" &&
    parsed.transport === "mcp" &&
    parsed.mcp.protocolVersion !== LATEST_PROTOCOL_VERSION
  ) {
    return unhealthy(now, base, "ready", "response_invalid", [
      "probe:mcp_protocol_unsupported",
    ]);
  }
  const credentialPlacement = credentialPlacementFor(target, parsed);
  if (credentialPlacement.kind === "mismatch") {
    return unhealthy(now, base, "unavailable", "credential_unavailable", [
      "probe:credential_unavailable",
    ]);
  }

  const endpoint = validPublicHttpsEndpoint(target.endpointUrl);
  if (endpoint === undefined) {
    return unhealthy(now, base, "ready", "target_not_public", [
      "probe:target_not_public",
    ]);
  }
  let targetIsPublic: boolean;
  try {
    targetIsPublic = await dependencies.validateTarget(endpoint);
  } catch {
    targetIsPublic = false;
  }
  if (!targetIsPublic) {
    return unhealthy(now, base, "ready", "target_not_public", [
      "probe:target_not_public",
    ]);
  }

  let credential: string | undefined;
  if (credentialPlacement.kind === "required") {
    const authority = target.authority;
    if (authority.kind !== "provider_connection") {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
    let reference: string | undefined;
    try {
      reference =
        await dependencies.resolveProviderConnectionCredential(authority);
    } catch {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
    if (reference === undefined || reference.trim().length === 0) {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
    credential =
      dependencies.resolveCredential?.(reference) ??
      (isProviderConnectionCredentialRef(reference)
        ? credentialFromEnvironment(reference)
        : reference);
    if (
      credential === undefined ||
      credential.trim().length === 0 ||
      isProviderConnectionCredentialRef(credential)
    ) {
      return unhealthy(now, base, "unavailable", "credential_unavailable", [
        "probe:credential_unavailable",
      ]);
    }
  }

  const credentialEvidence =
    credentialPlacement.kind === "required"
      ? "probe:credential_resolved"
      : "probe:credential_not_required";
  if (probeKind === "mcp") {
    const mcpConfiguration =
      parsed.kind === "valid" && parsed.transport === "mcp"
        ? parsed.mcp
        : undefined;
    if (mcpConfiguration === undefined) {
      return unhealthy(now, base, "ready", "response_invalid", [
        credentialEvidence,
      ]);
    }
    return await runMcpProbe(
      target,
      endpoint,
      mcpConfiguration,
      credential,
      dependencies.send,
      now,
      base,
      credentialEvidence,
    );
  }
  return await runHttpProbe(
    target,
    endpoint,
    probeKind,
    parsed,
    credential,
    dependencies.send,
    now,
    base,
    credentialEvidence,
  );
}

type ParsedProbeConfiguration =
  | Readonly<{
      kind: "valid";
      transport: "http";
      http: HttpJsonTransportConfiguration;
    }>
  | Readonly<{
      kind: "valid";
      transport: "mcp";
      mcp: McpJsonRpcTransportConfiguration;
    }>
  | Readonly<{
      kind: "valid";
      transport: "x402";
      x402: X402FetchTransportConfiguration;
    }>
  | Readonly<{ kind: "valid"; transport: "none" }>
  | Readonly<{ kind: "invalid" }>;
type ValidProbeConfiguration = Extract<
  ParsedProbeConfiguration,
  Readonly<{ kind: "valid" }>
>;

function parseProbeConfiguration(
  target: CapabilityProbeTarget,
  probeKind: CapabilityProbeTarget["probeKind"],
): ParsedProbeConfiguration {
  if (probeKind === "openapi_http" && target.adapterId === "http-json:v1") {
    let value: unknown;
    try {
      value = JSON.parse(target.transportConfigJson ?? "");
    } catch {
      return { kind: "invalid" };
    }
    const http = parseHttpJsonTransportConfiguration(value);
    return http === undefined
      ? { kind: "invalid" }
      : { kind: "valid", transport: "http", http };
  }
  if (probeKind === "mcp" && target.adapterId === "mcp-jsonrpc:v1") {
    let value: unknown;
    try {
      value = JSON.parse(target.transportConfigJson ?? "");
    } catch {
      return { kind: "invalid" };
    }
    const mcp = parseMcpJsonRpcTransportConfiguration(value);
    return mcp === undefined
      ? { kind: "invalid" }
      : { kind: "valid", transport: "mcp", mcp };
  }
  if (probeKind === "x402" && target.adapterId === "x402-fetch:v2") {
    let value: unknown;
    try {
      value = JSON.parse(target.transportConfigJson ?? "");
    } catch {
      return { kind: "invalid" };
    }
    const x402 = parseX402FetchTransportConfiguration(value);
    return x402 === undefined
      ? { kind: "invalid" }
      : { kind: "valid", transport: "x402", x402 };
  }
  if (probeKind === "ae_quote") {
    if (target.transportConfigJson === undefined)
      return { kind: "valid", transport: "none" };
    let value: unknown;
    try {
      value = JSON.parse(target.transportConfigJson);
    } catch {
      return { kind: "invalid" };
    }
    const http = parseHttpJsonTransportConfiguration(value);
    return http === undefined
      ? { kind: "invalid" }
      : { kind: "valid", transport: "http", http };
  }
  return { kind: "valid", transport: "none" };
}

function credentialPlacementFor(
  target: CapabilityProbeTarget,
  parsed: ValidProbeConfiguration,
): Readonly<{ kind: "required" | "none" | "mismatch" }> {
  if (target.probeKind === "x402") return { kind: "none" };
  const placement =
    parsed.kind === "valid" && parsed.transport === "http"
      ? parsed.http.credential
      : parsed.kind === "valid" && parsed.transport === "mcp"
        ? parsed.mcp.credential
        : undefined;
  const requiresCredential =
    placement !== undefined && placement.kind !== "none";
  if (target.authority.kind === "keyless")
    return requiresCredential ? { kind: "mismatch" } : { kind: "none" };
  return requiresCredential ? { kind: "required" } : { kind: "mismatch" };
}

async function runHttpProbe(
  target: CapabilityProbeTarget,
  endpoint: URL,
  probeKind: Exclude<CapabilityProbeTarget["probeKind"], "mcp">,
  parsed: ValidProbeConfiguration,
  credential: string | undefined,
  send: (request: Request) => Promise<Response>,
  now: number,
  base: Readonly<{ targetDigest: string; requestDigest: string }>,
  credentialEvidence: string,
): Promise<CapabilityProbeObservation> {
  const configuration =
    parsed.kind === "valid" && parsed.transport === "http"
      ? parsed.http
      : parsed.kind === "valid" && parsed.transport === "x402"
        ? parsed.x402
        : undefined;
  if (configuration === undefined && probeKind !== "ae_quote") {
    return unhealthy(now, base, "ready", "response_invalid", [
      credentialEvidence,
      "probe:request_unrepresentable",
    ]);
  }
  const method =
    target.probeMethod ??
    (configuration !== undefined && "method" in configuration
      ? configuration.method
      : "POST");
  const inputJson =
    target.probeInputJson ?? (method === "GET" ? "{}" : undefined);
  const input =
    target.probeInputJson === undefined
      ? undefined
      : parseJson(target.probeInputJson);
  if (method === "POST" && inputJson === undefined) {
    return unhealthy(now, base, "ready", "response_invalid", [
      credentialEvidence,
      "probe:request_unrepresentable",
    ]);
  }
  const httpConfiguration: HttpJsonTransportConfiguration =
    parsed.kind === "valid" && parsed.transport === "http"
      ? {
          ...parsed.http,
          method,
          ...(target.probeQuery === undefined
            ? {}
            : { fixedQuery: target.probeQuery }),
        }
      : {
          method: method === "GET" ? "GET" : "POST",
          requestTimeoutMs: 10_000,
          ...(target.probeQuery === undefined
            ? {}
            : { fixedQuery: target.probeQuery }),
          credential: { kind: "none" },
        };
  const prepared = prepareHttpJsonRequest(
    endpoint,
    httpConfiguration,
    inputJson ?? "{}",
  );
  if (prepared.kind === "refused") {
    return unhealthy(now, base, "ready", "response_invalid", [
      credentialEvidence,
      "probe:request_unrepresentable",
    ]);
  }
  const targetUrl = prepared.target;
  const applied = injectHttpJsonCredential(
    httpConfiguration,
    prepared.target,
    {
      ...(prepared.headers ?? {}),
      ...(httpConfiguration.requestContentType === undefined
        ? probeKind === "openapi_http"
          ? {}
          : { "Content-Type": "application/json" }
        : { "Content-Type": httpConfiguration.requestContentType }),
      Accept: httpConfiguration.responseContentType ?? "application/json",
    },
    credential,
  );
  if (applied === undefined) {
    return unhealthy(now, base, "unavailable", "credential_unavailable", [
      credentialEvidence,
      "probe:credential_unavailable",
    ]);
  }
  let response: Response;
  try {
    response = await send(
      new Request(applied.target, {
        method,
        redirect: "manual",
        signal: AbortSignal.timeout(httpConfiguration.requestTimeoutMs),
        headers: applied.headers,
        ...(method === "POST" &&
        input !== undefined &&
        (probeKind !== "openapi_http" ||
          httpConfiguration.requestContentType !== undefined)
          ? { body: defaultBodySerializer(input) }
          : {}),
      }),
    );
  } catch {
    return unhealthy(now, base, "ready", "transport_unreachable", [
      credentialEvidence,
      "probe:target_public",
      "probe:transport_unreachable",
    ]);
  }
  const evidence = [credentialEvidence, "probe:target_public"];
  const responseMeta = responseMetadata(response);
  if (response.status === 401 || response.status === 403) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "unavailable",
      "credential_rejected",
      [...evidence, "probe:credential_rejected"],
      responseMeta,
    );
  }
  if (probeKind === "x402" && response.status === 402) {
    const x402Configuration =
      parsed.kind === "valid" && parsed.transport === "x402"
        ? parsed.x402
        : undefined;
    return await probeX402Challenge(
      target,
      endpoint,
      targetUrl,
      x402Configuration,
      response,
      now,
      base,
      evidence,
      responseMeta,
    );
  }
  if (response.status >= 300 && response.status < 400) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "http_redirect",
      [...evidence, "probe:http_redirect"],
      responseMeta,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    const outcome =
      response.status >= 500 ? ("http_5xx" as const) : ("http_4xx" as const);
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      outcome,
      [...evidence, `probe:${outcome}`],
      responseMeta,
    );
  }
  if (
    httpConfiguration.responseStatus !== undefined &&
    response.status !== httpConfiguration.responseStatus
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:response_status_invalid"],
      responseMeta,
    );
  }
  const expectedResponseMediaType =
    httpConfiguration.responseContentType ?? "application/json";
  if (
    !responseContentTypeMatches(
      expectedResponseMediaType,
      response.headers.get("Content-Type") ?? "",
    )
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_content_type_invalid",
      [...evidence, "probe:response_content_type_invalid"],
      responseMeta,
    );
  }
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES);
  if (!bounded.ok) {
    return unhealthy(
      now,
      base,
      "ready",
      "response_too_large",
      [...evidence, "probe:response_too_large"],
      responseMeta,
    );
  }
  const parsedBody = parseJson(bounded.text);
  if (parsedBody === undefined) {
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:response_invalid"],
      {
        ...responseMeta,
        responseDigest: canonicalDigest(bounded.text),
      },
    );
  }
  if (probeKind === "openapi_http") {
    const outputSchema = parseJson(target.outputSchemaJson ?? "");
    if (
      !isRecord(outputSchema) ||
      !validateJsonSchema(outputSchema, parsedBody)
    ) {
      return unhealthy(
        now,
        base,
        "ready",
        "response_invalid",
        [...evidence, "probe:response_invalid"],
        {
          ...responseMeta,
          responseDigest: canonicalDigest(bounded.text),
        },
      );
    }
  } else if (
    probeKind === "ae_quote" &&
    !quoteResponse.safeParse(parsedBody).success
  ) {
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:response_invalid"],
      {
        ...responseMeta,
        responseDigest: canonicalDigest(bounded.text),
      },
    );
  }
  return healthy(now, base, [...evidence, "probe:http_2xx"], {
    ...responseMeta,
    responseDigest: canonicalDigest(bounded.text),
  });
}

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
  base: Readonly<{ targetDigest: string; requestDigest: string }>,
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

async function probeX402Challenge(
  target: CapabilityProbeTarget,
  endpoint: URL,
  targetUrl: URL,
  configuration: X402FetchTransportConfiguration | undefined,
  response: Response,
  now: number,
  base: Readonly<{ targetDigest: string; requestDigest: string }>,
  evidence: readonly string[],
  metadata: ResponseMetadata,
): Promise<CapabilityProbeObservation> {
  if (configuration === undefined) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_invalid"],
      metadata,
    );
  }
  let decoded: unknown;
  try {
    decoded = decodeX402PaymentRequiredHeader(
      response.headers.get("payment-required") ?? "",
    );
    decoded = validateX402PaymentRequired(decoded);
  } catch {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_invalid"],
      metadata,
    );
  }
  if (
    !isRecord(decoded) ||
    decoded.x402Version !== 2 ||
    !isRecord(decoded.resource) ||
    decoded.resource.url !== targetUrl.href ||
    !Array.isArray(decoded.accepts)
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_mismatch"],
      metadata,
    );
  }
  const expected = parseExpectedPayment(target.expectedPaymentJson);
  const requirement = decoded.accepts.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.scheme === configuration.scheme &&
      candidate.network === configuration.network &&
      typeof candidate.asset === "string" &&
      candidate.asset.toLowerCase() === configuration.asset.toLowerCase() &&
      typeof candidate.payTo === "string" &&
      candidate.payTo.toLowerCase() === configuration.payTo.toLowerCase(),
  );
  if (
    expected === undefined ||
    requirement === undefined ||
    !isRecord(requirement) ||
    expected.scheme !== configuration.scheme ||
    expected.network !== configuration.network ||
    expected.asset.toLowerCase() !== configuration.asset.toLowerCase() ||
    expected.payTo.toLowerCase() !== configuration.payTo.toLowerCase() ||
    expected.paidAmount.currency !== configuration.currency ||
    expected.paidAmount.exponent !== configuration.routeAmountExponent ||
    !/^(?:0|[1-9]\d{0,77})$/.test(String(requirement.amount))
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_mismatch"],
      metadata,
    );
  }
  const expectedAsset = rescaleExactAmount(
    expected.paidAmount,
    configuration.assetAmountExponent,
  );
  const received = exactAmountSchema.safeParse({
    currency: expected.paidAmount.currency,
    units: requirement.amount,
    exponent: configuration.assetAmountExponent,
  });
  if (
    expectedAsset === undefined ||
    !received.success ||
    compareExactAmounts(expectedAsset, received.data) !== 0
  ) {
    await cancelResponseBody(response);
    return unhealthy(
      now,
      base,
      "ready",
      "response_invalid",
      [...evidence, "probe:x402_payment_required_amount_mismatch"],
      metadata,
    );
  }
  const bounded = await readBoundedRequestText(response, MAX_RESPONSE_BYTES);
  const observedMetadata = bounded.ok
    ? { ...metadata, responseDigest: canonicalDigest(bounded.text) }
    : metadata;
  return healthy(
    now,
    base,
    [...evidence, "probe:x402_payment_required_valid"],
    observedMetadata,
  );
}

function parseExpectedPayment(
  value: string | undefined,
): ExpectedX402Payment | undefined {
  const parsed = parseJson(value ?? "");
  if (
    !isRecord(parsed) ||
    parsed.scheme !== "exact" ||
    typeof parsed.network !== "string" ||
    typeof parsed.asset !== "string" ||
    typeof parsed.payTo !== "string" ||
    typeof parsed.currency !== "string" ||
    typeof parsed.routeAmountExponent !== "number" ||
    typeof parsed.assetAmountExponent !== "number"
  )
    return undefined;
  const paidAmount = exactAmountSchema.safeParse(parsed.paidAmount);
  return paidAmount.success
    ? {
        scheme: "exact",
        network: parsed.network,
        asset: parsed.asset,
        payTo: parsed.payTo,
        currency: parsed.currency,
        routeAmountExponent: parsed.routeAmountExponent,
        assetAmountExponent: parsed.assetAmountExponent,
        paidAmount: paidAmount.data,
      }
    : undefined;
}

type ResponseMetadata = Readonly<{
  responseStatus?: number;
  responseContentType?: string;
  responseDigest?: string;
}>;

function responseMetadata(response: Response): ResponseMetadata {
  const contentType = response.headers.get("Content-Type")?.trim();
  return {
    responseStatus: response.status,
    ...(contentType === undefined || contentType.length === 0
      ? {}
      : { responseContentType: contentType.slice(0, 200) }),
  };
}

function healthy(
  now: number,
  base: Readonly<{ targetDigest: string; requestDigest: string }>,
  evidenceRefs: readonly string[],
  metadata: ResponseMetadata = {},
): CapabilityProbeObservation {
  return {
    ...base,
    ...metadata,
    outcome: "healthy",
    credentialState: "ready",
    healthState: "healthy",
    observedAt: now,
    validUntil: now + HEALTHY_TTL_MS,
    evidenceRefs: [...evidenceRefs],
  };
}

function unhealthy(
  now: number,
  base: Readonly<{ targetDigest: string; requestDigest: string }>,
  credentialState: "ready" | "unavailable",
  outcome: Exclude<CapabilityProbeOutcome, "healthy">,
  evidenceRefs: readonly string[],
  metadata: ResponseMetadata = {},
): CapabilityProbeObservation {
  return {
    ...base,
    ...metadata,
    outcome,
    credentialState,
    healthState: "unhealthy",
    observedAt: now,
    validUntil: now + UNHEALTHY_TTL_MS,
    evidenceRefs: [...evidenceRefs],
  };
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
