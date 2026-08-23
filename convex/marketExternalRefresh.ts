import { v } from "convex/values";

import { fetchAgenticMarketSnapshot } from "@/modules/market/agentic-market-source";
import { marketWindows } from "@/modules/market/contracts";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const run = internalAction({
  args: {},
  returns: v.object({ refreshed: v.number(), failed: v.number() }),
  handler: async (ctx) => {
    const results = await Promise.allSettled(
      marketWindows.map(async (window) => {
        const snapshot = await fetchAgenticMarketSnapshot({ window });
        await ctx.runMutation(internal.marketExternalSnapshots.upsert, {
          window,
          fetchedAt: snapshot.fetchedAt,
          sourceTimestamp: snapshot.sourceTimestamp,
          snapshotJson: JSON.stringify(snapshot),
        });
      }),
    );
    const refreshed = results.filter(
      (result) => result.status === "fulfilled",
    ).length;
    return { refreshed, failed: results.length - refreshed };
  },
});
