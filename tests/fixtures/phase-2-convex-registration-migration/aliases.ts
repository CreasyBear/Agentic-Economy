import { internalAction, query as importedQuery } from "./_generated/server";
import { mutationGeneric } from "convex/server";

const localMutation = mutationGeneric;

const preserveRegistrar = <Registrar>(registrar: Registrar): Registrar =>
  registrar;
const factoryInternalAction = preserveRegistrar(internalAction);

export const fromImportedAlias = importedQuery({
  args: {},
  handler: async () => null,
});

export const fromLocalAlias = localMutation({
  args: {},
  handler: async () => null,
});

export const fromRegistrarFactory = factoryInternalAction({
  args: {},
  handler: async () => null,
});
