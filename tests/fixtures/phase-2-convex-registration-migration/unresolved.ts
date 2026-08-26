import type {
  GenericDataModel,
  QueryBuilder,
  RegisteredQuery,
} from "convex/server";

declare function loadRegistrarFromUnknownRuntime(): QueryBuilder<
  GenericDataModel,
  "public"
>;

const unresolvedRegistrar = loadRegistrarFromUnknownRuntime();

export const unresolvedRegistration = unresolvedRegistrar({
  args: {},
  handler: async () => null,
});

export const castSpoof = {} as RegisteredQuery<
  "public",
  Record<string, never>,
  null
>;
