import { z } from "zod";
import { defaultBodySerializer } from "openapi-fetch";
import { validateJsonSchema } from "@/modules/capability-contract/public";
import { exactAmountSchema } from "@/modules/money/public";
import {
  cancelResponseBody,
  readBoundedRequestText,
} from "@/lib/server/bounded-request-body";
import { isRecord } from "@/modules/common/is-record";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import {
  injectHttpJsonCredential,
  parseHttpJsonTransportConfiguration,
  type HttpJsonTransportConfiguration,
  type X402FetchTransportConfiguration,
} from "./transport-adapters";
import {
  prepareHttpJsonRequest,
  responseContentTypeMatches,
} from "../route-transport-runtime";
import {
  MAX_RESPONSE_BYTES,
  healthy,
  parseJson,
  responseMetadata,
  unhealthy,
  type CapabilityProbeObservation,
  type CapabilityProbeTarget,
  type ProbeCommand,
  type ProbeCommandContext,
  type ProbeObservationBase,
  type ResponseMetadata,
  type ValidProbeConfiguration,
} from "./readiness-probe-shared";

const quoteResponse = z.looseObject({
  kind: z.literal("quoted"),
  expectedCost: exactAmountSchema,
  maximumCost: exactAmountSchema,
  expectedLatencyMs: z.number().int().nonnegative(),
  dataFields: z.array(z.string()).max(128),
  disclosures: z.array(z.string()).max(64),
});

export function parseJsonTransportConfig(
  target: CapabilityProbeTarget,
): unknown | undefined {
  try {
    return JSON.parse(target.transportConfigJson ?? "");
  } catch {
    return undefined;
  }
}

export function authorityCredentialPlacement(
  target: CapabilityProbeTarget,
  placement: HttpJsonTransportConfiguration["credential"] | undefined,
): Readonly<{ kind: "required" | "none" | "mismatch" }> {
  const requiresCredential =
    placement !== undefined && placement.kind !== "none";
  if (target.authority.kind === "keyless")
    return requiresCredential ? { kind: "mismatch" } : { kind: "none" };
  return requiresCredential ? { kind: "required" } : { kind: "mismatch" };
}

export const httpJsonProbeCommand: ProbeCommand = {
  parse(target) {
    const value = parseJsonTransportConfig(target);
    if (value === undefined) {
      return { kind: "invalid", evidence: "probe:request_unrepresentable" };
    }
    const http = parseHttpJsonTransportConfiguration(value);
    return http === undefined
      ? { kind: "invalid", evidence: "probe:request_unrepresentable" }
      : { kind: "valid", transport: "http", http };
  },
  credentialPlacement(target, parsed) {
    return authorityCredentialPlacement(
      target,
      parsed.transport === "http" ? parsed.http.credential : undefined,
    );
  },
  execute(context) {
    return executeHttpJsonProbe(context, interpretHttpJsonSuccess);
  },
};

export const aeQuoteProbeCommand: ProbeCommand = {
  parse(target) {
    if (target.transportConfigJson === undefined) {
      return { kind: "valid", transport: "none" };
    }
    let value: unknown;
    try {
      value = JSON.parse(target.transportConfigJson);
    } catch {
      return { kind: "invalid", evidence: "probe:request_unrepresentable" };
    }
    const http = parseHttpJsonTransportConfiguration(value);
    return http === undefined
      ? { kind: "invalid", evidence: "probe:request_unrepresentable" }
      : { kind: "valid", transport: "http", http };
  },
  credentialPlacement(target, parsed) {
    return authorityCredentialPlacement(
      target,
      parsed.transport === "http" ? parsed.http.credential : undefined,
    );
  },
  execute(context) {
    return executeHttpJsonProbe(context, interpretQuoteSuccess);
  },
};

function httpJsonConfigurationForProbe(
  parsed: ValidProbeConfiguration,
  target: CapabilityProbeTarget,
  method: "GET" | "POST",
): HttpJsonTransportConfiguration {
  const fixedQuery =
    target.probeQuery === undefined ? {} : { fixedQuery: target.probeQuery };
  switch (parsed.transport) {
    case "http":
      return { ...parsed.http, method, ...fixedQuery };
    case "x402":
      return {
        method: parsed.x402.method,
        requestTimeoutMs: parsed.x402.requestTimeoutMs,
        ...(parsed.x402.query === undefined ? {} : { query: parsed.x402.query }),
        ...fixedQuery,
        credential: { kind: "none" },
      };
    case "mcp":
    case "none":
      return {
        method: method === "GET" ? "GET" : "POST",
        requestTimeoutMs: 10_000,
        ...fixedQuery,
        credential: { kind: "none" },
      };
    default: {
      const _exhaustive: never = parsed;
      return _exhaustive;
    }
  }
}

function interpretHttpJsonSuccess(
  target: CapabilityProbeTarget,
  parsedBody: unknown,
): boolean {
  if (target.outputSchemaJson === undefined) {
    return quoteResponse.safeParse(parsedBody).success;
  }
  const outputSchema = parseJson(target.outputSchemaJson);
  return isRecord(outputSchema) && validateJsonSchema(outputSchema, parsedBody);
}

function interpretQuoteSuccess(
  _target: CapabilityProbeTarget,
  parsedBody: unknown,
): boolean {
  return quoteResponse.safeParse(parsedBody).success;
}

export function interpretJsonSuccess(
  _target: CapabilityProbeTarget,
  _parsedBody: unknown,
): boolean {
  return true;
}

export async function executeHttpJsonProbe(
  context: ProbeCommandContext,
  interpretSuccess: (
    target: CapabilityProbeTarget,
    parsedBody: unknown,
  ) => boolean,
  hooks: Readonly<{
    onPaymentRequired?: (
      target: CapabilityProbeTarget,
      endpoint: URL,
      targetUrl: URL,
      configuration: X402FetchTransportConfiguration | undefined,
      response: Response,
      now: number,
      base: ProbeObservationBase,
      evidence: readonly string[],
      metadata: ResponseMetadata,
    ) => Promise<CapabilityProbeObservation>;
  }> = {},
): Promise<CapabilityProbeObservation> {
  const { target, endpoint, parsed, credential, send, now, base, credentialEvidence } =
    context;
  const configuration =
    parsed.transport === "http"
      ? parsed.http
      : parsed.transport === "x402"
        ? parsed.x402
        : undefined;
  if (configuration === undefined && parsed.transport !== "none") {
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
  const httpConfiguration = httpJsonConfigurationForProbe(parsed, target, method);
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
  const queryMappings = httpConfiguration.query ?? [];
  const includeJsonBody =
    method === "POST" &&
    input !== undefined &&
    (httpConfiguration.requestContentType !== undefined ||
      queryMappings.length === 0);
  const applied = injectHttpJsonCredential(
    httpConfiguration,
    prepared.target,
    {
      ...(prepared.headers ?? {}),
      ...(httpConfiguration.requestContentType === undefined
        ? includeJsonBody
          ? { "Content-Type": "application/json" }
          : {}
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
        ...(includeJsonBody && input !== undefined
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
  if (response.status === 402 && hooks.onPaymentRequired !== undefined) {
    const x402Configuration =
      parsed.transport === "x402" ? parsed.x402 : undefined;
    return await hooks.onPaymentRequired(
      target,
      endpoint,
      prepared.target,
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
  if (parsedBody === undefined || !interpretSuccess(target, parsedBody)) {
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
