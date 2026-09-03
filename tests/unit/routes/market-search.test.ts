import { describe, expect, it } from "vitest";

import { parseMarketCompareRefs, validateMarketSearch } from "@/routes/market";

describe("market search validation", () => {
  it("retains known presentation categories and drops unknown categories", () => {
    expect(
      validateMarketSearch({
        window: "7d",
        category: "identity-compliance",
      }),
    ).toEqual({ window: "7d", category: "identity-compliance" });

    expect(
      validateMarketSearch({ window: "7d", category: "not-a-category" }),
    ).toEqual({ window: "7d" });
    expect(validateMarketSearch({ window: "7d", category: "all" })).toEqual({
      window: "7d",
    });
  });

  it("keeps two to four unique canonical comparison references in one readable parameter", () => {
    const first = `operation:v1:${"a".repeat(64)}`;
    const second = `operation:v1:${"b".repeat(64)}`;

    expect(parseMarketCompareRefs(`${first},${second}`)).toEqual([first, second]);
    expect(validateMarketSearch({
      window: "30d",
      query: "company",
      category: "identity-compliance",
      cursor: "page-2",
      compare: `${first},${second}`,
    })).toEqual({
      window: "30d",
      query: "company",
      category: "identity-compliance",
      cursor: "page-2",
      compare: `${first},${second}`,
    });
  });

  it("deduplicates references and drops malformed, short, and oversized comparisons", () => {
    const first = `operation:v1:${"a".repeat(64)}`;
    const second = `operation:v1:${"b".repeat(64)}`;
    const third = `operation:v1:${"c".repeat(64)}`;
    const fourth = `operation:v1:${"d".repeat(64)}`;
    const fifth = `operation:v1:${"e".repeat(64)}`;

    expect(validateMarketSearch({
      window: "30d",
      compare: `${first},${second},${first}`,
    })).toEqual({ window: "30d", compare: `${first},${second}` });

    for (const compare of [
      first,
      `${first},${first}`,
      `${first},operation:v1:short`,
      `${first},${second},${third},${fourth},${fifth}`,
    ]) {
      expect(validateMarketSearch({ window: "30d", compare })).toEqual({
        window: "30d",
      });
    }
  });
});
