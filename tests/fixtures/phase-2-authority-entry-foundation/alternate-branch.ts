import { mutationGeneric as register } from "convex/server";

export const unsafeBranch = register(
  async (_ctx, args: { bypass?: boolean }) =>
    args.bypass ? "effect-before-authority" : "authority-later",
);
