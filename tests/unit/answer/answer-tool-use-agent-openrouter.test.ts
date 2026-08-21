import { describe, expect, it } from "vitest";

import { generateText, isStepCount } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { actionToOpenRouterTool } from "@/modules/answer/internal/action-to-tool-spec";
import { findAction } from "@/modules/actions";

describe("actionToOpenRouterTool", () => {
  it("maps registry.search into an OpenRouter function tool spec with required query", () => {
    const spec = actionToOpenRouterTool(findAction("registry.search")!);
    expect(spec.type).toBe("function");
    expect(spec.function.name).toBe("registry_search");
    expect(spec.function.parameters.type).toBe("object");
    expect(spec.function.parameters.properties.query?.type).toBe("string");
    expect(spec.function.parameters.properties.limit?.type).toBe("integer");
    expect(spec.function.parameters.properties.mode?.enum).toEqual([
      "near_me",
      "whole_catalogue",
    ]);
    expect(spec.function.parameters.properties.location?.type).toBe("string");
    expect(spec.function.parameters.required).toContain("query");
    expect(spec.function.description).toMatch(/boundaries/i);
  });

  it("maps registry.detail with a required slug", () => {
    const spec = actionToOpenRouterTool(findAction("registry.detail")!);
    expect(spec.function.name).toBe("registry_detail");
    expect(spec.function.parameters.properties.slug?.type).toBe("string");
    expect(spec.function.parameters.required).toContain("slug");
  });
});

describe("AI SDK v7 multi-step usage", () => {
  it("aggregates result.usage while finalStep.usage stays last-step-only", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            {
              type: "tool-call",
              toolCallId: "call-usage-1",
              toolName: "lookup",
              input: '{"value":"first"}',
            },
          ],
          finishReason: { unified: "tool-calls", raw: "tool_calls" },
          usage: {
            inputTokens: {
              total: 11,
              noCache: 11,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 3,
              text: 3,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
        {
          content: [{ type: "text", text: "done" }],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: {
              total: 17,
              noCache: 17,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: {
              total: 5,
              text: 5,
              reasoning: undefined,
            },
          },
          warnings: [],
        },
      ],
    });

    const result = await generateText({
      model,
      prompt: "Use lookup, then answer.",
      tools: {
        lookup: {
          inputSchema: z.object({ value: z.string() }),
          execute: async ({ value }) => value,
        },
      },
      stopWhen: isStepCount(2),
    });

    expect(result.steps).toHaveLength(2);
    expect(result.usage).toMatchObject({
      inputTokens: 28,
      outputTokens: 8,
      totalTokens: 36,
    });
    expect(result.finalStep.usage).toMatchObject({
      inputTokens: 17,
      outputTokens: 5,
      totalTokens: 22,
    });
  });
});
