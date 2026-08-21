import {
  aiSdkTestState,
  emptyKeylessSource,
} from "./answer-tool-use-agent-harness";
import { describe, expect, it, vi } from "vitest";

import {
  operationExecutionBindingDigest,
  type KeylessExecutableSourcePort,
  type KeylessExecutableToolDescriptor,
  type OperationExecutableDescriptor,
} from "@/modules/capability-execution";
import {
  runAnswerToolUseAgent,
  type AnswerToolUseAgentCheckpoint,
} from "@/modules/answer/internal/answer-tool-use-agent";
import { answerOperationCandidateFromPublicDescriptor } from "@/modules/answer/internal/operation-artifacts";
import {
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
} from "@/modules/answer/answer-schema";
import type { JsonValue } from "@/modules/capability-contract/public";
import type { PublicOperationDescriptor } from "@/modules/capability-supply/public";
import { OPERATION_INVOKE_ROUTE_CONTRACT } from "@/modules/capability-execution/operation-invoke-entry";
import type { AnswerSource } from "@/modules/answer/answer-synthesizer";
import type {
  AnswerToolCallRecord,
  AnswerTurnCheckpoint,
} from "@/modules/answer-thread/answer-thread.schema";
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  startOpenRouterContractServer,
} from "../../helpers/openrouter-contract-server";

describe("runAnswerToolUseAgent — checkpoint recovery", () => {
  it("resumes prose once after a post-checkpoint model crash without running tools again", async () => {
    const provider: AnswerSource = {
      citationIndex: 1,
      slug: "saved-provider",
      name: "Saved Provider",
      category: "Lookup",
      suburb: "Perth",
      stateTerritory: "WA",
      serviceArea: "Perth",
      hoursLabel: "Published",
      availabilityLabel: "Published",
      trustLabel: "Checked",
      responseTimeLabel: "Fast",
      trustCue: "Checked",
      nextStepLabel: "Open provider",
      detailUrl: "/saved-provider",
      services: [],
    };
    const server = await startOpenRouterContractServer([
      openRouterStructuredProseResponse({
        oneLine: "The saved tool result is ready.",
        summary: "Resume from the durable tool evidence.",
        whatToDoNow: "Continue from the saved answer state.",
      }),
    ]);
    const restoreOpenRouter = server.installEnv();
    const checkpoint: AnswerTurnCheckpoint = {
      schemaVersion: 1,
      reservationKey: "resume-reservation",
      requestDigest: "resume-digest",
      generation: 0,
      threadId: "resume-thread",
      turnId: "resume-turn",
      turnSeq: 1,
      stepOrdinal: 1,
      route: "tool_search",
      intent: "refine_search",
      query: "saved lookup",
      priorTurnCount: 0,
      priorProviders: [provider],
      priorAllowedSlugs: ["saved-provider"],
      toolCalls: [],
      toolCallDigests: [],
      modelRequests: [],
      replayMessagesJson:
        '[{"role":"user","content":"saved lookup"},{"role":"assistant","content":"tool completed"}]',
    };
    const checkpointWrites: AnswerToolUseAgentCheckpoint[] = [];
    try {
      const result = await runAnswerToolUseAgent({
        query: "saved lookup",
        keylessExecutableSource: emptyKeylessSource,
        priorProviders: [provider],
        priorAllowedSlugs: ["saved-provider"],
        resumeCheckpoint: checkpoint,
        onToolCheckpoint: async (value) => {
          checkpointWrites.push(value);
        },
      });
      expect(result.modelRequests).toHaveLength(1);
      expect(checkpointWrites).toHaveLength(0);
      expect(server.requests).toHaveLength(1);
      expect(result.prose.oneLine).toBeTruthy();
    } finally {
      restoreOpenRouter();
      await server.close();
    }
  });
  it("resumes a discovery checkpoint from its explicit selection and invokes exactly once", async () => {
    const query = "what is the current test value for Sydney?";
    const operationRef = `operation:v1:${"f".repeat(64)}`;
    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef,
      capabilityId: "test.current-value",
      name: "Test current value",
      summary: "Return the current test value for a city.",
      searchTerms: ["current test value", "test value"],
      inputExamples: [{ label: "Sydney", input: { city: "Sydney" } }],
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
        additionalProperties: false,
      },
    };
    const executable: OperationExecutableDescriptor = {
      operationRef,
      capabilityId: descriptor.capabilityId,
      name: descriptor.name,
      endpointUrl: "https://api.example.test/current",
      authority: { kind: "keyless" },
      adapterId: "http-json:v1",
      price: {
        kind: "fixed",
        amount: { currency: "USD", units: "0", exponent: 2 },
      },
      effects: [],
      method: "GET",
      query: [{ inputPointer: "/city", parameter: "city" }],
      requestTimeoutMs: 5_000,
      inputSchema: descriptor.inputSchema,
      provenance: { publisher: "provider_owned", sourceKind: "openapi_http" },
    };
    const publicOperation: PublicOperationDescriptor = {
      operationRef: operationRef as PublicOperationDescriptor["operationRef"],
      operationId: descriptor.capabilityId,
      callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      paymentLane: "brokered",
      contract: {
        capabilityId: descriptor.capabilityId,
        version: 1,
        inputJsonSchema: descriptor.inputSchema as Readonly<Record<string, JsonValue>>,
        outputJsonSchema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
        customerAnnotations: [
          {
            annotationId: "city",
            document: "input",
            pointer: "/city",
            label: "City",
            role: "request",
          },
        ],
      },
      business: {
        businessId: "business:test-current-value",
        slug: "test-current-value",
        name: "Test current value",
      },
      offering: {
        offeringRef: "offering:test-current-value",
        revision: 1,
        label: descriptor.name,
        summary: descriptor.summary,
      },
      summary: descriptor.summary,
      commercial: {
        price: { kind: "on_request" },
        materialTerms: [],
        relationship: { kind: "none", summary: "No commercial relationship." },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: "unsupported" },
      recovery: { idempotency: "not_applicable", recovery: "retry_safe" },
      authentication: { kind: "keyless" },
      transport: { method: "GET", requestTimeoutMs: 5_000 },
      provenance: { publisher: "provider_owned", sourceKind: "openapi_http" },
      availability: { posture: "routeable" },
      navigation: [{
        relation: "execute",
        method: "POST",
        actionId: "operation.execute",
        authentication: "none",
        surfaces: ["answerThread"],
      }],
    };
    const source: KeylessExecutableSourcePort = {
      list: async () => [descriptor],
      read: async () => executable,
      readPublic: async () => publicOperation,
      search: async () => [operationRef],
    };
    const selectedCandidate = answerOperationCandidateFromPublicDescriptor(
      publicOperation,
      1,
      {
        includeInputSchema: true,
        executionBindingDigest: operationExecutionBindingDigest(executable),
      },
    );
    if (
      selectedCandidate === undefined ||
      selectedCandidate.executionBindingDigest === undefined
    ) {
      throw new Error("expected selected execution binding");
    }
    const operationCandidates: readonly AnswerOperationCandidate[] = [
      selectedCandidate,
    ];
    const candidateSetDigest =
      answerOperationCandidateSetDigest(operationCandidates);
    const discoveryCall: AnswerToolCallRecord = {
      toolCallId: "discovery-call",
      turnId: "resume-turn",
      seq: 0,
      toolId: "registry.operations.search",
      inputJson: JSON.stringify({ query }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 1 }),
      resultJson: JSON.stringify({
        kind: "ok",
        items: [{ operationRef }],
      }),
      resultHash: "discovery-result-hash",
      status: "complete",
      createdAt: 1,
    };
    const detailCall: AnswerToolCallRecord = {
      toolCallId: "detail-call",
      turnId: "resume-turn",
      seq: 1,
      toolId: "registry.operations.detail",
      inputJson: JSON.stringify({ operationRef }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 0 }),
      resultJson: JSON.stringify({
        kind: "found",
        schemaVersion: "registry-operations:v1",
        operation: publicOperation,
      }),
      resultHash: "detail-result-hash",
      status: "complete",
      createdAt: 1,
    };
    const checkpoint: AnswerTurnCheckpoint = {
      schemaVersion: 1,
      reservationKey: "resume-discovery-reservation",
      requestDigest: "resume-discovery-digest",
      generation: 0,
      threadId: "resume-discovery-thread",
      turnId: "resume-turn",
      turnSeq: 1,
      stepOrdinal: 1,
      route: "tool_search",
      intent: "refine_search",
      query,
      priorTurnCount: 0,
      priorProviders: [],
      priorAllowedSlugs: [],
      toolCalls: [discoveryCall, detailCall],
      toolCallDigests: [],
      operationCandidates,
      operationCandidatesDigest: candidateSetDigest,
      selectedOperationRef: operationRef,
      selectedToolId: "operation.execute",
      descriptorDigest: selectedCandidate.descriptorDigest,
      operationSelection: {
        operationRef,
        toolId: "operation.execute",
        descriptorDigest: selectedCandidate.descriptorDigest,
        executionBindingDigest: selectedCandidate.executionBindingDigest,
        candidateSetDigest,
      },
      modelRequests: [],
      replayMessagesJson: JSON.stringify([
        { role: "user", content: query },
        { role: "assistant", content: "saved registry result" },
      ]),
    };
    const server = await startOpenRouterContractServer([
      openRouterToolResponse([
        {
          id: "invoke-after-discovery",
          toolId: "operation.execute",
          input: { operationRef, input: { city: "Sydney" } },
        },
      ]),
      openRouterStructuredProseResponse({
        oneLine: "The current test value for Sydney is 42.",
        summary: "The resumed operation returned the current test value.",
        whatToDoNow: "Use the returned value.",
      }),
    ]);
    const restoreOpenRouter = server.installEnv();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: "42" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    try {
      const result = await runAnswerToolUseAgent({
        query,
        keylessExecutableSource: source,
        operationExecuteDeps: { isPublicTarget: async () => true, fetchImpl },
        maxToolCalls: 3,
        resumeCheckpoint: checkpoint,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(server.requests[0]?.messages)).toContain(query);
      expect(result.modelRequests).toHaveLength(2);
      expect(
        result.toolCalls.filter((call) => call.toolId === "operation.execute"),
      ).toHaveLength(1);
      expect(result.snapshot.operationOutcome).toBeDefined();
      expect(server.requests).toHaveLength(2);
      expect(
        result.toolCalls.filter((call) => call.toolId === "registry.operations.search"),
      ).toHaveLength(1);
    } finally {
      restoreOpenRouter();
      await server.close();
    }
  });
  it("continues a resumed execute when the host no longer rebinds operation candidates", async () => {
    const query = "what is the current test value for Sydney?";
    const operationRef = `operation:v1:${"e".repeat(64)}`;
    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef,
      capabilityId: "test.current-value",
      name: "Test current value",
      summary: "Return the current test value for a city.",
      searchTerms: ["current test value", "test value"],
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
        additionalProperties: false,
      },
    };
    const executable: OperationExecutableDescriptor = {
      operationRef,
      capabilityId: descriptor.capabilityId,
      name: descriptor.name,
      endpointUrl: "https://api.example.test/current",
      authority: { kind: "keyless" },
      adapterId: "http-json:v1",
      price: {
        kind: "fixed",
        amount: { currency: "USD", units: "0", exponent: 2 },
      },
      effects: [],
      method: "GET",
      query: [{ inputPointer: "/city", parameter: "city" }],
      requestTimeoutMs: 5_000,
      inputSchema: descriptor.inputSchema,
      provenance: { publisher: "provider_owned", sourceKind: "openapi_http" },
    };
    const read = vi
      .fn()
      .mockResolvedValueOnce(executable)
      .mockResolvedValue({ ...executable, endpointUrl: "https://api.example.test/changed" });
    const publicOperation: PublicOperationDescriptor = {
      operationRef: operationRef as PublicOperationDescriptor["operationRef"],
      operationId: descriptor.capabilityId,
      callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
      paymentLane: "brokered",
      contract: {
        capabilityId: descriptor.capabilityId,
        version: 1,
        inputJsonSchema: descriptor.inputSchema as Readonly<Record<string, JsonValue>>,
        outputJsonSchema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
        customerAnnotations: [
          {
            annotationId: "city",
            document: "input",
            pointer: "/city",
            label: "City",
            role: "request",
          },
        ],
      },
      business: {
        businessId: "business:test-current-value",
        slug: "test-current-value",
        name: "Test current value",
      },
      offering: {
        offeringRef: "offering:test-current-value",
        revision: 1,
        label: descriptor.name,
        summary: descriptor.summary,
      },
      summary: descriptor.summary,
      commercial: {
        price: { kind: "on_request" },
        materialTerms: [],
        relationship: { kind: "none", summary: "No commercial relationship." },
      },
      dataUse: [],
      effects: [],
      evidence: [],
      cancellation: { kind: "unsupported" },
      recovery: { idempotency: "not_applicable", recovery: "retry_safe" },
      authentication: { kind: "keyless" },
      transport: { method: "GET", requestTimeoutMs: 5_000 },
      provenance: { publisher: "provider_owned", sourceKind: "openapi_http" },
      availability: { posture: "routeable" },
      navigation: [{
        relation: "execute",
        method: "POST",
        actionId: "operation.execute",
        authentication: "none",
        surfaces: ["answerThread"],
      }],
    };
    const source: KeylessExecutableSourcePort = {
      list: async () => [descriptor],
      read,
      readPublic: async () => publicOperation,
      search: async () => [operationRef],
    };
    const candidate = answerOperationCandidateFromPublicDescriptor(
      publicOperation,
      1,
      {
        includeInputSchema: true,
        executionBindingDigest: operationExecutionBindingDigest(executable),
      },
    );
    if (candidate === undefined || candidate.executionBindingDigest === undefined) {
      throw new Error("expected execution binding digest");
    }
    const operationCandidates: readonly AnswerOperationCandidate[] = [candidate];
    const candidateSetDigest =
      answerOperationCandidateSetDigest(operationCandidates);
    const checkpoint: AnswerTurnCheckpoint = {
      schemaVersion: 1,
      reservationKey: "drift-reservation",
      requestDigest: "drift-digest",
      generation: 0,
      threadId: "drift-thread",
      turnId: "drift-turn",
      turnSeq: 1,
      stepOrdinal: 1,
      route: "tool_search",
      intent: "refine_search",
      query,
      priorTurnCount: 0,
      priorProviders: [],
      priorAllowedSlugs: [],
      toolCalls: [],
      toolCallDigests: [],
      operationCandidates,
      operationCandidatesDigest: candidateSetDigest,
      selectedOperationRef: operationRef,
      selectedToolId: "operation.execute",
      descriptorDigest: candidate.descriptorDigest,
      operationSelection: {
        operationRef,
        toolId: "operation.execute",
        descriptorDigest: candidate.descriptorDigest,
        executionBindingDigest: candidate.executionBindingDigest,
        candidateSetDigest,
      },
      modelRequests: [],
      replayMessagesJson: JSON.stringify([{ role: "user", content: query }]),
    };
    const server = await startOpenRouterContractServer([
      openRouterToolResponse([
        {
          id: "stale-binding",
          toolId: "operation.execute",
          input: { operationRef, input: { city: "Sydney" } },
        },
      ]),
      openRouterStructuredProseResponse({
        oneLine: "The selected source cannot run.",
        summary: "The source binding changed before execution.",
        whatToDoNow: "Choose a current published source.",
      }),
    ]);
    const restoreOpenRouter = server.installEnv();
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ value: "should-not-run" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    try {
      const result = await runAnswerToolUseAgent({
        query,
        keylessExecutableSource: source,
        operationExecuteDeps: {
          isPublicTarget: async () => true,
          fetchImpl,
        },
        resumeCheckpoint: checkpoint,
      });
      const operationCall = result.toolCalls.find(
        (call) => call.toolId === "operation.execute",
      );
      expect(operationCall).toMatchObject({ status: "complete" });
      expect(JSON.parse(operationCall!.resultJson)).toMatchObject({
        kind: "ok",
        operationRef,
      });
      expect(result.prose.oneLine).toBe("The selected source cannot run.");
      expect(fetchImpl).toHaveBeenCalled();
      expect(read).toHaveBeenCalled();
      expect(server.requests).toHaveLength(2);
      expect(aiSdkTestState.generateTextCalls).toHaveLength(2);
    } finally {
      restoreOpenRouter();
      await server.close();
    }
  });
});
