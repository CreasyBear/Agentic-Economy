import { execFile } from "node:child_process";

import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import { type JsonValue } from "../../src/modules/capability-contract/public";
import {
  callRecoveryResultSchema,
  callStatusResultSchema,
} from "../../src/modules/capability-execution/call-recovery.actions";
import {
  callResultSchema,
  callInputSchema,
  callUsageSchema,
  type CallResult,
  type CallUsageSummary,
} from "../../src/modules/capability-execution/call-contracts";
import { CALL_HTTP_PATH } from "../../src/modules/capability-execution/call-entry";
import {
  TOOL_QUOTE_PATH,
  toolQuoteInputSchema,
  toolQuoteResultSchema,
  type ToolQuoteResult,
} from "../../src/modules/capability-execution/quote";
import {
  GatewaySmokeError,
  digestSchema,
  sameAmount,
} from "./tool-gateway-production-smoke-receipt";

const MAX_STATUS_WAIT_MS = 60_000;
const DEFAULT_STATUS_DELAY_MS = 250;
const MAX_STATUS_DELAY_MS = 2_000;
const FRESH_STATUS_PROCESS_TIMEOUT_MS = 15_000;
const MAX_FRESH_STATUS_STDOUT_BYTES = 64 * 1024;
const MAX_FRESH_STATUS_STDERR_BYTES = 16 * 1024;

export type GatewayCallConfig = Readonly<{
  baseUrl: string;
  apiKey: string;
  input: Readonly<Record<string, JsonValue>>;
  fetch: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxStatusWaitMs?: number;
  statusDelayMs?: number;
}>;

export type GatewayCallTarget = Readonly<{ toolRef: string }>;
export type GatewayToolQuote = Extract<
  ToolQuoteResult,
  { kind: "committed" }
>;
export type GatewayToolQuoteObservation =
  | ToolQuoteResult
  | GatewaySmokeUnknown;

export type GatewayHttpResponse = Readonly<{ status: number; body: unknown }>;
export type GatewaySmokeUnknown = Readonly<{
  kind: "unknown";
  code: string;
  status?: number;
  retryable: boolean;
}>;
export type GatewayCallObservation =
  CallResult | GatewaySmokeUnknown;
export type GatewayCompletedCall = Extract<
  CallResult,
  { kind: "completed" }
>;
export type GatewayPendingCall = Extract<
  CallResult,
  { kind: "pending" }
>;

export function parseGatewayToolQuoteResponse(
  response: GatewayHttpResponse,
  expectedToolRef?: string,
): GatewayToolQuoteObservation {
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const parsed = toolQuoteResultSchema.safeParse(response.body);
  if (
    !parsed.success ||
    (expectedToolRef !== undefined && parsed.data.toolRef !== expectedToolRef)
  )
    return {
      kind: "unknown",
      code: "malformed_quote",
      status: response.status,
      retryable: false,
    };
  return parsed.data;
}

export async function requestGatewayToolQuote(
  config: Pick<GatewayCallConfig, "baseUrl" | "apiKey" | "input" | "fetch">,
  tool: GatewayCallTarget,
): Promise<GatewayToolQuoteObservation> {
  const input = toolQuoteInputSchema.safeParse({
    toolRef: tool.toolRef,
    input: config.input,
  });
  if (!input.success)
    throw new GatewaySmokeError("gateway_smoke_quote_input_invalid");
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}${TOOL_QUOTE_PATH}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(input.data),
    },
    config.apiKey,
  );
  const result = parseGatewayToolQuoteResponse(response, tool.toolRef);
  return result.kind === "committed"
    ? validateGatewayToolQuote(result, tool.toolRef)
    : result;
}

function validateGatewayToolQuote(
  quote: GatewayToolQuote,
  expectedToolRef: string,
): GatewayToolQuote {
  if (
    quote.toolRef !== expectedToolRef ||
    !callInputSchema.safeParse({
      quoteRef: quote.quoteRef,
      idempotencyKey: "quote-contract-validation",
    }).success ||
    quote.continuation.input.quoteRef !== quote.quoteRef ||
    !digestSchema.safeParse(quote.evidenceDigest).success
  )
    throw new GatewaySmokeError("gateway_smoke_quote_result_malformed");
  return quote;
}

export async function acquireGatewayToolQuote(
  config: Pick<GatewayCallConfig, "baseUrl" | "apiKey" | "input" | "fetch">,
  tool: GatewayCallTarget,
): Promise<GatewayToolQuote> {
  const result = await requestGatewayToolQuote(config, tool);
  if (result.kind === "committed")
    return validateGatewayToolQuote(result, tool.toolRef);
  throw new GatewaySmokeError(
    `gateway_smoke_tool_quote_${result.code}`,
  );
}

export async function callGatewayTool(
  config: GatewayCallConfig,
  tool: GatewayCallTarget,
  quote: GatewayToolQuote,
  idempotencyKey: string,
): Promise<GatewayCallObservation> {
  const boundQuote = validateGatewayToolQuote(quote, tool.toolRef);
  const input = callInputSchema.safeParse({
    quoteRef: boundQuote.quoteRef,
    idempotencyKey,
  });
  if (!input.success)
    throw new GatewaySmokeError("gateway_smoke_call_input_invalid");
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}${CALL_HTTP_PATH}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(input.data),
    },
    config.apiKey,
  );
  return parseGatewayCallResponse(response, tool.toolRef);
}

function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
}

export function parseGatewayCallResponse(
  response: GatewayHttpResponse,
  expectedToolRef?: string,
): GatewayCallObservation {
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const parsed = callResultSchema.safeParse(response.body);
  if (
    !parsed.success ||
    (expectedToolRef !== undefined &&
      parsed.data.toolRef !== expectedToolRef)
  )
    return {
      kind: "unknown",
      code: "malformed_result",
      status: response.status,
      retryable: false,
    };
  return parsed.data;
}

export async function pollGatewayCall(
  config: GatewayCallConfig,
  initial: GatewayCallObservation,
): Promise<GatewayCallObservation> {
  if (initial.kind !== "pending") return initial;
  const started = config.now?.() ?? Date.now();
  let current = initial;
  while (
    (config.now?.() ?? Date.now()) - started <
    Math.min(config.maxStatusWaitMs ?? MAX_STATUS_WAIT_MS, MAX_STATUS_WAIT_MS)
  ) {
    await (config.sleep ?? delay)(
      Math.min(
        Math.max(current.retryAfterMs, DEFAULT_STATUS_DELAY_MS),
        config.statusDelayMs ?? MAX_STATUS_DELAY_MS,
      ),
    );
    const next = await readGatewayCallStatus(config, initial.callRef);
    if (next.kind !== "pending") return next;
    current = next;
  }
  return {
    kind: "unknown",
    code: "status_timeout",
    status: 200,
    retryable: true,
  };
}

function gatewayCallObservationFromStatusResult(
  result: z.infer<typeof callStatusResultSchema>,
): GatewayCallObservation {
  if (result.kind === "refused")
    return {
      kind: "unknown",
      code: result.code,
      retryable: result.retryable,
    };
  if (result.kind === "unchanged")
    return {
      kind: "unknown",
      code: "status_unchanged",
      retryable: true,
    };
  if (result.result !== undefined) return result.result;
  return {
    kind: "pending",
    callRef: result.callRef,
    toolRef: result.toolRef,
    retryAfterMs: DEFAULT_STATUS_DELAY_MS,
  };
}

type FreshStatusCliOutput = Readonly<{
  stdout: string;
  stderr: string;
}>;

function runFreshStatusCli(
  config: GatewayCallConfig,
  callRef: string,
): Promise<FreshStatusCliOutput> {
  let baseOrigin: string;
  try {
    baseOrigin = new URL(config.baseUrl).origin;
  } catch {
    return Promise.reject(
      new GatewaySmokeError("gateway_smoke_fresh_status_base_url_invalid"),
    );
  }
  const path = process.env.PATH;
  const env: NodeJS.ProcessEnv = {
    ...(path === undefined ? {} : { PATH: path }),
    AE_CLI_BASE_URL: config.baseUrl,
    AE_API_KEY: config.apiKey,
    AE_API_KEY_ORIGIN: baseOrigin,
  };
  const {
    promise,
    resolve: resolveOutput,
    reject: rejectOutput,
  } = Promise.withResolvers<FreshStatusCliOutput>();
  try {
    execFile(
      "npm",
      ["run", "-s", "ae", "--", "status", callRef, "--json"],
      {
        cwd: process.cwd(),
        env,
        encoding: "utf8",
        timeout: FRESH_STATUS_PROCESS_TIMEOUT_MS,
        maxBuffer: Math.max(
          MAX_FRESH_STATUS_STDOUT_BYTES,
          MAX_FRESH_STATUS_STDERR_BYTES,
        ),
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          rejectOutput(error);
          return;
        }
        if (
          Buffer.byteLength(stdout, "utf8") > MAX_FRESH_STATUS_STDOUT_BYTES ||
          Buffer.byteLength(stderr, "utf8") > MAX_FRESH_STATUS_STDERR_BYTES
        ) {
          rejectOutput(
            new Error("gateway_smoke_fresh_status_output_unbounded"),
          );
          return;
        }
        resolveOutput({ stdout, stderr });
      },
    );
  } catch (error) {
    rejectOutput(error);
  }
  return promise;
}

export function parseFreshProcessGatewayStatusOutput(
  text: string,
  callRef: string,
): GatewayCallObservation {
  const trimmed = text.trim();
  if (trimmed.length === 0)
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_empty");
  let body: unknown;
  try {
    body = JSON.parse(trimmed) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_invalid");
  }
  const parsed = callStatusResultSchema.safeParse(body);
  if (!parsed.success || parsed.data.callRef !== callRef)
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_invalid");
  return gatewayCallObservationFromStatusResult(parsed.data);
}

export async function readGatewayCallStatus(
  config: GatewayCallConfig,
  callRef: string,
): Promise<GatewayCallObservation> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/calls/${encodeURIComponent(callRef)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
    },
    config.apiKey,
  );
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const parsed = callRecoveryResultSchema.safeParse(response.body);
  if (!parsed.success)
    return {
      kind: "unknown",
      code: "malformed_result",
      status: response.status,
      retryable: false,
    };
  if (parsed.data.kind === "reconciliation_required")
    return {
      kind: "unknown",
      code: "reconciliation_required",
      status: response.status,
      retryable: true,
    };
  if (parsed.data.kind === "refused")
    return {
      kind: "unknown",
      code: parsed.data.code,
      status: response.status,
      retryable: parsed.data.retryable,
    };
  if (parsed.data.kind === "unchanged")
    return {
      kind: "unknown",
      code: "status_unchanged",
      status: response.status,
      retryable: true,
    };
  if (parsed.data.result !== undefined) return parsed.data.result;
  return {
    kind: "pending",
    callRef: parsed.data.callRef,
    toolRef: parsed.data.toolRef,
    retryAfterMs: DEFAULT_STATUS_DELAY_MS,
  };
}

export async function readFreshProcessGatewayCallStatus(
  config: GatewayCallConfig,
  callRef: string,
): Promise<GatewayCallObservation> {
  let output: FreshStatusCliOutput;
  try {
    output = await runFreshStatusCli(config, callRef);
  } catch {
    throw new GatewaySmokeError("gateway_smoke_fresh_status_process_failed");
  }
  return parseFreshProcessGatewayStatusOutput(output.stdout, callRef);
}

export function assertGatewayPaidCompletion(
  tool: Readonly<{ toolRef: string; quote: GatewayToolQuote }>,
  completed: GatewayCompletedCall,
): CallUsageSummary {
  if (completed.toolRef !== tool.toolRef)
    throw new GatewaySmokeError("gateway_smoke_completed_tool_mismatch");
  const usage = callUsageSchema.parse(completed.usage);
  if (
    usage.chargeState !== "paid" ||
    !sameAmount(tool.quote.price, usage.amount) ||
    !digestSchema.safeParse(usage.priceDigest).success ||
    usage.transactionRef === undefined
  )
    throw new GatewaySmokeError("gateway_smoke_paid_usage_mismatch");
  return usage;
}

export function assertGatewayCallReplayParity(
  expected: GatewayCompletedCall,
  replay: GatewayCompletedCall,
): void {
  if (expected.toolRef !== replay.toolRef)
    throw new GatewaySmokeError("replay_tool_mismatch");
  if (expected.callRef !== replay.callRef)
    throw new GatewaySmokeError("replay_call_mismatch");
  if (expected.evidenceHash !== replay.evidenceHash)
    throw new GatewaySmokeError("replay_evidence_mismatch");
  if (canonicalDigest(expected.output) !== canonicalDigest(replay.output))
    throw new GatewaySmokeError("replay_output_mismatch");
  if (canonicalDigest(expected.usage) !== canonicalDigest(replay.usage))
    throw new GatewaySmokeError("replay_usage_mismatch");
}

export async function readGatewayCompletionMetadata(
  config: Pick<GatewayCallConfig, "baseUrl" | "apiKey" | "fetch">,
  callRef: string,
  toolRef: string,
): Promise<
  Readonly<{
    attemptRef: string;
    effectGeneration: number;
    evidenceHash: string;
  }>
> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/calls/${encodeURIComponent(callRef)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
    },
    config.apiKey,
  );
  const parsed = callRecoveryResultSchema.safeParse(response.body);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !parsed.success ||
    parsed.data.kind !== "found" ||
    parsed.data.attemptRef === undefined ||
    parsed.data.effectGeneration === undefined ||
    parsed.data.evidenceHash === undefined
  )
    throw new GatewaySmokeError("gateway_smoke_status_metadata_missing");
  const nested = parsed.data.result;
  if (
    parsed.data.callRef !== callRef ||
    parsed.data.toolRef !== toolRef ||
    nested?.kind !== "completed" ||
    nested.callRef !== callRef ||
    nested.toolRef !== toolRef ||
    nested.evidenceHash !== parsed.data.evidenceHash
  )
    throw new GatewaySmokeError("gateway_smoke_status_metadata_missing");
  return {
    attemptRef: parsed.data.attemptRef,
    effectGeneration: parsed.data.effectGeneration,
    evidenceHash: parsed.data.evidenceHash,
  };
}

export function stableIdempotencyKey(
  runId: string,
  toolRef: string,
  input: Readonly<Record<string, JsonValue>>,
): string {
  return `${runId}:${toolRef}:${canonicalDigest(input)}`;
}

export function requireCompletedCall(
  value: GatewayCallObservation,
  toolRef: string,
  phase: string,
): GatewayCompletedCall {
  if (value.kind !== "completed")
    throw new GatewaySmokeError(
      `gateway_smoke_${phase}_${value.kind === "unknown" ? value.code : value.kind}`,
    );
  if (value.toolRef !== toolRef)
    throw new GatewaySmokeError(`gateway_smoke_${phase}_tool_mismatch`);
  return value;
}

export async function requestJson(
  fetchImpl: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
  secret: string,
): Promise<GatewayHttpResponse> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new GatewaySmokeError("gateway_smoke_network_error");
  }
  const text = await response.text();
  if (secret.length > 0 && text.includes(secret))
    throw new GatewaySmokeError("gateway_smoke_secret_leak");
  if (text.trim().length === 0)
    return { status: response.status, body: undefined };
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    throw new GatewaySmokeError("gateway_smoke_malformed_json");
  }
}
