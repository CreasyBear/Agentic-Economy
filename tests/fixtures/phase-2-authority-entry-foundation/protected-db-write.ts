import { v } from "convex/values";

import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

export const protectedDbWrite = protectedInteractiveMutation({
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
      owningAccountRef: "acc_forbidden-protected-db-write",
      slug: "forbidden-protected-db-write",
      name: "Forbidden protected db write",
      normalizedName: "forbidden protected db write",
      category: "hostile fixture",
      businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
      publicStatus: "unpublished",
      trustTier: "claimed",
      sourceHash: "hash:forbidden-protected-db-write",
      createdAt: 0,
      updatedAt: 0,
    }),
});
