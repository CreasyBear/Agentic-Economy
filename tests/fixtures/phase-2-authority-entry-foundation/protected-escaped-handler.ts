import { v } from "convex/values";

import type { MutationCtx } from "../../../convex/_generated/server";
import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

const escaped = async (ctx: Omit<MutationCtx, "auth">) =>
  await ctx.db.insert("owners", {
    clerkUserId: "escaped-protected-handler",
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
