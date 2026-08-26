import * as registrars from "../../../convex/lib/authorityRegistrars";
import { v } from "convex/values";

const callerSelected = "narrowSystemMutation" as keyof typeof registrars;
// @ts-expect-error Hostile fixture: namespace-indexed registrar selection must be rejected.
export const unsafeDynamicMode = registrars[callerSelected]({
  args: { target: v.string() },
  handler: async (_ctx: unknown, args: { target: string }) => args.target,
});
