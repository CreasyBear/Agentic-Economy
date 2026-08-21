import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("hidden rewrite guard", () => {
  it("keeps production answer code free of retrievalQuery or query-rewrite env seams", () => {
    const productionSources = [
      "src/modules/answer/answer-synthesizer.ts",
      "src/modules/answer/internal/llm-config.ts",
      "src/modules/answer-thread/internal/turn-orchestrator.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(productionSources).not.toContain("retrievalQuery");
    expect(productionSources).not.toMatch(
      /\b(AE_[A-Z0-9_]*(QUERY|RETRIEVAL)[A-Z0-9_]*REWRITE|QUERY_REWRITE|REWRITE_QUERY)\b/,
    );
  });
});
