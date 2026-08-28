import { v } from "convex/values";

import type { MutationCtx } from "../../../convex/_generated/server";
import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

async function writeThroughEscapedContext(ctx: Omit<MutationCtx, "auth">) {
  return await ctx.db.insert("businesses", {
    owningAccountRef: "acc_escaped-protected-context",
    slug: "escaped-protected-context",
    name: "Escaped protected context",
    normalizedName: "escaped protected context",
    category: "hostile fixture",
    businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
    publicStatus: "unpublished",
    trustTier: "claimed",
    sourceHash: "hash:escaped-protected-context",
    createdAt: 0,
    updatedAt: 0,
  });
}

export const protectedContextEscape = protectedInteractiveMutation({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx) => await writeThroughEscapedContext(ctx),
});
