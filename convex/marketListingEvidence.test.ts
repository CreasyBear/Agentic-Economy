/// <reference types="vite/client" />
import { register as registerAggregate } from "@convex-dev/aggregate/test";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import { recordMarketEvidenceFact } from "./marketEvidence";
import schema from "./schema";
import { publishedBusinessOwner } from "../tests/helpers/convex-fixtures";

const modules = import.meta.glob("./**/*.ts");
const toolRef = `operation:v1:${"a".repeat(64)}`;

function backendWithAggregates() {
  const backend = convexTest(schema, modules);
  registerAggregate(backend, "marketEvidence");
  registerAggregate(backend, "marketOperationEvidence");
  registerAggregate(backend, "marketToolRatings");
  return backend;
}

async function completeCall(
  backend: ReturnType<typeof backendWithAggregates>,
  principalId: string,
  completedToolRef: string,
): Promise<void> {
  await backend.run(async (ctx) => {
    await ctx.db.insert("capabilityCalls", {
      callRef: `operation-invocation:v1:${principalId}:${completedToolRef.slice(-8)}`,
      principalId,
      ownerId: `acc_${principalId}`,
      credentialId: "credential:rating",
      applicationRef: "application:rating",
      toolRef: completedToolRef,
      idempotencyKey: `idempotency:${principalId}:${completedToolRef}`,
      environment: "sandbox",
      grantRef: "grant:rating",
      grantGeneration: 1,
      policyDigest: "sha256:rating",
      grantExpiresAt: 1_900_000_000_000,
      inputDigest: "sha256:rating-input",
      requestDigest: "sha256:rating-request",
      state: "completed",
      createdAt: 1_800_000_000_000,
      updatedAt: 1_800_000_000_000,
    });
  });
}

describe("market listing evidence Convex seam", () => {
  it("updates one authenticated rating transactionally instead of double-counting", async () => {
    const backend = backendWithAggregates();
    const { owner: reviewer, canonicalPrincipalRef } = await publishedBusinessOwner(
      backend,
      "market-rating-reviewer",
    );
    await completeCall(backend, canonicalPrincipalRef, toolRef);

    await reviewer.mutation(api.marketListingEvidence.rate, {
      toolRef,
      score: 4,
    });
    await reviewer.mutation(api.marketListingEvidence.rate, {
      toolRef,
      score: 5,
      review: "Fast and complete.",
    });

    const [evidence] = await reviewer.query(api.marketListingEvidence.read, {
      toolRefs: [toolRef],
      since: 0,
    });
    expect(evidence).toMatchObject({ ratingCount: 1, ratingSum: 5 });
    const [rating] = await backend.run((ctx) => ctx.db.query("marketToolRatings").collect());
    expect(rating?.reviewerRef).toBe(canonicalPrincipalRef);
    expect(rating?.reviewerRef).not.toContain("clerk");
  });

  it("joins canonical categories with completed-call counts and bounded latency", async () => {
    const backend = backendWithAggregates();
    await backend.mutation(internal.marketListingEvidence.assignCategory, {
      toolRef,
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
          { toolRef, durationMs: 100 + index * 10 },
        );
      }
    });

    const [evidence] = await backend.query(api.marketListingEvidence.read, {
      toolRefs: [toolRef],
      since: 1_000,
    });
    expect(evidence).toMatchObject({
      categoryId: "identity-compliance",
      completedCalls: 6,
      latencySamplesMs: [150, 140, 130, 120, 110, 100],
    });
  });

  it("attributes Qualified Use evidence to the exact Tool only", async () => {
    const backend = backendWithAggregates();
    const otherToolRef = `operation:v1:${"b".repeat(64)}`;

    await backend.run(async (ctx) => {
      await recordMarketEvidenceFact(
        ctx,
        "ae_qualified_use",
        "qualified-use:exact-operation",
        2_000,
        { toolRef },
      );
    });

    const evidence = await backend.query(api.marketListingEvidence.read, {
      toolRefs: [toolRef, otherToolRef],
      since: 1_000,
    });
    expect(evidence.map((item) => ({
      toolRef: item.toolRef,
      qualifiedUses: item.qualifiedUses,
    }))).toEqual([
      { toolRef, qualifiedUses: 1 },
      { toolRef: otherToolRef, qualifiedUses: 0 },
    ]);
  });

  it("rejects non-canonical Tool refs at the listing evidence read boundary", async () => {
    const backend = backendWithAggregates();
    await expect(backend.query(api.marketListingEvidence.read, {
      toolRefs: ["operation:v1:not-a-public-tool-ref"],
      since: 0,
    })).rejects.toThrow("market_listing_evidence_tool_ref_invalid");
  });

  it("rejects a rating from an owner who has not completed that Tool", async () => {
    const backend = backendWithAggregates();
    const { owner: reviewer, canonicalPrincipalRef } = await publishedBusinessOwner(
      backend,
      "market-rating-unused",
    );
    const otherToolRef = `operation:v1:${"c".repeat(64)}`;
    await completeCall(backend, canonicalPrincipalRef, otherToolRef);
    await expect(reviewer.mutation(api.marketListingEvidence.rate, {
      toolRef,
      score: 5,
    })).rejects.toThrow("market_rating_completed_call_required");
  });

  it("rejects anonymous ratings and invalid taxonomy assignments", async () => {
    const backend = backendWithAggregates();
    await expect(
      backend.mutation(api.marketListingEvidence.rate, {
        toolRef,
        score: 5,
      }),
    ).rejects.toThrow("market_rating_authentication_required");
    await expect(
      backend.mutation(internal.marketListingEvidence.assignCategory, {
        toolRef,
        categoryId: "made-up",
        assignedBy: "test",
        assignedAt: 1,
      }),
    ).rejects.toThrow("market_category_assignment_invalid");
  });
});
