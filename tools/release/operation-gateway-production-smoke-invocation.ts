import { execFile } from "node:child_process";

import { z } from "zod";

import { canonicalDigest } from "../../src/modules/common/canonical-digest";
import { type JsonValue } from "../../src/modules/capability-contract/public";
import {
  operationInvokeRecoveryResultSchema,
  operationInvokeStatusResultSchema,
} from "../../src/modules/capability-execution/operation-recovery.actions";
import {
  operationInvokeResultSchema,
  operationInvokeUsageSchema,
  type OperationInvokeResult,
  type OperationInvokeUsageSummary,
} from "../../src/modules/capability-execution/operation-invoke-contracts";
import { OPERATION_INVOKE_HTTP_PATH } from "../../src/modules/capability-execution/operation-invoke-entry";
import type { PublicOperationDescriptor } from "../../src/modules/capability-supply/public";
import {
  GatewaySmokeError,
  sameAmount,
} from "./operation-gateway-production-smoke-receipt";

const MAX_STATUS_WAIT_MS = 60_000;
const DEFAULT_STATUS_DELAY_MS = 250;
const MAX_STATUS_DELAY_MS = 2_000;
const FRESH_STATUS_PROCESS_TIMEOUT_MS = 15_000;
const MAX_FRESH_STATUS_STDOUT_BYTES = 64 * 1024;
const MAX_FRESH_STATUS_STDERR_BYTES = 16 * 1024;

type GatewayInvocationConfig = Readonly<{
  baseUrl: string;
  apiKey: string;
  input: Readonly<Record<string, JsonValue>>;
  fetch: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maxStatusWaitMs?: number;
  statusDelayMs?: number;
}>;

export type GatewayHttpResponse = Readonly<{ status: number; body: unknown }>;
export type GatewaySmokeUnknown = Readonly<{
  kind: "unknown";
  code: string;
  status?: number;
  retryable: boolean;
}>;
export type GatewayInvocationObservation =
  OperationInvokeResult | GatewaySmokeUnknown;
export type GatewayCompletedOperation = Extract<
  OperationInvokeResult,
  { kind: "completed" }
>;
export type GatewayPendingOperation = Extract<
  OperationInvokeResult,
  { kind: "pending" }
>;

export async function invokeGatewayOperation(
  config: GatewayInvocationConfig,
  operation: PublicOperationDescriptor,
  idempotencyKey: string,
): Promise<GatewayInvocationObservation> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}${OPERATION_INVOKE_HTTP_PATH}`,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        operationRef: operation.operationRef,
        input: config.input,
        idempotencyKey,
      }),
    },
    config.apiKey,
  );
  return parseGatewayInvocationResponse(response, operation.operationRef);
}

function delay(milliseconds: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
}

export function parseGatewayInvocationResponse(
  response: GatewayHttpResponse,
  expectedOperationRef?: string,
): GatewayInvocationObservation {
  if (response.status < 200 || response.status >= 300)
    return {
      kind: "unknown",
      code: "http_error",
      status: response.status,
      retryable: response.status >= 500,
    };
  const parsed = operationInvokeResultSchema.safeParse(response.body);
  if (
    !parsed.success ||
    (expectedOperationRef !== undefined &&
      parsed.data.operationRef !== expectedOperationRef)
  )
    return {
      kind: "unknown",
      code: "malformed_result",
      status: response.status,
      retryable: false,
    };
  return parsed.data;
}

export async function pollGatewayOperation(
  config: GatewayInvocationConfig,
  initial: GatewayInvocationObservation,
): Promise<GatewayInvocationObservation> {
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
    const next = await readGatewayStatus(config, initial.invocationRef);
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

function gatewayInvocationObservationFromStatusResult(
  result: z.infer<typeof operationInvokeStatusResultSchema>,
): GatewayInvocationObservation {
  if (result.kind === "refused")
    return {
      kind: "unknown",
      code: result.code,
      retryable: result.retryable,
    };
  if (result.result !== undefined) return result.result;
  return {
    kind: "pending",
    invocationRef: result.invocationRef,
    operationRef: result.operationRef,
    retryAfterMs: DEFAULT_STATUS_DELAY_MS,
  };
}

type FreshStatusCliOutput = Readonly<{
  stdout: string;
  stderr: string;
}>;

function runFreshStatusCli(
  config: GatewayInvocationConfig,
  invocationRef: string,
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
      ["run", "-s", "ae", "--", "status", invocationRef, "--json"],
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
  invocationRef: string,
): GatewayInvocationObservation {
  const trimmed = text.trim();
  if (trimmed.length === 0)
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_empty");
  let body: unknown;
  try {
    body = JSON.parse(trimmed) as unknown;
  } catch {
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_invalid");
  }
  const parsed = operationInvokeStatusResultSchema.safeParse(body);
  if (!parsed.success || parsed.data.invocationRef !== invocationRef)
    throw new GatewaySmokeError("gateway_smoke_fresh_status_output_invalid");
  return gatewayInvocationObservationFromStatusResult(parsed.data);
}

export async function readGatewayStatus(
  config: GatewayInvocationConfig,
  invocationRef: string,
): Promise<GatewayInvocationObservation> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/operations/${encodeURIComponent(invocationRef)}`,
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
  const parsed = operationInvokeRecoveryResultSchema.safeParse(response.body);
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
  if (parsed.data.result !== undefined) return parsed.data.result;
  return {
    kind: "pending",
    invocationRef: parsed.data.invocationRef,
    operationRef: parsed.data.operationRef,
    retryAfterMs: DEFAULT_STATUS_DELAY_MS,
  };
}

export async function readFreshProcessGatewayStatus(
  config: GatewayInvocationConfig,
  invocationRef: string,
): Promise<GatewayInvocationObservation> {
  let output: FreshStatusCliOutput;
  try {
    output = await runFreshStatusCli(config, invocationRef);
  } catch {
    throw new GatewaySmokeError("gateway_smoke_fresh_status_process_failed");
  }
  return parseFreshProcessGatewayStatusOutput(output.stdout, invocationRef);
}

export function assertGatewayPaidCompletion(
  operation: PublicOperationDescriptor,
  completed: GatewayCompletedOperation,
): OperationInvokeUsageSummary {
  if (completed.operationRef !== operation.operationRef)
    throw new GatewaySmokeError("gateway_smoke_completed_operation_mismatch");
  const usage = operationInvokeUsageSchema.parse(completed.usage);
  if (
    usage.chargeState !== "paid" ||
    operation.commercial.price.kind !== "fixed" ||
    operation.commercial.priceEvidence?.priceDigest !== usage.priceDigest ||
    !sameAmount(operation.commercial.price.amount, usage.amount) ||
    usage.transactionRef === undefined
  )
    throw new GatewaySmokeError("gateway_smoke_paid_usage_mismatch");
  return usage;
}

export function assertGatewayInvocationReplayParity(
  expected: GatewayCompletedOperation,
  replay: GatewayCompletedOperation,
): void {
  if (expected.operationRef !== replay.operationRef)
    throw new GatewaySmokeError("replay_operation_mismatch");
  if (expected.invocationRef !== replay.invocationRef)
    throw new GatewaySmokeError("replay_invocation_mismatch");
  if (expected.evidenceHash !== replay.evidenceHash)
    throw new GatewaySmokeError("replay_evidence_mismatch");
  if (canonicalDigest(expected.output) !== canonicalDigest(replay.output))
    throw new GatewaySmokeError("replay_output_mismatch");
  if (canonicalDigest(expected.usage) !== canonicalDigest(replay.usage))
    throw new GatewaySmokeError("replay_usage_mismatch");
}

export async function readGatewayCompletionMetadata(
  config: Pick<GatewayInvocationConfig, "baseUrl" | "apiKey" | "fetch">,
  invocationRef: string,
  operationRef: string,
): Promise<
  Readonly<{
    attemptRef: string;
    effectGeneration: number;
    evidenceHash: string;
  }>
> {
  const response = await requestJson(
    config.fetch,
    `${config.baseUrl}/api/v1/operations/${encodeURIComponent(invocationRef)}`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
    },
    config.apiKey,
  );
  const parsed = operationInvokeRecoveryResultSchema.safeParse(response.body);
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
    parsed.data.invocationRef !== invocationRef ||
    parsed.data.operationRef !== operationRef ||
    nested?.kind !== "completed" ||
    nested.invocationRef !== invocationRef ||
    nested.operationRef !== operationRef ||
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
  operationRef: string,
  input: Readonly<Record<string, JsonValue>>,
): string {
  return `${runId}:${operationRef}:${canonicalDigest(input)}`;
}

export function requireCompletedInvocation(
  value: GatewayInvocationObservation,
  operationRef: string,
  phase: string,
): GatewayCompletedOperation {
  if (value.kind !== "completed")
    throw new GatewaySmokeError(
      `gateway_smoke_${phase}_${value.kind === "unknown" ? value.code : value.kind}`,
    );
  if (value.operationRef !== operationRef)
    throw new GatewaySmokeError(`gateway_smoke_${phase}_operation_mismatch`);
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
