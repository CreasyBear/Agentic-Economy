import { query } from "./_generated/server";
import { missingValue } from "./module-that-does-not-exist";

export const invalidProjectRegistration = query({
  args: {},
  handler: async () => missingValue,
});
