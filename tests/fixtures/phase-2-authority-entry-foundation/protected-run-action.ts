import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { protectedInteractiveAction } from "../../../convex/lib/authorityRegistrars";

const fixedAction = makeFunctionReference<
  "action",
  Record<string, never>,
  string
>("foundation:forbiddenAction");

export const protectedRunAction = protectedInteractiveAction({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx) => await ctx.runAction(fixedAction, {}),
});
