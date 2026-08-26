import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";

import { protectedInteractiveMutation } from "../../../convex/lib/authorityRegistrars";

const fixedQuery = makeFunctionReference<
  "query",
  Record<string, never>,
  string
>("foundation:forbiddenQuery");

export const protectedRunQuery = protectedInteractiveMutation({
  args: { accountRef: v.string() },
  check: (args, authority) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return args;
  },
})({
  args: {},
  handler: async (ctx) => await ctx.runQuery(fixedQuery, {}),
});
