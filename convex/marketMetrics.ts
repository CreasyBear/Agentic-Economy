import { v } from "convex/values";

import { query } from "./_generated/server";
import { countMarketEvidence } from "./marketEvidence";
import { countMarketPresence } from "./marketPresence";

// First-party market metrics read: aggregates Agentic Economy write-seam
// evidence (invocations, settlements, qualified uses, presence) into the
// counts the market page renders. There is no external/third-party snapshot
// source; AEcon does not yet publish one.
const marketWindowValue = v.union(
  v.literal("24h"),
  v.literal("7d"),
  v.literal("30d"),
);
const firstPartyCountsValue = v.object({
  tools: v.number(),
  providers: v.number(),
  invocations: v.number(),
  completedInvocations: v.number(),
  qualifiedUses: v.number(),
  settlements: v.number(),
  reconciliationRequired: v.number(),
});
export const read = query({
  args: { window: marketWindowValue, now: v.number() },
  returns: v.object({
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
      invocations,
      completedInvocations,
      qualifiedUses,
      settlements,
      reconciliationRequired,
      presence,
    ] = await Promise.all([
      countMarketEvidence(ctx, "ae_invocation", since),
      countMarketEvidence(ctx, "ae_invocation_completed", since),
      countMarketEvidence(ctx, "ae_qualified_use", since),
      countMarketEvidence(ctx, "ae_settlement", since),
      countMarketEvidence(ctx, "ae_reconciliation_required", since),
      countMarketPresence(ctx),
    ]);
    return {
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
