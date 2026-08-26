import { protectedInteractiveQuery } from "../../../convex/lib/authorityRegistrars";
import { v } from "convex/values";

const fixedFactory = () =>
  protectedInteractiveQuery({
    args: { accountRef: v.string() },
    check: (args, authority) => {
      if (args.accountRef !== authority.accountRef)
        throw new Error("authority_entry_wrong_account");
      return args;
    },
  });

export const factorySafe = fixedFactory()({
  args: {},
  handler: async (_ctx, args) => args.accountRef,
});
