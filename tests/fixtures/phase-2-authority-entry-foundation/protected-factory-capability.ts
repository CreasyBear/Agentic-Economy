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
    await ctx.db.insert("owners", {
      clerkUserId: "forbidden-protected-factory-write",
      createdAt: 0,
      updatedAt: 0,
    }),
});
