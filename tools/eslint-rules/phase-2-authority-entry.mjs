import { relative, sep } from "node:path";

const RAW_REGISTRARS = new Set([
  "query",
  "mutation",
  "action",
  "internalQuery",
  "internalMutation",
  "internalAction",
  "httpAction",
  "queryGeneric",
  "mutationGeneric",
  "actionGeneric",
  "internalQueryGeneric",
  "internalMutationGeneric",
  "internalActionGeneric",
  "httpActionGeneric",
]);

const DEFAULT_RAW_REGISTRAR_FILES = new Set([
  "convex/lib/authorityRegistrars.ts",
  "convex/chatAnonymous.ts",
  "convex/providerConsequenceHttp.ts",
  "convex/secretLifecycleHttp.ts",
]);

function portable(path) {
  return path.split(sep).join("/");
}

function projectFile(filename) {
  const path = portable(relative(process.cwd(), filename));
  return path.startsWith("../") ? portable(filename) : path;
}

function importedName(specifier) {
  if (specifier.type !== "ImportSpecifier") return undefined;
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : specifier.imported.value;
}

function propertyName(member) {
  if (member.computed) {
    return member.property.type === "Literal" &&
      typeof member.property.value === "string"
      ? member.property.value
      : undefined;
  }
  return member.property.type === "Identifier"
    ? member.property.name
    : undefined;
}

function unwrapExpression(expression) {
  let current = expression;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSTypeAssertion" ||
    current.type === "TSNonNullExpression" ||
    current.type === "ChainExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function memberPath(expression) {
  const current = unwrapExpression(expression);
  if (current.type === "Identifier") return [current.name];
  if (current.type !== "MemberExpression") return undefined;
  const object = memberPath(current.object);
  const property = propertyName(current);
  return object === undefined || property === undefined
    ? undefined
    : [...object, property];
}

function containsAuthorityBinding(expression, bindings) {
  const current = unwrapExpression(expression);
  if (current.type === "Identifier") return bindings.has(current.name);
  if (current.type === "ConditionalExpression") {
    return (
      containsAuthorityBinding(current.consequent, bindings) ||
      containsAuthorityBinding(current.alternate, bindings)
    );
  }
  if (current.type === "LogicalExpression") {
    return (
      containsAuthorityBinding(current.left, bindings) ||
      containsAuthorityBinding(current.right, bindings)
    );
  }
  return false;
}

function unsupportedCapabilityAlias(expression, ctxName) {
  const current = unwrapExpression(expression);
  if (current.type === "Identifier") {
    return current.name === "fetch" ? "network_fetch" : undefined;
  }
  const path = memberPath(current);
  if (path?.[0] === "globalThis" && path[1] === "fetch") {
    return "network_fetch";
  }
  if (path?.[0] !== ctxName || path.length !== 2) return undefined;
  if (path[1] === "db") return "db";
  if (path[1] === "scheduler") return "scheduler";
  if (
    path[1] === "runQuery" ||
    path[1] === "runMutation" ||
    path[1] === "runAction"
  ) {
    return path[1];
  }
  return undefined;
}

function registeredTarget(expression, apiRoots) {
  if (expression === undefined || expression.type === "SpreadElement") {
    return undefined;
  }
  const current = unwrapExpression(expression);
  if (
    current.type === "CallExpression" &&
    current.callee.type === "Identifier" &&
    current.callee.name === "makeFunctionReference"
  ) {
    const ref = current.arguments[0];
    if (ref?.type !== "Literal" || typeof ref.value !== "string") {
      return undefined;
    }
    const separator = ref.value.lastIndexOf(":");
    return separator < 1
      ? undefined
      : `convex/${ref.value.slice(0, separator)}.ts:${ref.value.slice(separator + 1)}`;
  }
  const path = memberPath(current);
  if (path === undefined || path.length < 3) return undefined;
  const root = apiRoots.get(path[0]);
  if (root === undefined) return undefined;
  return `convex/${path.slice(1, -1).join("/")}.ts:${path.at(-1)}`;
}

function ctxCapability(call, ctxName) {
  if (call.callee.type === "Identifier" && call.callee.name === "fetch") {
    return "network_fetch";
  }
  const globalPath = memberPath(call.callee);
  if (globalPath?.[0] === "globalThis" && globalPath[1] === "fetch") {
    return "network_fetch";
  }
  if (call.callee.type !== "MemberExpression") return undefined;
  const direct = call.callee;
  if (direct.object.type === "Identifier" && direct.object.name === ctxName) {
    const directName = propertyName(direct);
    if (
      directName === "runQuery" ||
      directName === "runMutation" ||
      directName === "runAction"
    ) {
      return directName;
    }
  }
  if (
    direct.object.type !== "MemberExpression" ||
    direct.object.object.type !== "Identifier" ||
    direct.object.object.name !== ctxName
  ) {
    return undefined;
  }
  const namespace = propertyName(direct.object);
  const operation = propertyName(direct);
  if (namespace === "scheduler") return "scheduler";
  if (namespace !== "db" || operation === undefined) return undefined;
  if (
    operation === "get" ||
    operation === "query" ||
    operation === "normalizeId"
  ) {
    return "db_read";
  }
  if (
    operation === "insert" ||
    operation === "patch" ||
    operation === "replace" ||
    operation === "delete"
  ) {
    return "db_write";
  }
  return "db_unknown";
}

function isContextArgument(argument, ctxName) {
  if (argument.type === "Identifier") return argument.name === ctxName;
  if (argument.type !== "MemberExpression") return false;
  let object = argument.object;
  while (object.type === "MemberExpression") object = object.object;
  return object.type === "Identifier" && object.name === ctxName;
}

function exportedRegistrationId(sourceCode, node, filename) {
  const declarator = sourceCode
    .getAncestors(node)
    .findLast((ancestor) => ancestor.type === "VariableDeclarator");
  return declarator?.id.type === "Identifier"
    ? `${filename}:${declarator.id.name}`
    : undefined;
}

function handlerFunction(registration) {
  const config = registration.arguments[0];
  if (config?.type !== "ObjectExpression") return undefined;
  const handler = config.properties.find(
    (property) =>
      property.type === "Property" &&
      !property.computed &&
      ((property.key.type === "Identifier" &&
        property.key.name === "handler") ||
        (property.key.type === "Literal" && property.key.value === "handler")),
  );
  if (handler?.type !== "Property") return undefined;
  return handler.value.type === "ArrowFunctionExpression" ||
    handler.value.type === "FunctionExpression"
    ? handler.value
    : undefined;
}

function returnedRegistrarCall(functionNode) {
  if (functionNode.body.type !== "BlockStatement") {
    return functionNode.body.type === "CallExpression"
      ? functionNode.body
      : undefined;
  }
  if (functionNode.body.body.length !== 1) return undefined;
  const statement = functionNode.body.body[0];
  return statement?.type === "ReturnStatement" &&
    statement.argument?.type === "CallExpression"
    ? statement.argument
    : undefined;
}

export const phase2AuthorityEntryRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require literal Phase 2 authority registrars and enforce their structural capability contracts.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          allowedRawRegistrarFiles: {
            type: "array",
            items: { type: "string" },
            uniqueItems: true,
          },
          capabilityContracts: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
          },
          targetContracts: {
            type: "object",
            additionalProperties: {
              type: "array",
              items: { type: "string" },
              uniqueItems: true,
            },
          },
        },
      },
    ],
    messages: {
      dynamicRegistrarNamespace:
        "Authority registrar namespaces permit dynamic mode selection; import one literal registrar instead.",
      rawRegistrar:
        "Raw Convex registrar '{{registrar}}' bypasses the Phase 2 authority-entry seam on code path {{codePath}}.",
      unlistedCapability:
        "Registration '{{registration}}' uses unlisted handler capability '{{capability}}'.",
      escapedContext:
        "Registration '{{registration}}' passes its generic Convex context or capability to an uninspected helper.",
      unsupportedHandlerShape:
        "Registration '{{registration}}' must use an inline function handler so its capability contract can be inspected.",
      dynamicRegistrarSelection:
        "Authority registrar categories must be selected by a literal import, not a local alias, cast, conditional, or logical expression.",
      dynamicCapabilityTarget:
        "Registration '{{registration}}' uses {{capability}} with a target that is not a statically registered FunctionReference.",
      unlistedCapabilityTarget:
        "Registration '{{registration}}' uses {{capability}} target '{{target}}' outside its target contract.",
      unsupportedCapabilityAlias:
        "Registration '{{registration}}' aliases raw capability '{{capability}}'; use only a direct supported context capability expression.",
      unsupportedNetworkCall:
        "Registration '{{registration}}' uses an unsupported global network call; use only the declared direct network expression.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const filename = projectFile(context.filename);
    const options = context.options[0] ?? {};
    const allowedRawFiles = new Set([
      ...DEFAULT_RAW_REGISTRAR_FILES,
      ...(options.allowedRawRegistrarFiles ?? []),
    ]);
    const capabilityContracts = options.capabilityContracts ?? {};
    const targetContracts = options.targetContracts ?? {};
    const rawBindings = new Map();
    const protectedBindings = new Set();
    const authorityBindings = new Set();
    const protectedFactories = new Set();
    const authorityNamespaces = new Set();
    const apiRoots = new Map();
    const protectedHandlers = new WeakMap();
    const handlerStack = [];
    const codePathStack = [];

    return {
      onCodePathStart(codePath) {
        codePathStack.push(codePath.id);
      },
      onCodePathEnd() {
        codePathStack.pop();
      },
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          source === "convex/server" ||
          /(?:^|\/)convex\/_generated\/server$/u.test(source) ||
          /(?:^|\/)_generated\/server$/u.test(source)
        ) {
          for (const specifier of node.specifiers) {
            const imported = importedName(specifier);
            if (imported !== undefined && RAW_REGISTRARS.has(imported)) {
              rawBindings.set(specifier.local.name, imported);
            }
          }
        }
        if (/(?:^|\/)_generated\/api$/u.test(source)) {
          for (const specifier of node.specifiers) {
            const imported = importedName(specifier);
            if (imported === "api" || imported === "internal") {
              apiRoots.set(specifier.local.name, imported);
            }
          }
        }
        if (!/(?:^|\/)convex\/lib\/authorityRegistrars$/u.test(source)) {
          return;
        }
        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportNamespaceSpecifier") {
            authorityNamespaces.add(specifier.local.name);
            context.report({
              node: specifier,
              messageId: "dynamicRegistrarNamespace",
            });
            continue;
          }
          const imported = importedName(specifier);
          if (imported !== undefined)
            authorityBindings.add(specifier.local.name);
          if (imported?.startsWith("protected") === true) {
            protectedBindings.add(specifier.local.name);
          }
        }
      },
      VariableDeclarator(node) {
        if (node.id.type === "Identifier" && node.init !== null) {
          const current = unwrapExpression(node.init);
          if (
            current.type !== "ArrowFunctionExpression" &&
            current.type !== "FunctionExpression" &&
            containsAuthorityBinding(node.init, authorityBindings)
          ) {
            context.report({
              node: node.init,
              messageId: "dynamicRegistrarSelection",
            });
          }
        }
        if (
          node.id.type === "Identifier" &&
          (node.init?.type === "ArrowFunctionExpression" ||
            node.init?.type === "FunctionExpression")
        ) {
          const returned = returnedRegistrarCall(node.init);
          if (
            returned?.callee.type === "Identifier" &&
            protectedBindings.has(returned.callee.name)
          ) {
            protectedFactories.add(node.id.name);
          }
        }
        const active = handlerStack.at(-1);
        if (
          active === undefined ||
          node.id.type !== "Identifier" ||
          node.init === null
        ) {
          return;
        }
        const ctx = active.node.params[0];
        const alias = unsupportedCapabilityAlias(
          node.init,
          ctx?.type === "Identifier" ? ctx.name : "",
        );
        if (alias !== undefined) {
          context.report({
            node: node.init,
            messageId: "unsupportedCapabilityAlias",
            data: { capability: alias, registration: active.registration },
          });
        }
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier") {
          const registrar = rawBindings.get(node.callee.name);
          if (registrar !== undefined && !allowedRawFiles.has(filename)) {
            context.report({
              node: node.callee,
              messageId: "rawRegistrar",
              data: {
                registrar,
                codePath: codePathStack.at(-1) ?? "unknown",
              },
            });
          }
        }
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          authorityNamespaces.has(node.callee.object.name)
        ) {
          return;
        }
        if (
          node.callee.type === "CallExpression" &&
          node.callee.callee.type === "Identifier" &&
          (protectedBindings.has(node.callee.callee.name) ||
            protectedFactories.has(node.callee.callee.name))
        ) {
          const handler = handlerFunction(node);
          const registration = exportedRegistrationId(
            sourceCode,
            node,
            filename,
          );
          if (handler === undefined && registration !== undefined) {
            context.report({
              node,
              messageId: "unsupportedHandlerShape",
              data: { registration },
            });
          } else if (handler !== undefined && registration !== undefined) {
            protectedHandlers.set(handler, {
              allowed: new Set(capabilityContracts[registration] ?? []),
              registration,
              targets: new Set(targetContracts[registration] ?? []),
            });
          }
        }
        const active = handlerStack.at(-1);
        if (active === undefined) return;
        const calleePath = memberPath(node.callee);
        if (calleePath?.[0] === "globalThis" && calleePath[1] === "fetch") {
          context.report({
            node,
            messageId: "unsupportedNetworkCall",
            data: { registration: active.registration },
          });
          return;
        }
        const functionNode = handlerStack.at(-1)?.node;
        const ctx = functionNode?.params[0];
        if (ctx?.type !== "Identifier") return;
        const capability = ctxCapability(node, ctx.name);
        if (
          capability === undefined &&
          node.arguments.some(
            (argument) =>
              argument.type !== "SpreadElement" &&
              isContextArgument(argument, ctx.name),
          )
        ) {
          context.report({
            node,
            messageId: "escapedContext",
            data: { registration: active.registration },
          });
          return;
        }
        if (capability !== undefined && !active.allowed.has(capability)) {
          context.report({
            node,
            messageId: "unlistedCapability",
            data: { capability, registration: active.registration },
          });
          return;
        }
        if (
          capability === "runQuery" ||
          capability === "runMutation" ||
          capability === "runAction" ||
          capability === "scheduler"
        ) {
          const targetIndex = capability === "scheduler" ? 1 : 0;
          const target = registeredTarget(
            node.arguments[targetIndex],
            apiRoots,
          );
          if (target === undefined) {
            context.report({
              node,
              messageId: "dynamicCapabilityTarget",
              data: { capability, registration: active.registration },
            });
            return;
          }
          if (!active.targets.has(target)) {
            context.report({
              node,
              messageId: "unlistedCapabilityTarget",
              data: { capability, registration: active.registration, target },
            });
          }
        }
      },
      ":function"(node) {
        const details = protectedHandlers.get(node);
        if (details !== undefined) {
          handlerStack.push({ ...details, node });
        }
      },
      ":function:exit"(node) {
        if (protectedHandlers.has(node)) handlerStack.pop();
      },
    };
  },
};

export default phase2AuthorityEntryRule;
