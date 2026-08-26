import {
  actionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type ActionBuilder,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import {
  customAction,
  customCtxAndArgs,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import type { ObjectType, PropertyValidators } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { resolveBusinessActor } from "../authz";

// This is the finite inventory vocabulary used by registration manifests. The
// shared foundation below implements the interactive protected entry seam and
// literal exemption seams; domain-specific protected modes retain their own
// canonical admission until their separately owned migration rows move here.
export const AUTHORITY_REGISTRAR_MODES = [
  "protected_interactive_principal_account",
  "protected_agent_delegation_generation",
  "protected_signed_callback_provenance",
  "protected_durable_workload",
  "protected_workload_account",
  "public_read_exemption",
  "narrow_system_exemption",
  "dev_only_exemption",
] as const;

export type AuthorityRegistrarMode = (typeof AUTHORITY_REGISTRAR_MODES)[number];

export class AuthorityEntryDeniedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AuthorityEntryDeniedError";
    this.code = code;
  }
}

export type InteractiveEntryAuthority = Readonly<{
  mode: "protected_interactive_principal_account";
  principalRef: string;
  accountRef: string;
  legacyOwnerId: string;
  legacyOwnerLocator: string;
  revision: Readonly<Record<string, number>>;
  provenance: Readonly<Record<string, string | number>>;
}>;

export type CheckedSelectorSpec<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
> = Readonly<{
  args: Args;
  check: (
    args: Readonly<ObjectType<Args>>,
    authority: InteractiveEntryAuthority,
  ) => Checked | Promise<Checked>;
}>;

type InteractiveCtxPatch = Readonly<{ authority: InteractiveEntryAuthority }>;

const appQueryGeneric = queryGeneric as QueryBuilder<DataModel, "public">;
const appInternalQueryGeneric = internalQueryGeneric as QueryBuilder<
  DataModel,
  "internal"
>;
const appMutationGeneric = mutationGeneric as MutationBuilder<
  DataModel,
  "public"
>;
const appInternalMutationGeneric = internalMutationGeneric as MutationBuilder<
  DataModel,
  "internal"
>;
const appActionGeneric = actionGeneric as ActionBuilder<DataModel, "public">;
const appInternalActionGeneric = internalActionGeneric as ActionBuilder<
  DataModel,
  "internal"
>;

export function protectedInteractiveQuery<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveQueryBuilder(query, spec);
}

export function protectedInteractiveInternalQuery<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveQueryBuilder(internalQuery, spec);
}

export function protectedInteractiveQueryGeneric<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveQueryBuilder(appQueryGeneric, spec);
}

export function protectedInteractiveInternalQueryGeneric<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveQueryBuilder(appInternalQueryGeneric, spec);
}

export function protectedInteractiveMutation<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveMutationBuilder(mutation, spec);
}

export function protectedInteractiveInternalMutation<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveMutationBuilder(internalMutation, spec);
}

export function protectedInteractiveMutationGeneric<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveMutationBuilder(appMutationGeneric, spec);
}

export function protectedInteractiveInternalMutationGeneric<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveMutationBuilder(appInternalMutationGeneric, spec);
}

export function protectedInteractiveAction<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveActionBuilder(action, spec);
}

export function protectedInteractiveInternalAction<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveActionBuilder(internalAction, spec);
}

export function protectedInteractiveActionGeneric<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveActionBuilder(appActionGeneric, spec);
}

export function protectedInteractiveInternalActionGeneric<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(spec: CheckedSelectorSpec<Args, Checked>) {
  return interactiveActionBuilder(appInternalActionGeneric, spec);
}

export const publicReadQuery = customQuery(
  query,
  customCtxAndArgs({
    args: {},
    input: async () => ({ ctx: {}, args: {} }),
  }),
);

export const publicReadQueryGeneric = customQuery(
  appQueryGeneric,
  customCtxAndArgs({
    args: {},
    input: async () => ({ ctx: {}, args: {} }),
  }),
);

export const narrowSystemQuery = exemptQueryBuilder(
  query,
  "narrow_system_exemption",
);
export const narrowSystemInternalQuery = exemptQueryBuilder(
  internalQuery,
  "narrow_system_exemption",
);
export const narrowSystemQueryGeneric = exemptQueryBuilder(
  appQueryGeneric,
  "narrow_system_exemption",
);
export const narrowSystemInternalQueryGeneric = exemptQueryBuilder(
  appInternalQueryGeneric,
  "narrow_system_exemption",
);
export const narrowSystemMutation = exemptMutationBuilder(
  mutation,
  "narrow_system_exemption",
);
export const narrowSystemInternalMutation = exemptMutationBuilder(
  internalMutation,
  "narrow_system_exemption",
);
export const narrowSystemMutationGeneric = exemptMutationBuilder(
  appMutationGeneric,
  "narrow_system_exemption",
);
export const narrowSystemInternalMutationGeneric = exemptMutationBuilder(
  appInternalMutationGeneric,
  "narrow_system_exemption",
);
export const narrowSystemAction = exemptActionBuilder(
  action,
  "narrow_system_exemption",
);
export const narrowSystemInternalAction = exemptActionBuilder(
  internalAction,
  "narrow_system_exemption",
);
export const narrowSystemActionGeneric = exemptActionBuilder(
  appActionGeneric,
  "narrow_system_exemption",
);
export const narrowSystemInternalActionGeneric = exemptActionBuilder(
  appInternalActionGeneric,
  "narrow_system_exemption",
);

export const devOnlyInternalQuery = exemptQueryBuilder(
  internalQuery,
  "dev_only_exemption",
);
export const devOnlyInternalQueryGeneric = exemptQueryBuilder(
  appInternalQueryGeneric,
  "dev_only_exemption",
);
export const devOnlyInternalMutation = exemptMutationBuilder(
  internalMutation,
  "dev_only_exemption",
);
export const devOnlyInternalMutationGeneric = exemptMutationBuilder(
  appInternalMutationGeneric,
  "dev_only_exemption",
);
export const devOnlyInternalAction = exemptActionBuilder(
  internalAction,
  "dev_only_exemption",
);
export const devOnlyInternalActionGeneric = exemptActionBuilder(
  appInternalActionGeneric,
  "dev_only_exemption",
);

function interactiveQueryBuilder<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
  Visibility extends "public" | "internal",
>(
  builder: QueryBuilder<DataModel, Visibility>,
  spec: CheckedSelectorSpec<Args, Checked>,
) {
  return customQuery(
    builder,
    customCtxAndArgs<
      GenericQueryCtx<DataModel>,
      Args,
      InteractiveCtxPatch,
      Checked
    >({
      args: spec.args,
      input: async (ctx, args) => await interactiveAdmission(ctx, args, spec),
    }),
  );
}

function interactiveMutationBuilder<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
  Visibility extends "public" | "internal",
>(
  builder: MutationBuilder<DataModel, Visibility>,
  spec: CheckedSelectorSpec<Args, Checked>,
) {
  return customMutation(
    builder,
    customCtxAndArgs<
      GenericMutationCtx<DataModel>,
      Args,
      InteractiveCtxPatch,
      Checked
    >({
      args: spec.args,
      input: async (ctx, args) => await interactiveAdmission(ctx, args, spec),
    }),
  );
}

function interactiveActionBuilder<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
  Visibility extends "public" | "internal",
>(
  builder: ActionBuilder<DataModel, Visibility>,
  spec: CheckedSelectorSpec<Args, Checked>,
) {
  return customAction(
    builder,
    customCtxAndArgs<
      GenericActionCtx<DataModel>,
      Args,
      InteractiveCtxPatch,
      Checked
    >({
      args: spec.args,
      input: async (ctx, args) => await interactiveAdmission(ctx, args, spec),
    }),
  );
}

async function interactiveAdmission<
  Args extends PropertyValidators,
  Checked extends Readonly<Record<string, unknown>>,
>(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  args: ObjectType<Args>,
  spec: CheckedSelectorSpec<Args, Checked>,
): Promise<{ ctx: InteractiveCtxPatch; args: Checked }> {
  const actor = await resolveBusinessActor(ctx);
  if (actor.kind !== "authenticated_owner") {
    throw new AuthorityEntryDeniedError("authority_entry_interactive_required");
  }
  const authority = Object.freeze({
    mode: "protected_interactive_principal_account" as const,
    principalRef: actor.canonicalPrincipalRef,
    accountRef: actor.canonicalAccountRef,
    legacyOwnerId: actor.legacyOwnerId,
    legacyOwnerLocator: actor.clerkUserId,
    revision: Object.freeze({ ...actor.authorityRevision }),
    provenance: Object.freeze({ ...actor.authorityProvenance }),
  });
  const checked = await spec.check(Object.freeze({ ...args }), authority);
  return {
    ctx: Object.freeze({ authority }),
    args: Object.freeze({ ...checked }) as Checked,
  };
}

type ExemptionMode = "narrow_system_exemption" | "dev_only_exemption";
type ExemptionCtxPatch<Mode extends ExemptionMode> = Readonly<{
  // Classification is deliberately not authority. The migration inventory and
  // structural gate constrain these literal registrars while the registered
  // handler keeps its existing narrow-system or development-only admission.
  registrationClass: Readonly<{ mode: Mode }>;
}>;

function exemptQueryBuilder<
  Visibility extends "public" | "internal",
  Mode extends ExemptionMode,
>(builder: QueryBuilder<DataModel, Visibility>, mode: Mode) {
  return customQuery(
    builder,
    customCtxAndArgs<
      GenericQueryCtx<DataModel>,
      Record<string, never>,
      ExemptionCtxPatch<Mode>,
      Record<string, never>
    >({
      args: {},
      input: async () => ({
        ctx: Object.freeze({ registrationClass: Object.freeze({ mode }) }),
        args: {},
      }),
    }),
  );
}

function exemptMutationBuilder<
  Visibility extends "public" | "internal",
  Mode extends ExemptionMode,
>(builder: MutationBuilder<DataModel, Visibility>, mode: Mode) {
  return customMutation(
    builder,
    customCtxAndArgs<
      GenericMutationCtx<DataModel>,
      Record<string, never>,
      ExemptionCtxPatch<Mode>,
      Record<string, never>
    >({
      args: {},
      input: async () => ({
        ctx: Object.freeze({ registrationClass: Object.freeze({ mode }) }),
        args: {},
      }),
    }),
  );
}

function exemptActionBuilder<
  Visibility extends "public" | "internal",
  Mode extends ExemptionMode,
>(builder: ActionBuilder<DataModel, Visibility>, mode: Mode) {
  return customAction(
    builder,
    customCtxAndArgs<
      GenericActionCtx<DataModel>,
      Record<string, never>,
      ExemptionCtxPatch<Mode>,
      Record<string, never>
    >({
      args: {},
      input: async () => ({
        ctx: Object.freeze({ registrationClass: Object.freeze({ mode }) }),
        args: {},
      }),
    }),
  );
}
