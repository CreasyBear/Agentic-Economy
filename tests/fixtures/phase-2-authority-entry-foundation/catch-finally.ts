import { internalMutation } from "../../../convex/_generated/server";

export const unsafeCatchFinally = internalMutation(async () => {
  try {
    throw new Error("authority-denied");
  } catch {
    return "effect-in-catch";
  } finally {
    void "effect-in-finally";
  }
});
