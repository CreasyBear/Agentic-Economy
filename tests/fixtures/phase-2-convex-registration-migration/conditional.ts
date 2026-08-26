import type { RegisteredQuery } from "convex/server";
import { queryGeneric } from "convex/server";
import { query } from "./_generated/server";

declare const useGeneratedRegistrar: boolean;

const conditionalRegistrar = useGeneratedRegistrar ? query : queryGeneric;

export const conditionalRegistration: RegisteredQuery<
  "public",
  Record<string, never>,
  null
> = conditionalRegistrar({
  args: {},
  handler: async () => null,
});
