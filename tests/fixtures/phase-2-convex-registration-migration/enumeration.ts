import type { RegisteredAction } from "convex/server";
import {
  httpActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import {
  action,
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

export const directQuery = query({
  args: {},
  handler: async () => null,
});

export const directMutation = mutation({
  args: {},
  handler: async () => null,
});

export const typedAction: RegisteredAction<
  "public",
  Record<string, never>,
  null
> = action({
  args: {},
  handler: async () => null,
});

export const directInternalQuery = internalQuery({
  args: {},
  handler: async () => null,
});

export const directInternalMutation = internalMutation({
  args: {},
  handler: async () => null,
});

export const directInternalAction = internalAction({
  args: {},
  handler: async () => null,
});

export const directHttpAction = httpAction(
  async () => new Response(null, { status: 204 }),
);

export const directGenericQuery = queryGeneric({
  args: {},
  handler: async () => null,
});

export const directGenericMutation = mutationGeneric({
  args: {},
  handler: async () => null,
});

export const directGenericInternalQuery = internalQueryGeneric({
  args: {},
  handler: async () => null,
});

export const directGenericInternalMutation = internalMutationGeneric({
  args: {},
  handler: async () => null,
});

export const directGenericHttpAction = httpActionGeneric(
  async () => new Response(null, { status: 204 }),
);
