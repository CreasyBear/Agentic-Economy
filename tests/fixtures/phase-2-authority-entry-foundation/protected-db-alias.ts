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
    return await db.insert("owners", {
      clerkUserId: "forbidden-protected-db-alias",
      createdAt: 0,
      updatedAt: 0,
    });
  },
});
