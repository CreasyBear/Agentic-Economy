import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

const fixedMutation = makeFunctionReference<
  "mutation",
  Record<string, never>,
  string
>("foundation:forbiddenScheduledMutation");

export const protectedScheduler = protectedInteractiveMutation({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx) => await ctx.scheduler.runAfter(0, fixedMutation, {}),
});
