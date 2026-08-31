import { describe, expect, it } from "vitest";

import { validateMarketSearch } from "@/routes/market";

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
});
