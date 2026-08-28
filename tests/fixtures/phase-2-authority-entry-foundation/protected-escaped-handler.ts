import { v } from "convex/values";

import type { MutationCtx } from "../../../convex/_generated/server";
import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

const escaped = async (ctx: Omit<MutationCtx, "auth">) =>
  await ctx.db.insert("businesses", {
    owningAccountRef: "acc_escaped-protected-handler",
    slug: "escaped-protected-handler",
    name: "Escaped protected handler",
    normalizedName: "escaped protected handler",
    category: "hostile fixture",
    businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
    publicStatus: "unpublished",
    trustTier: "claimed",
    sourceHash: "hash:escaped-protected-handler",
    createdAt: 0,
    updatedAt: 0,
  });

export const protectedEscapedHandler = protectedInteractiveMutation({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: escaped,
});
