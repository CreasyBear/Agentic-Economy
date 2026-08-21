import { aiSdkTestState } from "./answer-tool-use-agent-harness";
import { describe, expect, it } from "vitest";

import { runAnswerToolUseAgent } from "@/modules/answer/internal/answer-tool-use-agent";

describe("runAnswerToolUseAgent — credential boundary", () => {
  it("fails closed without a provider credential and never fabricates an answer", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(
      runAnswerToolUseAgent({ query: "emergency plumber parramatta" }),
    ).rejects.toMatchObject({ code: "unavailable" });
    expect(aiSdkTestState.generateTextCalls).toHaveLength(0);
  });
});
