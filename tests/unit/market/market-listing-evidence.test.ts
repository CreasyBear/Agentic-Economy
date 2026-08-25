import { describe, expect, it } from "vitest";

import {
  emptyMarketListingEvidence,
  projectMarketListingEvidence,
} from "@/modules/market/listing-evidence";

describe("market listing evidence", () => {
  it("keeps absent evidence explicit instead of fabricating zeros", () => {
    const projection = emptyMarketListingEvidence(
      "operation:v1:unrated",
      "web.search",
    );

    expect(projection.category).toMatchObject({
      id: "data-research",
      label: "Data & research",
    });
    expect(projection.rating).toMatchObject({
      kind: "unrated",
      display: "No ratings yet",
    });
    expect(projection.popularity).toMatchObject({
      kind: "no_activity",
      display: "No completed calls yet",
    });
    expect(projection.latency).toMatchObject({
      kind: "insufficient_sample",
      sampleSize: 0,
      display: "Not enough data",
    });
  });

  it("projects persisted category, authenticated ratings, usage, and bounded latency", () => {
    const projection = projectMarketListingEvidence(
      {
        operationRef: "operation:v1:observed",
        categoryId: "identity-compliance",
        ratingCount: 4,
        ratingSum: 18,
        completedInvocations: 1_240,
        latencySamplesMs: [90, 110, 100, 130, 2_000, 120],
      },
      "generic.capability",
    );

    expect(projection.category.id).toBe("identity-compliance");
    expect(projection.rating).toMatchObject({
      kind: "rated",
      average: 4.5,
      count: 4,
      display: "4.5 (4)",
    });
    expect(projection.popularity).toMatchObject({
      kind: "observed",
      completedInvocations: 1_240,
      display: "1,240 completed calls",
    });
    expect(projection.latency).toMatchObject({
      kind: "measured",
      medianMs: 110,
      p95Ms: 2_000,
      sampleSize: 6,
      display: "110 ms",
    });
  });

  it("does not claim latency below the minimum evidence threshold", () => {
    const projection = projectMarketListingEvidence(
      {
        operationRef: "operation:v1:sparse",
        ratingCount: 0,
        ratingSum: 0,
        completedInvocations: 3,
        latencySamplesMs: [10, 20, 30, 40],
      },
      "code.deploy",
    );

    expect(projection.category.id).toBe("developer-tools");
    expect(projection.latency).toMatchObject({
      kind: "insufficient_sample",
      sampleSize: 4,
      minimumSampleSize: 5,
    });
  });
});
