import { action } from "../../../convex/_generated/server";
import type { FunctionReference } from "convex/server";

export const unsafeDynamicTarget = action(
  async (ctx, args: { target: FunctionReference<"mutation"> }) =>
    await ctx.runMutation(args.target, {}),
);
