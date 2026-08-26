import { v } from "convex/values";

import {
  protectedInteractiveAction,
  protectedInteractiveMutation,
  protectedInteractiveMutationGeneric,
  protectedInteractiveInternalMutationGeneric,
  protectedInteractiveInternalAction,
  protectedInteractiveInternalActionGeneric,
  protectedInteractiveInternalMutation,
  protectedInteractiveInternalQuery,
  protectedInteractiveActionGeneric,
  protectedInteractiveQuery,
  protectedInteractiveInternalQueryGeneric,
  protectedInteractiveQueryGeneric,
  publicReadQuery,
  publicReadQueryGeneric,
  narrowSystemAction,
  narrowSystemQuery,
  narrowSystemMutation,
  devOnlyInternalMutation,
} from "../../../convex/lib/authorityRegistrars";

const checkedAccountSelector = {
  args: { accountRef: v.string() },
  check: (
    args: Readonly<{ accountRef: string }>,
    authority: Readonly<{ accountRef: string }>,
  ) => {
    if (args.accountRef !== authority.accountRef)
      throw new Error("authority_entry_wrong_account");
    return Object.freeze({ accountRef: args.accountRef });
  },
} as const;

export const ordinaryQuery = protectedInteractiveQuery(checkedAccountSelector)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const genericQuery = protectedInteractiveQueryGeneric(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const ordinaryMutation = protectedInteractiveMutation(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const genericMutation = protectedInteractiveMutationGeneric(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const ordinaryAction = protectedInteractiveAction(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const genericAction = protectedInteractiveActionGeneric(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const ordinaryInternalQuery = protectedInteractiveInternalQuery(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const ordinaryInternalMutation = protectedInteractiveInternalMutation(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const ordinaryInternalAction = protectedInteractiveInternalAction(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const genericInternalAction = protectedInteractiveInternalActionGeneric(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const genericInternalQuery = protectedInteractiveInternalQueryGeneric(
  checkedAccountSelector,
)({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
});

export const genericInternalMutation =
  protectedInteractiveInternalMutationGeneric(checkedAccountSelector)({
    args: { value: v.string() },
    returns: v.string(),
    handler: async (_ctx, args) => `${args.accountRef}:${args.value}`,
  });

export const publicProjection = publicReadQuery({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => args.value,
});

export const publicProjectionGeneric = publicReadQueryGeneric({
  args: { value: v.string() },
  returns: v.string(),
  handler: async (_ctx, args) => args.value,
});

export const narrowSystemRead = narrowSystemQuery({
  args: { literalTarget: v.literal("foundation:narrow-system") },
  returns: v.string(),
  handler: async (ctx, args) =>
    `${ctx.registrationClass.mode}:${args.literalTarget}`,
});

export const narrowSystem = narrowSystemMutation({
  args: { literalTarget: v.literal("foundation:narrow-system") },
  returns: v.string(),
  handler: async (ctx, args) =>
    `${ctx.registrationClass.mode}:${args.literalTarget}`,
});

export const narrowSystemEffect = narrowSystemAction({
  args: { literalTarget: v.literal("foundation:narrow-system") },
  returns: v.string(),
  handler: async (ctx, args) =>
    `${ctx.registrationClass.mode}:${args.literalTarget}`,
});

export const developmentOnly = devOnlyInternalMutation({
  args: { literalTarget: v.literal("foundation:development") },
  returns: v.string(),
  handler: async (ctx, args) =>
    `${ctx.registrationClass.mode}:${args.literalTarget}`,
});
