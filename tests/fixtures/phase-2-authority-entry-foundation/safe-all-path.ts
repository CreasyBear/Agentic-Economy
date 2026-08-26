import { v } from "convex/values";

import { protectedInteractiveQuery } from "../../../convex/lib/authorityRegistrars";

export const safeAllPath = protectedInteractiveQuery({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: { branch: v.boolean() },
  handler: async (_ctx, args) =>
    args.branch ? args.accountRef : `safe:${args.accountRef}`,
});
