import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { protectedInteractiveAction } from "../../../convex/lib/authorityRegistrars";

export const protectedRunMutationDynamicTarget = protectedInteractiveAction({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: { target: v.string() },
  handler: async (ctx, args) =>
    await ctx.runMutation(
      makeFunctionReference<"mutation", Record<string, never>, string>(
        args.target,
      ),
      {},
    ),
});
