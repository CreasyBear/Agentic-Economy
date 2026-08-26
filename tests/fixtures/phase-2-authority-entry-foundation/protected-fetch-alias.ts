import { v } from "convex/values";

import { protectedInteractiveAction } from "../../../convex/lib/authorityRegistrars";

export const protectedFetchAlias = protectedInteractiveAction({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async () => {
    const outbound = fetch;
    return (await outbound("https://forbidden.invalid")).status;
  },
});
