import { v } from "convex/values";

import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

export const protectedDbAlias = protectedInteractiveMutation({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db;
    return await db.insert("businesses", {
      owningAccountRef: "acc_forbidden-protected-db-alias",
      slug: "forbidden-protected-db-alias",
      name: "Forbidden protected db alias",
      normalizedName: "forbidden protected db alias",
      category: "hostile fixture",
      businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
      publicStatus: "unpublished",
      trustTier: "claimed",
      sourceHash: "hash:forbidden-protected-db-alias",
      createdAt: 0,
      updatedAt: 0,
    });
  },
});
