import { v } from "convex/values";

import { protectedInteractiveMutation as fixedProtectedMutation } from "../../../convex/lib/authorityRegistrars";

export const protectedAliasCapability = fixedProtectedMutation({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx) =>
    await ctx.db.insert("businesses", {
      owningAccountRef: "acc_forbidden-protected-alias-write",
      slug: "forbidden-protected-alias-write",
      name: "Forbidden protected alias write",
      normalizedName: "forbidden protected alias write",
      category: "hostile fixture",
      businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
      publicStatus: "unpublished",
      trustTier: "claimed",
      sourceHash: "hash:forbidden-protected-alias-write",
      createdAt: 0,
      updatedAt: 0,
    }),
});
