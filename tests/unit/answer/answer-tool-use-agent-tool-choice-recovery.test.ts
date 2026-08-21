import {
  emptyKeylessSource,
  matchingProviderProse,
  withAnswerToolUseAgentContract,
} from "./answer-tool-use-agent-harness";
import { describe, expect, it } from "vitest";

import { runAnswerToolUseAgent } from "@/modules/answer/internal/answer-tool-use-agent";
import { DEFAULT_AE_SEARCH_CONTEXT } from "@/modules/answer/search-context";
import { openRouterToolName } from "@/modules/answer/internal/action-to-tool-spec";
import { ANSWER_READ_TOOL_IDS } from "@/modules/answer-thread/tooling";
import {
  openRouterStructuredProseResponse,
  openRouterToolResponse,
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from "../../helpers/openrouter-contract-server";

describe("runAnswerToolUseAgent — tool-choice evidence", () => {
  it("recovers a misspelled query in one bounded model loop", async () => {
    const server = await startOpenRouterContractServer((_request, index) => {
      if (index === 0) {
        return openRouterToolResponse([
          { toolId: "registry.search", input: { query: "joondalup" } },
        ]);
      }
      return openRouterStructuredProseResponse({
        oneLine: "Joondalup listed provider is listed for Emergency plumbing.",
        summary:
          'Joondalup listed provider lists Emergency plumbing, published pricing "Demo price — $180 call-out, quoted before work starts", and published availability "Mon–Fri 7am–5pm, Sat 8am–12pm".',
        whatToDoNow:
          'Contact Joondalup listed provider to confirm whether Emergency plumbing covers your job, whether "Demo price — $180 call-out, quoted before work starts" applies, and the earliest appointment within "Mon–Fri 7am–5pm, Sat 8am–12pm".',
      });
    });

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "jondalup",
        keylessExecutableSource: emptyKeylessSource,
      });
    });
    expect(result.providers.map((provider) => provider.slug)).toContain(
      "joondalup-listed-provider",
    );
    expect(result.allowedSlugs.has("joondalup-listed-provider")).toBe(true);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.modelRequests).toEqual([
      expect.objectContaining({
        provider: "openrouter",
        model: "test-model",
        status: "ok",
        stopReason: "tool_calls",
      }),
      expect.objectContaining({
        provider: "openrouter",
        model: "test-model",
        status: "ok",
        stopReason: "stop",
      }),
      expect.objectContaining({
        provider: "openrouter",
        model: "test-model",
        status: "ok",
        stopReason: "stop",
      }),
    ]);
    expect(result.toolCalls[0]?.toolId).toBe("registry.search");
    expect(result.gate.ok).toBe(true);
    expect(
      result.snapshot.providers.map((provider) => provider.slug),
    ).toContain("joondalup-listed-provider");
    expect(result.snapshot.summary).toContain(
      'Joondalup listed provider lists Emergency plumbing, published pricing "Demo price — $180 call-out, quoted before work starts", and published availability "Mon–Fri 7am–5pm, Sat 8am–12pm".',
    );
    expect(result.snapshot.nextStep).toBe(
      'Contact Joondalup listed provider to confirm whether Emergency plumbing covers your job, whether "Demo price — $180 call-out, quoted before work starts" applies, and the earliest appointment within "Mon–Fri 7am–5pm, Sat 8am–12pm".',
    );
  });

  it("records the chosen tool input as evidence, not the raw user query", async () => {
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
        query: "paramata",
        keylessExecutableSource: emptyKeylessSource,
      });
    });
    const input = JSON.parse(result.toolCalls[0]!.inputJson);
    expect(input.query).toBe("parramatta");
    // The frozen snapshot query stays honest to what the person typed.
    expect(result.snapshot.query).toBe("paramata");
  });

  it("uses the latest successful search for projections without rewriting evidence", async () => {
    let nextSearch = 0;
    const plannedSearches = [
      {
        id: "call-search-misspelled",
        query: "paramata",
        mode: "near_me",
        location: "Joondalup",
      },
      {
        id: "call-search-corrected",
        query: "parramatta",
        mode: "whole_catalogue",
        location: undefined,
      },
    ] as const;
    const server = await startOpenRouterContractServer((request) => {
      const planned = plannedSearches[nextSearch];
      if ((request.tools?.length ?? 0) > 0 && planned !== undefined) {
        nextSearch += 1;
        return openRouterToolResponse([
          {
            id: planned.id,
            toolId: "registry.search",
            input: {
              query: planned.query,
              mode: planned.mode,
              ...(planned.location === undefined
                ? {}
                : { location: planned.location }),
            },
          },
        ]);
      }
      return openRouterStructuredProseResponse(matchingProviderProse());
    });

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "paramata",
        keylessExecutableSource: emptyKeylessSource,
        maxToolCalls: 2,
      });
    });

    expect(
      result.toolCalls.map((call) => JSON.parse(call.inputJson).query),
    ).toEqual(["paramata", "parramatta"]);
    expect(result.toolCalls.map((call) => call.status)).toEqual([
      "complete",
      "complete",
    ]);
    expect(result.providers.map((provider) => provider.slug)).toContain(
      "demo-listed-provider",
    );
    expect(result.providers.map((provider) => provider.slug)).not.toContain(
      "joondalup-listed-provider",
    );
    expect(result.snapshot.providers.map((provider) => provider.slug)).toEqual(
      result.providers.map((provider) => provider.slug),
    );
    expect(result.snapshot.agentJsonUrl).toBe(
      "/api/businesses/search?q=parramatta&limit=3&mode=whole_catalogue",
    );
    expect(result.snapshot.query).toBe("paramata");
  });

  it("does not schedule additional tool calls after the per-turn budget is reached", async () => {
    const server = await startOpenRouterContractServer(
      openRouterToolThenProseResponses({
        toolCalls: [
          {
            id: "call-search-allowed",
            toolId: "registry.search",
            input: { query: "parramatta" },
          },
          {
            id: "call-detail-over-budget",
            toolId: "registry.detail",
            input: { slug: "demo-listed-provider" },
          },
        ],
        emitAllToolCallsTogether: false,
        prose: matchingProviderProse(),
      }),
    );

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "paramata",
        keylessExecutableSource: emptyKeylessSource,
        maxToolCalls: 1,
      });
    });

    expect(result.providers.map((provider) => provider.slug)).toContain(
      "demo-listed-provider",
    );
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      toolId: "registry.search",
      status: "complete",
    });
    expect(JSON.parse(result.toolCalls[0]!.resultSummaryJson)).toMatchObject({
      count: expect.any(Number),
    });
    expect(result.modelRequests).toHaveLength(2);
    expect(result.modelRequests[0]).toMatchObject({
      stopReason: "tool_calls",
    });
    expect(result.gate.ok).toBe(true);

    expect(server.requests).toHaveLength(2);
    // This listing query has no selected keyless operation, so only the fixed
    // discovery tools are exposed.
    const firstToolNames =
      server.requests[0]?.tools?.map((tool) => tool.function.name) ?? [];
    expect(firstToolNames).toEqual(
      expect.arrayContaining(ANSWER_READ_TOOL_IDS.map(openRouterToolName)),
    );
    expect(firstToolNames.some((name) => name.startsWith("capability_"))).toBe(
      false,
    );
    expect(server.requests[0]?.tool_choice).toBe("required");
    expect(server.requests[0]?.response_format?.type).not.toBe("json_schema");
    expect(server.requests[1]?.tools).toBeUndefined();
    expect(server.requests[1]?.response_format?.type).toBe("json_schema");

    const toolMessages =
      server.requests[1]?.messages.filter(
        (message) => message.role === "tool",
      ) ?? [];
    expect(toolMessages).toHaveLength(1);
    expect(toolMessages[0]?.tool_call_id).toBe("call-search-allowed");
  });

  it("uses the live catalog without a default suburb on location-free registry searches", async () => {
    const server = await startOpenRouterContractServer(
      openRouterToolThenProseResponses({
        toolCalls: [
          { toolId: "registry.search", input: { query: "emergency plumber" } },
        ],
        prose: {
          oneLine: "No listed businesses match this need yet.",
          summary: "No listed businesses publish coverage for that place yet.",
          whatToDoNow: "Try a nearby suburb or browse services.",
        },
      }),
    );

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "emergency plumber",
        keylessExecutableSource: emptyKeylessSource,
        searchContext: DEFAULT_AE_SEARCH_CONTEXT,
      });
    });
    const input = JSON.parse(result.toolCalls[0]!.inputJson);
    expect(input).toMatchObject({
      query: "emergency plumber",
    });
    expect(input.mode).toBe("whole_catalogue");
    expect(input.location).toBeUndefined();
    expect(result.snapshot.agentJsonUrl).not.toContain("mode=near_me");
    expect(result.snapshot.agentJsonUrl).not.toContain("location=Perth");
  });

  it("keeps empty-provider prose structured when the model names a slug no tool returned", async () => {
    const server = await startOpenRouterContractServer(
      openRouterToolThenProseResponses({
        toolCalls: [
          { toolId: "registry.search", input: { query: "no-such-suburb" } },
        ],
        prose: {
          oneLine: "Fictional Plumbing is the best pick.",
          summary:
            "Fictional Plumbing can help. The business confirms timing, price, availability, and the work.",
          whatToDoNow: "Contact fictional-plumbing directly.",
        },
      }),
    );

    const result = await withAnswerToolUseAgentContract(server, async () => {
      return await runAnswerToolUseAgent({
        query: "no-such-suburb",
        keylessExecutableSource: emptyKeylessSource,
      });
    });
    expect(result.providers).toEqual([]);
    expect(result.gate).toMatchObject({
      ok: false,
      code: "unsupported_provider_claim",
    });
  });

  it("falls back to deterministic-style empty providers when the model calls no tools", async () => {
    const server = await startOpenRouterContractServer(
      openRouterToolThenProseResponses({
        prose: {
          oneLine: "No listed businesses match this need yet.",
          summary:
            "No providers are listed for this query on Agentic Economy. We do not book or take payment on this page.",
          whatToDoNow: "Try a nearby suburb or a different trade word.",
        },
      }),
    );

    const result = await withAnswerToolUseAgentContract(
      server,
      async () => {
        return await runAnswerToolUseAgent({
          query: "paramata",
          keylessExecutableSource: emptyKeylessSource,
        });
      },
      { installRegistryPort: false },
    );
    expect(result.providers).toEqual([]);
    expect(result.toolCalls).toEqual([]);
    // Empty providers skip the grounding check; the honest copy passes.
    expect(result.gate.ok).toBe(true);
  });
});
