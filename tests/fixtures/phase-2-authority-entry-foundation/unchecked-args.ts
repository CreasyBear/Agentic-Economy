import { query } from "../../../convex/_generated/server";
import { v } from "convex/values";

export const unsafeCallerAccount = query({
  args: { accountRef: v.string() },
  handler: async (_ctx, args) => args.accountRef,
});
