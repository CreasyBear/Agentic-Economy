import { afterEach, describe, expect, it, vi } from "vitest";
import { setPublicSourceTransportForTests } from "@/lib/server/convex-source";
import { readToolListingEvidence } from "@/modules/market/server";

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
      samplesMs: [],
      display: "Not enough data",
    });
  });

  it("projects persisted category, authenticated ratings, usage, and bounded latency", () => {
    const projection = projectMarketListingEvidence(
      {
        toolRef: "operation:v1:observed",
        categoryId: "identity-compliance",
        ratingCount: 4,
        ratingSum: 18,
        completedCalls: 1_240,
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
      completedCalls: 1_240,
      display: "1,240 completed calls",
    });
    expect(projection.latency).toMatchObject({
      kind: "measured",
      medianMs: 110,
      p95Ms: 2_000,
      sampleSize: 6,
      samplesMs: [90, 110, 100, 130, 2_000, 120],
      display: "110 ms",
    });
  });

  it("does not claim latency below the minimum evidence threshold", () => {
    const projection = projectMarketListingEvidence(
      {
        toolRef: "operation:v1:sparse",
        ratingCount: 0,
        ratingSum: 0,
        completedCalls: 3,
        latencySamplesMs: [10, 20, 30, 40],
      },
      "code.deploy",
    );

    expect(projection.category.id).toBe("developer-tools");
    expect(projection.latency).toMatchObject({
      kind: "insufficient_sample",
      sampleSize: 4,
      minimumSampleSize: 5,
      samplesMs: [10, 20, 30, 40],
    });
  });

  it("categorizes from the job name and summary, not only the capability id", () => {
    expect(
      emptyMarketListingEvidence(
        "operation:v1:amazon",
        "post.glim-sh.api-v1-amazon-search",
        "Amazon Search Search Amazon product listings.",
      ).category.id,
    ).toBe("commerce");
    expect(
      emptyMarketListingEvidence(
        "operation:v1:tides",
        "generic.capability",
        "Ocean tides from NOAA stations.",
      ).category.id,
    ).toBe("data-research");
    expect(
      emptyMarketListingEvidence(
        "operation:v1:gas",
        "post.oracle.gas",
      ).category.id,
    ).toBe("developer-tools");
  });
});


describe("listing history read truth", () => {
  afterEach(() => setPublicSourceTransportForTests(undefined));
  const tool = {
    toolRef: `operation:v1:${"d".repeat(64)}`,
    summary: "Current weather",
    listing: { label: "Weather", summary: "Current weather" },
    contract: { capabilityId: "weather.current" },
  } as Parameters<typeof readToolListingEvidence>[0];

  it("distinguishes failed and missing reads from a successful zero count", async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ toolRef: tool.toolRef, ratingCount: 0,
        ratingSum: 0, completedCalls: 0, latencySamplesMs: [] }]);
    setPublicSourceTransportForTests({ query, mutation: vi.fn(), action: vi.fn() } as never);
    await expect(readToolListingEvidence(tool)).resolves.toBeUndefined();
    await expect(readToolListingEvidence(tool)).resolves.toBeUndefined();
    await expect(readToolListingEvidence(tool)).resolves.toMatchObject({
      popularity: { kind: "no_activity", completedCalls: 0 },
    });
  });
});
