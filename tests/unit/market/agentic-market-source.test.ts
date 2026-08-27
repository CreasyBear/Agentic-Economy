import { describe, expect, it } from "vitest";

import {
  agenticMarketSnapshotSchema,
  explorerUrl,
  fetchAgenticMarketSnapshot,
  shortenHash,
} from "@/modules/market/agentic-market-source";
import {
  MARKET_MAX_DAILY_POINTS,
  MARKET_SOURCE_DELAYED_AFTER_MS,
  MARKET_SOURCE_UNAVAILABLE_AFTER_MS,
  marketSourceStatus,
} from "@/modules/market/contracts";

const timestamp = "2026-08-22T03:50:39.000Z";

function sourceFetch(
  overrides: Partial<
    Record<"overview" | "stats" | "transactions" | "services", unknown>
  > = {},
) {
  return async (url: string): Promise<Response> => {
    const body = url.includes("/overview")
      ? (overrides.overview ?? overviewFixture())
      : url.includes("/stats")
        ? (overrides.stats ?? statsFixture())
        : url.includes("/transactions")
          ? (overrides.transactions ?? transactionsFixture())
          : (overrides.services ?? servicesFixture());
    return Response.json(body);
  };
}

describe("AgenticMarketSource", () => {
  it("maps a bounded, privacy-safe snapshot and preserves exact integer strings", async () => {
    const snapshot = await fetchAgenticMarketSnapshot({
      window: "30d",
      fetch: sourceFetch(),
      now: 1_000,
    });
    expect(snapshot.metrics.map((metric) => metric.value)).toEqual([
      "12",
      "123456789",
      "3",
      "4",
    ]);
    expect(snapshot.daily).toHaveLength(MARKET_MAX_DAILY_POINTS);
    expect(snapshot.recentActivity[0]).toMatchObject({
      atomicAmount: "1000",
      decimals: 6,
      currency: "unknown",
      chain: "base",
      facilitator: "fluxa",
    });
    expect(JSON.stringify(snapshot)).not.toContain("0xsender");
    expect(JSON.stringify(snapshot)).not.toContain("0xrecipient");
    expect(snapshot.featuredExternalServices).toHaveLength(1);
  });

  it("rejects unsafe amounts instead of rounding them", async () => {
    await expect(
      fetchAgenticMarketSnapshot({
        window: "24h",
        fetch: sourceFetch({
          overview: overviewFixture({
            total_amount: Number.MAX_SAFE_INTEGER + 1,
          }),
        }),
      }),
    ).rejects.toThrow();
  });

  it("rejects wrapper changes and malformed dates", async () => {
    await expect(
      fetchAgenticMarketSnapshot({
        window: "7d",
        fetch: sourceFetch({ overview: { ...overviewFixture(), extra: true } }),
      }),
    ).rejects.toThrow();
    await expect(
      fetchAgenticMarketSnapshot({
        window: "7d",
        fetch: sourceFetch({
          overview: overviewFixture({ latest_block_timestamp: "yesterday" }),
        }),
      }),
    ).rejects.toThrow();
  });

  it("keeps headline evidence when optional activity and service panels fail", async () => {
    const fetch = async (url: string): Promise<Response> => {
      if (url.includes("/overview")) return Response.json(overviewFixture());
      if (url.includes("/stats")) return Response.json(statsFixture());
      return new Response("upstream unavailable", { status: 503 });
    };

    const snapshot = await fetchAgenticMarketSnapshot({
      window: "30d",
      fetch,
      now: 1_000,
    });

    expect(snapshot.metrics.map((metric) => metric.value)).toEqual([
      "12",
      "123456789",
      "3",
      "4",
    ]);
    expect(snapshot.daily).toHaveLength(MARKET_MAX_DAILY_POINTS);
    expect(snapshot.recentActivity).toEqual([]);
    expect(snapshot.featuredExternalServices).toEqual([]);
  });

  it("rejects malformed persisted snapshot projections", () => {
    expect(
      agenticMarketSnapshotSchema.safeParse({
        fetchedAt: 1_000,
        sourceTimestamp: timestamp,
        metrics: [],
        daily: [],
        recentActivity: [{ sender: "0xprivate" }],
        featuredExternalServices: [],
      }).success,
    ).toBe(false);
  });

  it("keeps unknown chains unknown and only emits recognised explorer links", () => {
    expect(explorerUrl("base", "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerUrl("solana:mainnet", "5ig")).toBe(
      "https://solscan.io/tx/5ig",
    );
    expect(explorerUrl("unknown", "abc")).toBeUndefined();
    expect(shortenHash("1234567890abcdefghijkl")).toBe("12345678…ghijkl");
  });

  it("classifies current, delayed, and unavailable last-known-good snapshots", () => {
    const now = 48 * 60 * 60_000;
    expect(marketSourceStatus(now - 5 * 60_000, now)).toBe("live");
    expect(marketSourceStatus(now - MARKET_SOURCE_DELAYED_AFTER_MS, now)).toBe("delayed");
    expect(marketSourceStatus(now - MARKET_SOURCE_UNAVAILABLE_AFTER_MS, now)).toBe("unavailable");
    expect(marketSourceStatus(undefined, now)).toBe("unavailable");
  });
});

function overviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    overview: {
      json: {
        total_transactions: 12,
        total_amount: 123_456_789,
        unique_buyers: 3,
        unique_sellers: 4,
        latest_block_timestamp: timestamp,
        ...overrides,
      },
      meta: {},
    },
  };
}

function statsFixture() {
  return {
    stats: {
      json: Array.from({ length: 40 }, (_, index) => ({
        bucket_start: new Date(
          Date.parse(timestamp) - index * 86_400_000,
        ).toISOString(),
        total_transactions: index,
        total_amount: index * 1_000,
        unique_buyers: index,
        unique_sellers: index,
      })),
      meta: {},
    },
  };
}

function transactionsFixture() {
  return {
    transactions: {
      json: {
        items: [
          {
            id: "activity-1",
            address: null,
            transaction_from: null,
            sender: "0xsender",
            recipient: "0xrecipient",
            amount: 1000,
            block_timestamp: timestamp,
            tx_hash: "0x1234567890abcdef1234567890abcdef",
            chain: "base",
            provider: "bitquery",
            decimals: 6,
            facilitator_id: "fluxa",
            log_index: 1,
            token_address: null,
          },
        ],
        page: 0,
        hasNextPage: false,
      },
      meta: {},
    },
  };
}

function servicesFixture() {
  return {
    services: [
      {
        id: "service-1",
        name: "Research",
        description: "External research service",
        domain: "example.com",
        provider: "Example",
        providerUrl: "https://example.com/service",
        category: "Search",
        networks: ["Base"],
        enriched: true,
        endpoints: [],
        integrationType: "1P",
        isNew: false,
        priceSummary: {},
        serviceName: "Research",
        tags: ["search"],
        iconUrl: "",
      },
    ],
    total: 1,
    limit: 6,
    offset: 0,
  };
}
