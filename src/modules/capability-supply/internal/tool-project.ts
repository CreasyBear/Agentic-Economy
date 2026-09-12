import {
  resolvePointedSchema,
  type JsonValue,
} from "@/modules/capability-contract/public";
import {
  formatExactAmount,
  rescaleExactAmount,
} from "@/modules/money/public";
import { isRecord } from "@/modules/common/is-record";
import { sanitizeText } from "@/modules/common/sanitize-text";
import {
  createPublicToolRef,
  isPublicToolRef,
  type PublicToolRef,
} from "../public";
import { availability as deriveAvailability } from "./availability";
import { listingTier } from "./publication/provenance";
import { paymentLaneAdmission } from "./x402-call-policy";
import { projectPublicSchema } from "./tool-projection-wire";
import { CURRENT_TOOL_CALL_VIA } from "./tool-projection-types";
import type {
  CapabilityToolSourceRecord,
  ToolProjectionNavigationContract,
  PublicToolAvailability,
  PublicToolCatalogPrice,
  PublicToolDescriptor,
  PublicToolNavigationRelation,
  PublicToolParameter,
  PublicToolParameterMapping,
  PublicToolPrice,
} from "./tool-projection-types";

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
type ToolAccessMode = "authenticated_call" | "read_only";

export function toolNavigation(
  accessMode: ToolAccessMode,
  navigation: ToolProjectionNavigationContract,
): readonly PublicToolNavigationRelation[] {
  if (navigation.call.pathTemplate !== CURRENT_TOOL_CALL_VIA) {
    throw new Error("tool_projection_call_via_mismatch");
  }
  return Object.freeze([
    navigation.market.list,
    navigation.market.search,
    navigation.market.describe,
    navigation.market.compare,
    ...(accessMode === "authenticated_call" ? [navigation.call] : []),
  ]);
}
export function noToolNavigation(
  navigation: ToolProjectionNavigationContract,
): readonly PublicToolNavigationRelation[] {
  return Object.freeze([navigation.market.list, navigation.market.search]);
}

export function normalizeRefs(
  values: readonly string[],
  max: number,
): PublicToolRef[] | undefined {
  return values.length >= 1 &&
    values.length <= max &&
    new Set(values).size === values.length &&
    values.every(isPublicToolRef)
    ? (values as PublicToolRef[])
    : undefined;
}

export function projectCapabilityTool(
  record: CapabilityToolSourceRecord,
  now: number,
  navigation: ToolProjectionNavigationContract,
): PublicToolDescriptor {
  const toolRef = createPublicToolRef({
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
    toolRef,
    toolId: record.operationId,
    callVia: CURRENT_TOOL_CALL_VIA,
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
    listing: {
      ...record.listing,
      label: sanitizeText(record.listing.label, 160),
      summary: sanitizeText(record.listing.summary, 1_000),
    },
    summary: sanitizeText(record.contract.description, 1_000),
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
    ...(record.payment === undefined ? {} : { payment: record.payment }),
    transport: record.transport,
    provenance: record.provenance,
    listingTier: listingTier(record.provenance.publisher),
    ...(record.canonical === undefined ? {} : { canonical: record.canonical }),
    availability,
    navigation:
      availability.posture === "unavailable"
        ? noToolNavigation(navigation)
        : toolNavigation(
            availability.posture !== "routeable" ||
              record.authentication.kind === "unknown"
              ? "read_only"
              : "authenticated_call",
            navigation,
          ),
    ...(parameters === undefined ? {} : { parameters }),
    ...(catalogPrice === undefined ? {} : { catalogPrice }),
  };
}

export function projectCapabilityToolParameters(
  record: CapabilityToolSourceRecord,
): readonly PublicToolParameter[] | undefined {
  return projectParameters(
    projectPublicSchema(record.contract.inputSchema),
    record.parameterMappings,
  );
}

export function projectCapabilityToolCatalogPrice(
  record: CapabilityToolSourceRecord,
): PublicToolCatalogPrice | undefined {
  return projectCatalogPrice(record.price);
}

function projectParameters(
  schema: Readonly<Record<string, JsonValue>>,
  mappings: readonly PublicToolParameterMapping[] | undefined,
): readonly PublicToolParameter[] | undefined {
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
  const parameters: PublicToolParameter[] = [];
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
  binding?: PublicToolParameterMapping,
): PublicToolParameter {
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
 * (catalogue `pricing{scheme}`). `fixed` -> exact amount; `range`
 * -> upto min/max; `on_request` has no derivable decimal amount -> absent.
 */
function projectCatalogPrice(
  price: PublicToolPrice,
): PublicToolCatalogPrice | undefined {
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
  record: CapabilityToolSourceRecord,
  now: number,
): PublicToolAvailability {
  return deriveAvailability(
    {
      routeable: record.routeable,
      integrated: record.integrated,
      readiness: record.readiness,
      ...(record.unavailableReason === undefined
        ? {}
        : { unavailableReason: record.unavailableReason }),
    },
    now,
  );
}
