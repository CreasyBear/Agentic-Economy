import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { protectedInteractiveAction } from "../../../convex/lib/authorityRegistrars";

export const protectedAllowedDynamicTarget = protectedInteractiveAction({
  args: { accountRef: v.string(), target: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx, args) =>
    await ctx.runMutation(makeFunctionReference<"mutation">(args.target), {}),
});
