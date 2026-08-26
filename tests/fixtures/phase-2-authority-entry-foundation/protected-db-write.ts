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
    await ctx.db.insert("owners", {
      clerkUserId: "forbidden-protected-db-write",
      createdAt: 0,
      updatedAt: 0,
    }),
});
