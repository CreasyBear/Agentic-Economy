/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Agentic Market snapshots", () => {
  it("does not let a slower, older refresh replace newer evidence", async () => {
    const backend = convexTest(schema, modules);

    await backend.mutation(internal.marketExternalSnapshots.upsert, {
      window: "30d",
      fetchedAt: 2_000,
      sourceTimestamp: "2026-08-23T02:00:00.000Z",
      snapshotJson: '{"version":"newer"}',
    });
    await backend.mutation(internal.marketExternalSnapshots.upsert, {
      window: "30d",
      fetchedAt: 1_000,
      sourceTimestamp: "2026-08-23T01:00:00.000Z",
      snapshotJson: '{"version":"older"}',
    });

    const stored = await backend.run(async (ctx) =>
      ctx.db
        .query("marketExternalSnapshots")
        .withIndex("by_window", (index) => index.eq("window", "30d"))
        .unique(),
    );

    expect(stored).toMatchObject({
      fetchedAt: 2_000,
      sourceTimestamp: "2026-08-23T02:00:00.000Z",
      snapshotJson: '{"version":"newer"}',
    });
  });

  it("accepts an idempotent replay at the same source timestamp", async () => {
    const backend = convexTest(schema, modules);
    const snapshot = {
      window: "7d" as const,
      fetchedAt: 2_000,
      sourceTimestamp: "2026-08-23T02:00:00.000Z",
      snapshotJson: '{"version":"current"}',
    };

    await backend.mutation(internal.marketExternalSnapshots.upsert, snapshot);
    await backend.mutation(internal.marketExternalSnapshots.upsert, snapshot);

    const stored = await backend.run(async (ctx) =>
      ctx.db
        .query("marketExternalSnapshots")
        .withIndex("by_window", (index) => index.eq("window", "7d"))
        .unique(),
    );
    expect(stored).toMatchObject(snapshot);
  });
});
