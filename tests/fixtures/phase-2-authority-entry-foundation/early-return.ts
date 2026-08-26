import { mutation } from "../../../convex/_generated/server";

export const unsafeEarlyReturn = mutation(
  async () => "effect-before-authority",
);
