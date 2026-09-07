import {
  completed,
  toolRef,
  serviceFetch,
} from "./tool-gateway-production-smoke-harness";
import { describe, expect, it } from "vitest";

import {
  assertGatewayCallReplayParity,
  parseFreshProcessGatewayStatusOutput,
  readGatewayCompletionMetadata,
} from "../../../tools/release/tool-gateway-production-smoke";

describe("hosted Tool gateway smoke status", () => {
  it("parses exactly one canonical status JSON value", () => {
    const callRef = "invocation:provider:1";
    const status = {
      kind: "found" as const,
      callRef,
      version: 1,
      toolRef,
      state: "terminal" as const,
      result: completed(callRef),
    };
    expect(
      parseFreshProcessGatewayStatusOutput(
        JSON.stringify(status),
        callRef,
      ),
    ).toEqual(completed(callRef));
    expect(() =>
      parseFreshProcessGatewayStatusOutput(
        `${JSON.stringify(status)}\n${JSON.stringify(status)}`,
        callRef,
      ),
    ).toThrow("fresh_status_output_invalid");
  });
  it("binds completion metadata to the requested invocation and nested evidence", async () => {
    const callRef = "invocation:provider:1";
    const metadata = {
      kind: "found" as const,
      callRef,
      version: 1,
      toolRef,
      state: "terminal" as const,
      attemptRef: "attempt:provider:1",
      effectGeneration: 1,
      evidenceHash: "evidence:provider:1",
      result: completed(callRef),
    };
    const { config } = serviceFetch([metadata]);
    await expect(
      readGatewayCompletionMetadata(
        { ...config, apiKey: "run-key" },
        callRef,
        toolRef,
      ),
    ).resolves.toEqual({
      attemptRef: "attempt:provider:1",
      effectGeneration: 1,
      evidenceHash: "evidence:provider:1",
    });

    const divergentCall = { ...metadata, callRef: "invocation:other" };
    const callReadback = serviceFetch([divergentCall]);
    await expect(
      readGatewayCompletionMetadata(
        { ...callReadback.config, apiKey: "run-key" },
        callRef,
        toolRef,
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
        callRef,
        toolRef,
      ),
    ).rejects.toThrow("gateway_smoke_status_metadata_missing");
  });

  it("requires exact replay identity", () =>
    expect(() =>
      assertGatewayCallReplayParity(completed(), {
        ...completed(),
        output: { ok: false },
      }),
    ).toThrow("replay_output_mismatch"));
});
