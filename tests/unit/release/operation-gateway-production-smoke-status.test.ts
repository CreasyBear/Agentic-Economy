import {
  completed,
  operationRef,
  serviceFetch,
} from "./operation-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";

import {
  assertGatewayInvocationReplayParity,
  parseFreshProcessGatewayStatusOutput,
  readGatewayCompletionMetadata,
} from "../../../tools/release/operation-gateway-production-smoke";

describe("hosted Operation gateway smoke status", () => {
  it("parses exactly one canonical status JSON value", () => {
    const invocationRef = "invocation:provider:1";
    const status = {
      kind: "found" as const,
      invocationRef,
      operationRef,
      state: "terminal" as const,
      result: completed(invocationRef),
    };
    expect(
      parseFreshProcessGatewayStatusOutput(
        JSON.stringify(status),
        invocationRef,
      ),
    ).toEqual(completed(invocationRef));
    expect(() =>
      parseFreshProcessGatewayStatusOutput(
        `${JSON.stringify(status)}\n${JSON.stringify(status)}`,
        invocationRef,
      ),
    ).toThrow("fresh_status_output_invalid");
  });
  it("binds completion metadata to the requested invocation and nested evidence", async () => {
    const invocationRef = "invocation:provider:1";
    const metadata = {
      kind: "found" as const,
      invocationRef,
      operationRef,
      state: "terminal" as const,
      attemptRef: "attempt:provider:1",
      effectGeneration: 1,
      evidenceHash: "evidence:provider:1",
      result: completed(invocationRef),
    };
    const { config } = serviceFetch([metadata]);
    await expect(
      readGatewayCompletionMetadata(
        { ...config, apiKey: "run-key" },
        invocationRef,
        operationRef,
      ),
    ).resolves.toEqual({
      attemptRef: "attempt:provider:1",
      effectGeneration: 1,
      evidenceHash: "evidence:provider:1",
    });

    const divergentInvocation = { ...metadata, invocationRef: "invocation:other" };
    const invocationReadback = serviceFetch([divergentInvocation]);
    await expect(
      readGatewayCompletionMetadata(
        { ...invocationReadback.config, apiKey: "run-key" },
        invocationRef,
        operationRef,
      ),
    ).rejects.toThrow("gateway_smoke_status_metadata_missing");

    const divergentEvidence = {
      ...metadata,
      result: { ...metadata.result, evidenceHash: "evidence:other" },
    };
    const evidenceReadback = serviceFetch([divergentEvidence]);
    await expect(
      readGatewayCompletionMetadata(
        { ...evidenceReadback.config, apiKey: "run-key" },
        invocationRef,
        operationRef,
      ),
    ).rejects.toThrow("gateway_smoke_status_metadata_missing");
  });

  it("requires exact replay identity", () =>
    expect(() =>
      assertGatewayInvocationReplayParity(completed(), {
        ...completed(),
        output: { ok: false },
      }),
    ).toThrow("replay_output_mismatch"));
});
