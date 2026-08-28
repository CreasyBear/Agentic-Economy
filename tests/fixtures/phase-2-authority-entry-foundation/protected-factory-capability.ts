import { v } from "convex/values";

import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

const fixedProtectedFactory = () =>
  protectedInteractiveMutation({
    args: { accountRef: v.string() },
    check: (args, authority) => {
      if (args.accountRef !== authority.accountRef)
        throw new Error("authority_entry_wrong_account");
      return args;
    },
  });

export const protectedFactoryCapability = fixedProtectedFactory()({
  args: {},
  handler: async (ctx) =>
    await ctx.db.insert("businesses", {
      owningAccountRef: "acc_forbidden-protected-factory-write",
      slug: "forbidden-protected-factory-write",
      name: "Forbidden protected factory write",
      normalizedName: "forbidden protected factory write",
      category: "hostile fixture",
      businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
      publicStatus: "unpublished",
      trustTier: "claimed",
      sourceHash: "hash:forbidden-protected-factory-write",
      createdAt: 0,
      updatedAt: 0,
    }),
});
