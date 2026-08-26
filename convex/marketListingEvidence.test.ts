/// <reference types="vite/client" />
import { register as registerAggregate } from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { recordMarketEvidenceFact } from "./marketEvidence";
import schema from "./schema";
import { publishedBusinessOwner } from "../tests/helpers/convex-fixtures";

const modules = import.meta.glob("./**/*.ts");
const operationRef = `operation:v1:${"a".repeat(64)}`;

function backendWithAggregates() {
  const backend = convexTest(schema, modules);
  registerAggregate(backend, "marketEvidence");
  registerAggregate(backend, "marketOperationEvidence");
  registerAggregate(backend, "marketOperationRatings");
  return backend;
}

describe("market listing evidence Convex seam", () => {
  it("updates one authenticated rating transactionally instead of double-counting", async () => {
    const backend = backendWithAggregates();
    const { owner: reviewer, canonicalPrincipalRef } = await publishedBusinessOwner(
      backend,
      "market-rating-reviewer",
    );

    await reviewer.mutation(api.marketListingEvidence.rate, {
      operationRef,
      score: 4,
    });
    await reviewer.mutation(api.marketListingEvidence.rate, {
      operationRef,
      score: 5,
      review: "Fast and complete.",
    });

    const [evidence] = await reviewer.query(api.marketListingEvidence.read, {
      operationRefs: [operationRef],
      since: 0,
    });
    expect(evidence).toMatchObject({ ratingCount: 1, ratingSum: 5 });
    const [rating] = await backend.run((ctx) => ctx.db.query("marketOperationRatings").collect());
    expect(rating?.reviewerRef).toBe(canonicalPrincipalRef);
    expect(rating?.reviewerRef).not.toContain("clerk");
  });

  it("joins canonical categories with completed-call counts and bounded latency", async () => {
    const backend = backendWithAggregates();
    await backend.mutation(internal.marketListingEvidence.assignCategory, {
      operationRef,
      categoryId: "identity-compliance",
      assignedBy: "test",
      assignedAt: 1,
    });
    await backend.run(async (ctx) => {
      for (let index = 0; index < 6; index += 1) {
        await recordMarketEvidenceFact(
          ctx,
          "ae_invocation_completed",
          `invocation:${index}`,
          1_000 + index,
          { operationRef, durationMs: 100 + index * 10 },
        );
      }
    });

    const [evidence] = await backend.query(api.marketListingEvidence.read, {
      operationRefs: [operationRef],
      since: 1_000,
    });
    expect(evidence).toMatchObject({
      categoryId: "identity-compliance",
      completedInvocations: 6,
      latencySamplesMs: [150, 140, 130, 120, 110, 100],
    });
  });

  it("rejects anonymous ratings and invalid taxonomy assignments", async () => {
    const backend = backendWithAggregates();
    await expect(
      backend.mutation(api.marketListingEvidence.rate, {
        operationRef,
        score: 5,
      }),
    ).rejects.toThrow("market_rating_authentication_required");
    await expect(
      backend.mutation(internal.marketListingEvidence.assignCategory, {
        operationRef,
        categoryId: "made-up",
        assignedBy: "test",
        assignedAt: 1,
      }),
    ).rejects.toThrow("market_category_assignment_invalid");
  });
});
