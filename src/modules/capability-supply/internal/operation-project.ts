import {
  resolvePointedSchema,
  type JsonValue,
} from "@/modules/capability-contract/public";
import {
  formatExactAmount,
  rescaleExactAmount,
} from "@/modules/money/public";
import { isRecord } from "@/modules/common/is-record";
import {
  createPublicOperationRef,
  isPublicOperationRef,
  type PublicOperationRef,
} from "../public";
import { operationMarketNavigation } from "@/modules/registry/operation-entry";
import { OPERATION_INVOKE_ROUTE_CONTRACT } from "@/modules/capability-execution/operation-invoke-entry";
import { paymentLaneAdmission } from "./x402-invocation-policy";
import { projectPublicSchema } from "./operation-projection-wire";
import type {
  CapabilityOperationSourceRecord,
  PublicOperationAvailability,
  PublicOperationCatalogPrice,
  PublicOperationDescriptor,
  PublicOperationNavigationRelation,
  PublicOperationParameter,
  PublicOperationParameterMapping,
  PublicOperationPrice,
} from "./operation-projection-types";

const V1_PAYMENT_LANE_ADMISSION = paymentLaneAdmission({
  rail: "ae_internal",
  environment: "production",
});
if (
  V1_PAYMENT_LANE_ADMISSION.kind !== "admitted" ||
  V1_PAYMENT_LANE_ADMISSION.lane !== "brokered"
)
  throw new Error("v1_payment_lane_not_brokered");
const V1_PAYMENT_LANE = V1_PAYMENT_LANE_ADMISSION.lane;
const EXECUTE_NAVIGATION: PublicOperationNavigationRelation = {
  relation: "execute",
  method: "POST",
  actionId: "operation.execute",
  authentication: "none",
  surfaces: ["chat", "mcp"],
  precondition: "free_keyless_read_only",
};
const INVOKE_NAVIGATION: PublicOperationNavigationRelation = {
  relation: "invoke",
  pathTemplate: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  method: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method,
  actionId: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.actionId,
  authentication: "required",
  surfaces: ["http", "cli", "mcp"],
};
type OperationAccessMode = "anonymous_execute" | "authenticated_invoke" | "inspect_only";

export function operationNavigation(
  accessMode: OperationAccessMode,
): readonly PublicOperationNavigationRelation[] {
  return Object.freeze([
    operationMarketNavigation("search"),
    operationMarketNavigation("detail"),
    operationMarketNavigation("compare"),
    operationMarketNavigation("inspect_plan"),
    ...(accessMode === "anonymous_execute"
      ? [EXECUTE_NAVIGATION]
      : accessMode === "authenticated_invoke"
        ? [INVOKE_NAVIGATION]
        : []),
  ]);
}
export function noOperationNavigation(): readonly PublicOperationNavigationRelation[] {
  return Object.freeze([
    operationMarketNavigation("search"),
    operationMarketNavigation("detail"),
  ]);
}

export function normalizeRefs(
  values: readonly string[],
  max: number,
): PublicOperationRef[] | undefined {
  return values.length >= 1 &&
    values.length <= max &&
    new Set(values).size === values.length &&
    values.every(isPublicOperationRef)
    ? (values as PublicOperationRef[])
    : undefined;
}

export function projectCapabilityOperation(
  record: CapabilityOperationSourceRecord,
  now = Date.now(),
): PublicOperationDescriptor {
  const operationRef = createPublicOperationRef({
    operationId: record.operationId,
    publicationRef: record.publicationRef,
    publicationRevision: record.publicationRevision,
    contractRef: record.contract.ref,
  });
  const availability = projectAvailability(record, now);
  const inputJsonSchema = projectPublicSchema(record.contract.inputSchema);
  const parameters = projectParameters(
    inputJsonSchema,
    record.parameterMappings,
  );
  const catalogPrice = projectCatalogPrice(record.price);
  return {
    operationRef,
    operationId: record.operationId,
    callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    paymentLane: V1_PAYMENT_LANE,
    contract: {
      capabilityId: record.contract.ref.capabilityId,
      version: record.contract.ref.version,
      inputJsonSchema,
      outputJsonSchema: projectPublicSchema(record.contract.outputSchema),
      customerAnnotations: record.contract.customerAnnotations.map(
        (annotation) => ({
          annotationId: annotation.annotationId,
          document: annotation.document,
          pointer: annotation.pointer,
          label: annotation.label,
          role: annotation.role,
          ...(annotation.semanticIdentity === undefined
            ? {}
            : { semanticIdentity: annotation.semanticIdentity }),
          ...(annotation.inference === undefined
            ? {}
            : { inference: annotation.inference }),
        }),
      ),
      ...(record.contract.inputExamples === undefined
        ? {}
        : { inputExamples: record.contract.inputExamples }),
    },
    business: record.business,
    offering: record.offering,
    summary: record.contract.description,
    commercial: {
      price: record.price,
      ...(record.priceEvidence === undefined
        ? {}
        : { priceEvidence: record.priceEvidence }),
      ...(record.priceBreakdown === undefined
        ? {}
        : { priceBreakdown: record.priceBreakdown }),
      materialTerms: record.materialTerms,
      relationship: record.commercialRelationship,
    },
    dataUse: record.contract.dataUse.map((declaration) => ({
      effectId: declaration.effectId,
      inputPointer: declaration.inputPointer,
      classification: declaration.classification,
      phase: declaration.phase,
      recipient: declaration.recipient.kind,
      purposes: declaration.purposes,
    })),
    effects: record.contract.effects,
    evidence: record.contract.evidence,
    cancellation: record.cancellation,
    recovery: record.contract.lifecycle,
    authentication: record.authentication,
    transport: record.transport,
    provenance: record.provenance,
    availability,
    navigation:
      availability.posture === "unavailable"
        ? noOperationNavigation()
        : operationNavigation(
            availability.posture !== "routeable" ||
              record.authentication.kind === "unknown"
              ? "inspect_only"
              : record.answerExecutable &&
                  record.authentication.kind === "keyless" &&
                  record.provenance.sourceKind !== "x402"
                ? "anonymous_execute"
                : "authenticated_invoke",
          ),
    ...(parameters === undefined ? {} : { parameters }),
    ...(catalogPrice === undefined ? {} : { catalogPrice }),
  };
}

function projectParameters(
  schema: Readonly<Record<string, JsonValue>>,
  mappings: readonly PublicOperationParameterMapping[] | undefined,
): readonly PublicOperationParameter[] | undefined {
  const properties = schema.properties;
  if (!isRecord(properties)) return undefined;
  const requiredSet = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      if (typeof name === "string") requiredSet.add(name);
    }
  }
  const bindings = new Map(
    (mappings ?? []).map((binding) => [binding.inputPointer, binding]),
  );
  const seen = new Set<string>();
  const parameters: PublicOperationParameter[] = [];
  for (const [name, raw] of Object.entries(properties)) {
    const pointer = `/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`;
    const binding = bindings.get(pointer);
    const node = isRecord(raw) ? raw : {};
    parameters.push(
      publicParameterFromSchema(node, name, requiredSet.has(name), binding),
    );
    seen.add(pointer);
  }
  for (const binding of mappings ?? []) {
    if (seen.has(binding.inputPointer)) continue;
    const publicName = contractInputNameFromPointer(binding.inputPointer);
    if (publicName === undefined) continue;
    const node = resolvePointedSchema(schema, binding.inputPointer) ?? {};
    parameters.push(
      publicParameterFromSchema(
        node,
        publicName,
        binding.required ?? false,
        binding,
      ),
    );
  }
  return parameters.length === 0 ? undefined : parameters;
}

function contractInputNameFromPointer(
  inputPointer: string,
): string | undefined {
  if (!inputPointer.startsWith("/") || inputPointer.length < 2)
    return undefined;
  const token = inputPointer.slice(inputPointer.lastIndexOf("/") + 1);
  if (token.length === 0) return undefined;
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function publicParameterFromSchema(
  node: Readonly<Record<string, JsonValue>>,
  defaultName: string,
  defaultRequired: boolean,
  binding?: PublicOperationParameterMapping,
): PublicOperationParameter {
  const example =
    node.example ??
    (Array.isArray(node.examples) ? node.examples[0] : undefined);
  return {
    group: binding?.group ?? "body",
    name: defaultName,
    type: typeof node.type === "string" ? node.type : "any",
    ...(typeof node.description === "string"
      ? { description: node.description }
      : {}),
    ...(example !== undefined ? { example: example as JsonValue } : {}),
    ...(Array.isArray(node.enum)
      ? {
          enumValues: node.enum.filter(
            (value): value is string => typeof value === "string",
          ),
        }
      : {}),
    ...(node.default !== undefined
      ? { default: node.default as JsonValue }
      : {}),
    required: binding?.required ?? defaultRequired,
    ...(binding?.style === undefined ? {} : { style: binding.style }),
    ...(binding?.explode === undefined ? {} : { explode: binding.explode }),
  };
}

/**
 * Project the exact executable price into a decimal-string catalog price
 * (agentic.market `pricing{scheme}`). `fixed` -> exact amount; `range`
 * -> upto min/max; `on_request` has no derivable decimal amount -> absent.
 */
function projectCatalogPrice(
  price: PublicOperationPrice,
): PublicOperationCatalogPrice | undefined {
  if (price.kind === "fixed") {
    const amount = formatExactAmount(price.amount);
    return amount === undefined
      ? undefined
      : { scheme: "exact", amount, currency: price.amount.currency };
  }
  if (
    price.kind === "on_request" ||
    price.minimum.currency !== price.maximum.currency
  )
    return undefined;
  const commonExponent = Math.max(
    price.minimum.exponent,
    price.maximum.exponent,
  );
  const minimum = rescaleExactAmount(price.minimum, commonExponent);
  const maximum = rescaleExactAmount(price.maximum, commonExponent);
  if (minimum === undefined || maximum === undefined) return undefined;
  const minAmount = formatExactAmount(minimum);
  const maxAmount = formatExactAmount(maximum);
  return minAmount === undefined || maxAmount === undefined
    ? undefined
    : { scheme: "upto", minAmount, maxAmount, currency: minimum.currency };
}

function projectAvailability(
  record: CapabilityOperationSourceRecord,
  now: number,
): PublicOperationAvailability {
  const { observedAt, validUntil } = record.readiness;
  if (record.routeable && validUntil !== undefined && validUntil > now)
    return {
      posture: "routeable",
      ...(observedAt === undefined ? {} : { observedAt }),
      validUntil,
    };
  const reason =
    validUntil !== undefined && validUntil <= now
      ? ("readiness_expired" as const)
      : (record.unavailableReason ?? "setup_required");
  return {
    posture: record.integrated ? "integrated" : "unavailable",
    ...(observedAt === undefined ? {} : { observedAt }),
    ...(validUntil === undefined ? {} : { validUntil }),
    reason,
  };
}
