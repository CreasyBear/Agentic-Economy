import type { RegisteredQuery } from "convex/server";
import { v } from "convex/values";

import { protectedInteractiveQuery } from "../../../convex/lib/authorityRegistrars";

export const typedSafe: RegisteredQuery<
  "public",
  { accountRef: string },
  string
> = protectedInteractiveQuery({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  returns: v.string(),
  handler: async (_ctx, args) => args.accountRef,
});
