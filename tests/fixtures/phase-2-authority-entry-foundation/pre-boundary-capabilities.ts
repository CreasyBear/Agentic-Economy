import { action, mutation } from "../../../convex/_generated/server";
import { makeFunctionReference } from "convex/server";

export const unsafeWrite = mutation(
  async (ctx) =>
    await ctx.db.insert("businesses", {
      owningAccountRef: "acc_caller-shaped",
      slug: "caller-shaped-unsafe-write",
      name: "Caller-shaped unsafe write",
      normalizedName: "caller-shaped unsafe write",
      category: "hostile fixture",
      businessContext: { kind: "local_human", suburb: "Perth", stateTerritory: "WA" },
      publicStatus: "unpublished",
      trustTier: "claimed",
      sourceHash: "hash:caller-shaped-unsafe-write",
      createdAt: 0,
      updatedAt: 0,
    }),
);

const unsafeWriteRef = makeFunctionReference<
  "mutation",
  Record<string, never>,
  string
>("unsafe:write");
export const unsafeSchedule = mutation(
  async (ctx) => await ctx.scheduler.runAfter(0, unsafeWriteRef, {}),
);

export const unsafeFetch = action(
  async () => await fetch("https://example.invalid"),
);
