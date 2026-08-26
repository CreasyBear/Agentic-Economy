import { action, mutation } from "../../../convex/_generated/server";
import { makeFunctionReference } from "convex/server";

export const unsafeWrite = mutation(
  async (ctx) =>
    await ctx.db.insert("owners", {
      clerkUserId: "caller-shaped",
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
