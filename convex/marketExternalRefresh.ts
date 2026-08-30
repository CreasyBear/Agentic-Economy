import { v } from "convex/values";

import { fetchAgenticMarketSnapshot } from "@/modules/market/agentic-market-source";
import { marketWindows } from "@/modules/market/contracts";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import {
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
  type WorkloadCronSnapshot,
} from "./workloadCron";

export const run = internalAction({
  args: { workload: workloadCronSnapshotValue },
  returns: v.object({ refreshed: v.number(), failed: v.number() }),
  handler: async (ctx, args) => {
    const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
      name: "refresh Agentic Market snapshots",
      snapshot: parseWorkloadCronSnapshot(args.workload),
    });
    const authorized = bindWorkloadCronActionContext(ctx, {
      name: "refresh Agentic Market snapshots",
      snapshot: workload,
    });
    const results = await Promise.allSettled(
      marketWindows.map(async (window) => {
        const snapshot = await fetchAgenticMarketSnapshot({ window });
        await authorized.runMutation(internal.marketExternalSnapshots.upsert, {
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
