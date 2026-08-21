import {
  aiSdkTestState,
  emptyKeylessSource,
  matchingProviderProse,
  withAnswerToolUseAgentContract,
} from "./answer-tool-use-agent-harness";
import { describe, expect, it } from "vitest";

import {
  runAnswerToolUseAgent,
  type AnswerToolUseAgentCheckpoint,
} from "@/modules/answer/internal/answer-tool-use-agent";
import { DEFAULT_AE_SEARCH_CONTEXT } from "@/modules/answer/search-context";
import { openRouterToolName } from "@/modules/answer/internal/action-to-tool-spec";
import { buildHarnessRunReport } from "@/modules/harness/public";
import {
  buildToolUseAgentProseInstructions,
  buildToolUseAgentSystemPrompt,
  buildToolUseAgentUserPrompt,
} from "@/modules/answer/internal/answer-llm-prompts";
import { ANSWER_READ_TOOL_IDS } from "@/modules/answer-thread/tooling";
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from "../../helpers/openrouter-contract-server";

describe("runAnswerToolUseAgent — tool-choice recovery", () => {
  it("feeds actual tool result JSON back to the model before final prose", async () => {
    const server = await startOpenRouterContractServer([
      {
        ...(openRouterToolResponse(
          [
            {
              id: "call-search-1",
              toolId: "registry.search",
              input: { query: "parramatta" },
            },
          ],
          { id: "chatcmpl-round-1", model: "test-model-resolved" },
        ) as Record<string, unknown>),
        usage: {
          prompt_tokens: 100,
          completion_tokens: 25,
          total_tokens: 125,
          cost: 0.00000125,
          prompt_tokens_details: {
            cached_tokens: 10,
            cache_write_tokens: 2,
          },
          completion_tokens_details: {
            reasoning_tokens: 3,
          },
        },
      },
      {
        ...(openRouterStructuredProseResponse(
          {
            oneLine: "Start with an emergency plumber serving Parramatta.",
            summary:
              "Demo listed provider lists Listed offering, while Demo inquiry provider lists Diagnostic plumbing. Price and current availability still need confirmation.",
            whatToDoNow:
              "Contact one and ask: “Can you attend in Parramatta, what is the call-out price, and when are you available?”",
          },
          { id: "chatcmpl-round-2", model: "test-model-resolved" },
        ) as Record<string, unknown>),
        usage: {
          prompt_tokens: 140,
          completion_tokens: 42,
          total_tokens: 182,
          cost: 0.00000182,
        },
      },
    ]);
    const lifecycle: string[] = [];
    const checkpoints: AnswerToolUseAgentCheckpoint[] = [];

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "paramata",
        keylessExecutableSource: emptyKeylessSource,
        maxToolCalls: 1,
        onModelRequest: () => lifecycle.push("model"),
        onToolCheckpoint: async (checkpoint) => {
          lifecycle.push("checkpoint");
          checkpoints.push(checkpoint);
        },
      });
    });
    expect(result.toolCalls.map((call) => call.toolId)).toEqual([
      "registry.search",
    ]);
    expect(
      result.toolCalls.filter((call) =>
        call.toolId.startsWith("registry.operations."),
      ),
    ).toHaveLength(0);
    expect(
      result.toolCalls.filter(
        (call) =>
          call.toolId === "operation.execute" ||
          call.toolId === "operation.invoke",
      ),
    ).toHaveLength(0);
    expect(result.gate.ok).toBe(true);
    expect(result.providers.map((provider) => provider.slug)).toContain(
      "demo-listed-provider",
    );
    expect(result.snapshot.oneLine).toBe(
      "Start with an emergency plumber serving Parramatta.",
    );
    expect(result.snapshot.summary).toContain(
      "Demo listed provider lists Listed offering",
    );
    expect(result.snapshot.summary).toContain(
      "Price and current availability still need confirmation.",
    );
    expect(result.snapshot.nextStep).toContain(
      "what is the call-out price, and when are you available?",
    );
    const humanCopy = [
      result.snapshot.oneLine,
      result.snapshot.summary,
      result.snapshot.nextStep,
    ].join("\n");
    expect(humanCopy).not.toMatch(
      /(?:business|listing(?:s)?) (?:confirms?|handles?) .*?(?:timing|price|availability|work)/i,
    );
    expect(humanCopy).not.toMatch(/send an inquiry|inquiry form/i);
    expect(result.modelRequests).toHaveLength(2);
    expect(result.modelRequests[0]).toMatchObject({
      seq: 0,
      provider: "openrouter",
      model: "test-model-resolved",
      status: "ok",
      responseId: "chatcmpl-round-1",
      stopReason: "tool_calls",
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        cachedInputTokens: 10,
        cacheWriteTokens: 2,
        reasoningOutputTokens: 3,
        totalTokens: 125,
      },
      costUsd: 0.00000125,
    });
    expect(result.modelRequests[1]).toMatchObject({
      seq: 1,
      provider: "openrouter",
      model: "test-model-resolved",
      status: "ok",
      responseId: "chatcmpl-round-2",
      stopReason: "stop",
      usage: {
        inputTokens: 140,
        outputTokens: 42,
        totalTokens: 182,
      },
      costUsd: 0.00000182,
    });
    const harnessReport = buildHarnessRunReport({
      models: result.modelRequests,
    });
    expect(harnessReport.summary.models).toMatchObject({
      total: 2,
      ok: 2,
      byProvider: {
        openrouter: {
          total: 2,
          ok: 2,
        },
      },
    });
    expect(harnessReport.summary.usage).toMatchObject({
      inputTokens: 240,
      outputTokens: 67,
      cachedInputTokens: 10,
      cacheWriteTokens: 2,
      totalTokens: 307,
    });
    expect(harnessReport.summary.cost).toEqual({
      estimatedUsd: 0.00000307,
      unavailableReasons: [],
    });
    expect(
      result.timings.filter(
        (timing) => timing.name === "model.openrouter_round",
      ),
    ).toHaveLength(1);
    expect(
      result.timings.filter(
        (timing) => timing.name === "model.openrouter_final_prose",
      ),
    ).toHaveLength(1);
    expect(lifecycle).toEqual(["model", "checkpoint", "model"]);
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]?.toolCalls).toHaveLength(1);
    expect(JSON.parse(checkpoints[0]!.replayMessagesJson)).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "tool" })]),
    );

    const requests = server.requests;
    expect(requests).toHaveLength(2);
    expect(aiSdkTestState.generateTextCalls).toHaveLength(2);
    const toolLoopCall = aiSdkTestState.generateTextCalls[0];
    const proseCall = aiSdkTestState.generateTextCalls[1];
    expect(toolLoopCall?.instructions).toContain(
      `You have read-only tools: ${ANSWER_READ_TOOL_IDS.map(openRouterToolName).join(", ")}`,
    );
    expect(toolLoopCall?.instructions).not.toContain("execute_operation");
    expect(toolLoopCall?.instructions).not.toContain("capability_");
    expect(toolLoopCall).not.toHaveProperty("system");
    expect(toolLoopCall).not.toHaveProperty("output");
    expect(proseCall?.instructions).toBe(buildToolUseAgentProseInstructions());
    expect(proseCall).toHaveProperty("output");
    expect(requests[0]?.response_format?.type).not.toBe("json_schema");
    expect(buildToolUseAgentSystemPrompt()).toContain(
      `You have read-only tools: ${ANSWER_READ_TOOL_IDS.map(openRouterToolName).join(", ")}`,
    );
    expect(buildToolUseAgentSystemPrompt()).not.toContain("enough catalog evidence");
    expect(buildToolUseAgentSystemPrompt()).not.toContain("stop calling tools");
    expect(requests[0]?.tool_choice).toBe("required");
    expect(requests[0]?.tools?.map((tool) => tool.function.name)).not.toContain(
      "inquiry.submit",
    );
    expect(requests[1]?.tools).toBeUndefined();
    expect(requests[1]?.response_format?.type).toBe("json_schema");

    const toolMessage = requests[1]?.messages.find(
      (message) => message.role === "tool",
    );
    expect(toolMessage?.tool_call_id).toBe("call-search-1");
    expect(toolMessage?.content).not.toContain("Accepted");

    const toolResult = JSON.parse(toolMessage!.content) as {
      kind: string;
      items: readonly { slug: string }[];
    };
    expect(toolResult.kind).toBe("ok");
    expect(toolResult.items.map((item) => item.slug)).toContain(
      "demo-listed-provider",
    );
  });

  it("does not invent a default suburb for the live catalog", () => {
    const prompt = buildToolUseAgentUserPrompt({
      query: "Emergency plumber",
      searchContext: DEFAULT_AE_SEARCH_CONTEXT,
    });

    expect(prompt).toContain("Search scope: the whole Agentic Economy catalog.");
    expect(prompt).not.toContain("Perth");
    expect(prompt).not.toContain("confirm Perth");
    expect(prompt).not.toContain("Search scope: near Perth, WA.");
    expect(prompt).not.toContain('location="Perth, WA"');
  });

  it("uses a confirmed context as the active search scope", () => {
    const prompt = buildToolUseAgentUserPrompt({
      query: "Emergency plumber",
      searchContext: {
        mode: "near_me",
        location: {
          label: "Perth, WA",
          suburb: "Perth",
          stateTerritory: "WA",
          countryCode: "AU",
          source: "user_selected",
        },
      },
    });

    expect(prompt).toContain("Optional place metadata: Perth, WA.");
    expect(prompt).toContain("The user query is authority for place.");
  });

  it("does not tell the model to stop after catalog evidence", () => {
    const prompt = buildToolUseAgentSystemPrompt();
    expect(prompt).toContain("operation.execute");
    expect(prompt).toContain("Do not write a final answer in this step.");
    expect(prompt).not.toContain("enough catalog evidence");
    expect(prompt).not.toContain("stop calling tools");
    expect(buildToolUseAgentProseInstructions()).toContain("Return one decision-focused AnswerProse");
  });

  it("exposes registered tools on every allowed turn", async () => {
    const server = await startOpenRouterContractServer(
      openRouterToolThenProseResponses({
        toolCalls: [
          { toolId: "registry.search", input: { query: "parramatta" } },
        ],
        prose: matchingProviderProse(),
      }),
    );

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "compare the first two",
        keylessExecutableSource: emptyKeylessSource,
      });
    });

    const firstToolNames =
      server.requests[0]?.tools?.map((tool) => tool.function.name) ?? [];
    expect(firstToolNames).toEqual(
      expect.arrayContaining(ANSWER_READ_TOOL_IDS.map(openRouterToolName)),
    );
    expect(firstToolNames.some((name) => name.startsWith("capability_"))).toBe(
      false,
    );
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.gate.ok).toBe(true);
  });

  it("records one provider request when structured output parsing fails after the step", async () => {
    const modelRequests: unknown[] = [];
    const server = await startOpenRouterContractServer([
      openRouterToolResponse(
        [{ toolId: "registry.search", input: { query: "compare the first two" } }],
        { id: "chatcmpl-tool-before-invalid-prose" },
      ),
      {
        id: "chatcmpl-invalid-structured-output",
        model: "test-model",
        choices: [
          {
            finish_reason: "stop",
            message: { role: "assistant", content: "not json" },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      },
    ]);

    await expect(
      withAnswerToolUseAgentContract(server, async () => {
        return await runAnswerToolUseAgent({
          query: "compare the first two",
          keylessExecutableSource: emptyKeylessSource,
          maxToolCalls: 1,
          onModelRequest: (record) => modelRequests.push(record),
        });
      }),
    ).rejects.toMatchObject({ code: "request_failed" });

    expect(modelRequests).toEqual([
      expect.objectContaining({
        responseId: "chatcmpl-tool-before-invalid-prose",
        status: "ok",
      }),
      expect.objectContaining({
        responseId: "chatcmpl-invalid-structured-output",
        status: "ok",
        usage: expect.objectContaining({ totalTokens: 12 }),
      }),
    ]);
  });

  it("records a failed provider step after a successful tool-call step", async () => {
    const modelRequests: unknown[] = [];
    const server = await startOpenRouterContractServer([
      openRouterToolResponse(
        [{ toolId: "registry.search", input: { query: "parramatta" } }],
        { id: "chatcmpl-tool-before-failure" },
      ),
      undefined,
    ]);

    await expect(
      withAnswerToolUseAgentContract(server, async () => {
        return await runAnswerToolUseAgent({
          query: "paramata",
          keylessExecutableSource: emptyKeylessSource,
          model: "test-model",
          onModelRequest: (record) => modelRequests.push(record),
        });
      }),
    ).rejects.toMatchObject({ code: "request_failed" });

    expect(server.requests).toHaveLength(2);
    expect(
      server.requests[1]?.messages.some((message) => message.role === "tool"),
    ).toBe(true);
    expect(modelRequests).toHaveLength(2);
    expect(modelRequests[0]).toMatchObject({
      seq: 0,
      provider: "openrouter",
      model: "test-model",
      status: "ok",
      responseId: "chatcmpl-tool-before-failure",
      stopReason: "tool_calls",
    });
    expect(modelRequests[1]).toMatchObject({
      seq: 1,
      provider: "openrouter",
      model: "test-model",
      status: "error",
      errorCode: "request_failed",
      costUnavailableReason: "request_failed",
    });
  });
});
