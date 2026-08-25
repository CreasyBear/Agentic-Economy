import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { countMarketEvidence } from "./marketEvidence";
import { countMarketPresence } from "./marketPresence";

const marketWindowValue = v.union(
  v.literal("24h"),
  v.literal("7d"),
  v.literal("30d"),
);
const snapshotValue = v.object({
  fetchedAt: v.number(),
  sourceTimestamp: v.string(),
  snapshotJson: v.string(),
});
const firstPartyCountsValue = v.object({
  operations: v.number(),
  suppliers: v.number(),
  invocations: v.number(),
  completedInvocations: v.number(),
  qualifiedUses: v.number(),
  settlements: v.number(),
  reconciliationRequired: v.number(),
});
const encoder = new TextEncoder();

export const upsert = internalMutation({
  args: {
    window: marketWindowValue,
    fetchedAt: v.number(),
    sourceTimestamp: v.string(),
    snapshotJson: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !Number.isSafeInteger(args.fetchedAt) ||
      args.fetchedAt < 0 ||
      encoder.encode(args.snapshotJson).byteLength > 500_000
    )
      throw new Error("market_snapshot_invalid");
    const existing = await ctx.db
      .query("marketExternalSnapshots")
      .withIndex("by_window", (index) => index.eq("window", args.window))
      .unique();
    if (existing !== null && existing.fetchedAt > args.fetchedAt) return null;
    if (existing === null) await ctx.db.insert("marketExternalSnapshots", args);
    else await ctx.db.replace(existing._id, args);
    return null;
  },
});

export const read = query({
  args: { window: marketWindowValue, now: v.number() },
  returns: v.object({
    snapshot: v.union(snapshotValue, v.null()),
    generatedAt: v.number(),
    firstPartyAvailable: v.boolean(),
    firstParty: firstPartyCountsValue,
  }),
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.now) || args.now < 0) {
      throw new Error("market_read_time_invalid");
    }
    const since = args.now - windowMilliseconds(args.window);
    const [
      row,
      invocations,
      completedInvocations,
      qualifiedUses,
      settlements,
      reconciliationRequired,
      presence,
    ] = await Promise.all([
      ctx.db
        .query("marketExternalSnapshots")
        .withIndex("by_window", (index) => index.eq("window", args.window))
        .unique(),
      countMarketEvidence(ctx, "ae_invocation", since),
      countMarketEvidence(ctx, "ae_invocation_completed", since),
      countMarketEvidence(ctx, "ae_qualified_use", since),
      countMarketEvidence(ctx, "ae_settlement", since),
      countMarketEvidence(ctx, "ae_reconciliation_required", since),
      countMarketPresence(ctx),
    ]);
    return {
      snapshot:
        row === null
          ? null
          : {
              fetchedAt: row.fetchedAt,
              sourceTimestamp: row.sourceTimestamp,
              snapshotJson: row.snapshotJson,
            },
      generatedAt: args.now,
      firstPartyAvailable: true,
      firstParty: {
        ...presence,
        invocations,
        completedInvocations,
        qualifiedUses,
        settlements,
        reconciliationRequired,
      },
    };
  },
});

function windowMilliseconds(window: "24h" | "7d" | "30d"): number {
  if (window === "24h") return 24 * 60 * 60_000;
  if (window === "7d") return 7 * 24 * 60 * 60_000;
  return 30 * 24 * 60 * 60_000;
}
