import { v } from "convex/values";

import { protectedInteractiveAction } from "../../../convex/lib/authorityRegistrars";

export const protectedFetch = protectedInteractiveAction({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (_ctx) => (await fetch("https://example.invalid")).status,
});
