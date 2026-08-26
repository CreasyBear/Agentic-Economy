import { protectedInteractiveQuery as fixedInteractiveQuery } from "../../../convex/lib/authorityRegistrars";
import { v } from "convex/values";

export const aliasSafe = fixedInteractiveQuery({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({ args: {}, handler: async (_ctx, args) => args.accountRef });
