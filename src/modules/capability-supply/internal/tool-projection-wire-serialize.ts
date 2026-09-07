import type {
  CapabilityInputExample,
  JsonValue,
} from "@/modules/capability-contract/public";
import { exactAmountSchema } from "@/modules/money/public";
import { isRecord } from "@/modules/common/is-record";
import type {
  ToolCompareResult,
  ToolComparisonFact,
  ToolComparisonValue,
  ToolDetailResult,
  ToolSearchFilters,
  ToolSearchResult,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicToolAvailability,
  PublicToolDescriptor,
  PublicToolNavigationRelation,
  PublicToolParameter,
  PublicToolPrice,
  PublicToolPriceEvidence,
  PublicRecoveryPolicy,
} from "../tool-projection";
import type {
  DeepWritable,
  ToolCompareWireResult,
  ToolDetailWireResult,
  ToolSearchWireFilters,
  ToolSearchWireResult,
  ToolSurfaceWireDescriptor,
  ToolSurfaceWireNavigation,
} from "./tool-projection-wire-types";

export function serializeToolDescriptor(
  tool: PublicToolDescriptor,
): ToolSurfaceWireDescriptor {
  return {
    toolRef: tool.toolRef,
    operationId: tool.operationId,
    callVia: tool.callVia,
    paymentLane: tool.paymentLane,
    contract: {
      capabilityId: tool.contract.capabilityId,
      version: tool.contract.version,
      inputJsonSchema: JSON.stringify(tool.contract.inputJsonSchema),
      outputJsonSchema: JSON.stringify(tool.contract.outputJsonSchema),
      customerAnnotations: tool.contract.customerAnnotations.map(
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
      ...(tool.contract.inputExamples === undefined
        ? {}
        : {
            inputExamples: serializeInputExamples(
              tool.contract.inputExamples,
            ),
          }),
    },
    business: {
      businessId: tool.business.businessId,
      slug: tool.business.slug,
      name: tool.business.name,
    },
    offering: {
      offeringRef: tool.offering.offeringRef,
      revision: tool.offering.revision,
      label: tool.offering.label,
      summary: tool.offering.summary,
    },
    summary: tool.summary,
    commercial: {
      price: serializePrice(tool.commercial.price),
      ...(tool.commercial.priceEvidence === undefined
        ? {}
        : {
            priceEvidence: serializePriceEvidence(
              tool.commercial.priceEvidence,
            ),
          }),
      ...(tool.commercial.priceBreakdown === undefined
        ? {}
        : {
            priceBreakdown: {
              providerQuotedAmount: {
                ...tool.commercial.priceBreakdown.providerQuotedAmount,
              },
              agenticEconomyFee: {
                ...tool.commercial.priceBreakdown.agenticEconomyFee,
              },
              totalBuyerAuthorization: {
                ...tool.commercial.priceBreakdown.totalBuyerAuthorization,
              },
              network: tool.commercial.priceBreakdown.network,
              asset: tool.commercial.priceBreakdown.asset,
            },
          }),
      materialTerms: tool.commercial.materialTerms.map((term) => ({
        label: term.label,
        value: term.value,
      })),
      relationship: {
        kind: tool.commercial.relationship.kind,
        summary: tool.commercial.relationship.summary,
      },
    },
    dataUse: tool.dataUse.map(serializeDataUse),
    effects: tool.effects.map(serializeEffect),
    evidence: tool.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      outputPointer: evidence.outputPointer,
      purpose: evidence.purpose,
    })),
    cancellation: { kind: tool.cancellation.kind },
    recovery: {
      idempotency: tool.recovery.idempotency,
      recovery: tool.recovery.recovery,
    },
    authentication: tool.authentication,
    ...(tool.payment === undefined ? {} : { payment: { ...tool.payment } }),
    transport: tool.transport,
    provenance: {
      publisher: tool.provenance.publisher,
      sourceKind: tool.provenance.sourceKind,
    },
    availability: serializeAvailability(tool.availability),
    navigation: serializeNavigation(tool.navigation),
    ...(tool.parameters === undefined
      ? {}
      : { parameters: tool.parameters.map(serializeParameter) }),
    ...(tool.catalogPrice === undefined
      ? {}
      : {
          catalogPrice: {
            scheme: tool.catalogPrice.scheme,
            ...(tool.catalogPrice.amount === undefined
              ? {}
              : { amount: tool.catalogPrice.amount }),
            ...(tool.catalogPrice.minAmount === undefined
              ? {}
              : { minAmount: tool.catalogPrice.minAmount }),
            ...(tool.catalogPrice.maxAmount === undefined
              ? {}
              : { maxAmount: tool.catalogPrice.maxAmount }),
            currency: tool.catalogPrice.currency,
          },
        }),
  };
}
function serializeInputExamples(
  examples: readonly CapabilityInputExample[],
): DeepWritable<CapabilityInputExample[]> {
  return examples.map((example) => ({
    ...(example.label === undefined ? {} : { label: example.label }),
    input: serializeJsonRecord(example.input),
  }));
}
function serializeJsonRecord(
  value: Readonly<Record<string, JsonValue>>,
): DeepWritable<Record<string, JsonValue>> {
  const result: DeepWritable<Record<string, JsonValue>> = {};
  for (const [key, item] of Object.entries(value))
    result[key] = serializeJsonValue(item);
  return result;
}
function serializeParameter(
  parameter: PublicToolParameter,
): DeepWritable<PublicToolParameter> {
  return {
    group: parameter.group,
    name: parameter.name,
    type: parameter.type,
    ...(parameter.description === undefined
      ? {}
      : { description: parameter.description }),
    ...(parameter.example === undefined
      ? {}
      : { example: serializeJsonValue(parameter.example) }),
    ...(parameter.enumValues === undefined
      ? {}
      : { enumValues: [...parameter.enumValues] }),
    ...(parameter.default === undefined
      ? {}
      : { default: serializeJsonValue(parameter.default) }),
    required: parameter.required,
    ...(parameter.style === undefined ? {} : { style: parameter.style }),
    ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
  };
}
function serializePriceEvidence(
  evidence: PublicToolPriceEvidence,
): DeepWritable<PublicToolPriceEvidence> {
  return {
    priceDigest: evidence.priceDigest,
    ...(evidence.sourceRef === undefined
      ? {}
      : { sourceRef: evidence.sourceRef }),
    evidenceRefs: [...evidence.evidenceRefs],
    ...(evidence.observedAt === undefined
      ? {}
      : { observedAt: evidence.observedAt }),
    ...(evidence.validUntil === undefined
      ? {}
      : { validUntil: evidence.validUntil }),
  };
}

/** Deep-clone a contained JsonValue into its mutable wire form (readonly→mutable). */
function serializeJsonValue(value: JsonValue): DeepWritable<JsonValue> {
  return JSON.parse(JSON.stringify(value)) as DeepWritable<JsonValue>;
}

export function serializeToolSearchResult(
  result: ToolSearchResult,
): ToolSearchWireResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      query: result.query,
      items: result.items.map(serializeToolDescriptor),
      matchedCount: result.matchedCount,
      ranking: result.ranking.map((entry) => ({
        toolRef: entry.toolRef,
        rank: entry.rank,
        score: entry.score,
      })),
      pagination: {
        limit: result.pagination.limit,
        hasMore: result.pagination.hasMore,
        ...(result.pagination.nextCursor === undefined
          ? {}
          : { nextCursor: result.pagination.nextCursor }),
      },
      navigation: serializeNavigation(result.navigation),
    };
  }
  if (result.kind === "no_candidates") {
    return {
      kind: "no_candidates",
      schemaVersion: result.schemaVersion,
      query: result.query,
      appliedFilters: serializeSearchFilters(result.appliedFilters),
      matchedCount: result.matchedCount,
      ranking: result.ranking.map((entry) => ({
        toolRef: entry.toolRef,
        rank: entry.rank,
        score: entry.score,
      })),
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: serializeNavigation(result.navigation),
  };
}

export function serializeToolDetailResult(
  result: ToolDetailResult,
): ToolDetailWireResult {
  if (result.kind === "found") {
    return {
      kind: "found",
      schemaVersion: result.schemaVersion,
      tool: serializeToolDescriptor(result.tool),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      toolRef: result.toolRef,
      reason: result.reason,
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "not_found",
    schemaVersion: result.schemaVersion,
    toolRef: result.toolRef,
    navigation: serializeNavigation(result.navigation),
  };
}

export function serializeToolCompareResult(
  result: ToolCompareResult,
): ToolCompareWireResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      tools: result.tools.map(serializeToolDescriptor),
      facts: result.facts.map((fact) => ({
        field: fact.field,
        values: fact.values.map((value) => ({
          toolRef: value.toolRef,
          value: serializeComparisonValue(value.value, fact.field),
          source: value.source,
          ...(value.observedAt === undefined
            ? {}
            : { observedAt: value.observedAt }),
          ...(value.validUntil === undefined
            ? {}
            : { validUntil: value.validUntil }),
          ...(value.lastHealthyAt === undefined
            ? {}
            : { lastHealthyAt: value.lastHealthyAt }),
        })),
      })),
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: serializeNavigation(result.navigation),
  };
}

function serializePrice(
  price: PublicToolPrice,
): DeepWritable<PublicToolPrice> {
  if (price.kind === "fixed")
    return { kind: "fixed", amount: { ...price.amount } };
  if (price.kind === "range")
    return {
      kind: "range",
      minimum: { ...price.minimum },
      maximum: { ...price.maximum },
    };
  return { kind: "on_request" };
}

function serializeDataUse(
  dataUse: PublicDataUsePolicy[number],
): DeepWritable<PublicDataUsePolicy[number]> {
  return {
    effectId: dataUse.effectId,
    inputPointer: dataUse.inputPointer,
    classification: dataUse.classification,
    phase: dataUse.phase,
    recipient: dataUse.recipient,
    purposes: [...dataUse.purposes],
  };
}

function serializeEffect(
  effect: PublicEffectPolicy[number],
): DeepWritable<PublicEffectPolicy[number]> {
  return {
    effectId: effect.effectId,
    class: effect.class,
    authority: effect.authority,
    reversibility: effect.reversibility,
  };
}

function serializeAvailability(
  availability: PublicToolAvailability,
): DeepWritable<PublicToolAvailability> {
  return {
    posture: availability.posture,
    ...(availability.observedAt === undefined
      ? {}
      : { observedAt: availability.observedAt }),
    ...(availability.validUntil === undefined
      ? {}
      : { validUntil: availability.validUntil }),
    ...(availability.lastHealthyAt === undefined
      ? {}
      : { lastHealthyAt: availability.lastHealthyAt }),
    ...(availability.reason === undefined
      ? {}
      : { reason: availability.reason }),
  };
}

function serializeNavigation(
  navigation: readonly PublicToolNavigationRelation[],
): ToolSurfaceWireNavigation[] {
  return navigation.map((relation) => ({
    relation: relation.relation,
    ...(relation.pathTemplate === undefined
      ? {}
      : { pathTemplate: relation.pathTemplate }),
    method: relation.method,
    actionId: relation.actionId,
    authentication: relation.authentication,
    ...(relation.inputSchema === undefined
      ? {}
      : { inputSchema: JSON.stringify(relation.inputSchema) }),
    ...(relation.surfaces === undefined
      ? {}
      : { surfaces: [...relation.surfaces] }),
    ...(relation.precondition === undefined
      ? {}
      : { precondition: relation.precondition }),
  }));
}

function serializeSearchFilters(
  filters: ToolSearchFilters,
): ToolSearchWireFilters {
  return {
    ...(filters.networkId === undefined
      ? {}
      : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: [...filters.effects] }),
    ...(filters.dataUse === undefined ? {} : { dataUse: [...filters.dataUse] }),
    ...(filters.availability === undefined
      ? {}
      : { availability: [...filters.availability] }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined
      ? {}
      : { maximumPrice: { ...filters.maximumPrice } }),
  };
}

function serializeComparisonValue(
  value: ToolComparisonValue,
  field: ToolComparisonFact["field"],
): DeepWritable<ToolComparisonValue> {
  if (field === "summary") {
    if (typeof value !== "string")
      throw new Error("tool_comparison_value_invalid");
    return value;
  }
  if (field === "price") {
    if (!isPublicToolPrice(value))
      throw new Error("tool_comparison_value_invalid");
    return serializePrice(value);
  }
  if (field === "effects") {
    if (!isPublicEffectPolicy(value))
      throw new Error("tool_comparison_value_invalid");
    return value.map(serializeEffect);
  }
  if (field === "dataUse") {
    if (!isPublicDataUsePolicy(value))
      throw new Error("tool_comparison_value_invalid");
    return value.map(serializeDataUse);
  }
  if (field === "availability") {
    if (!isPublicAvailability(value))
      throw new Error("tool_comparison_value_invalid");
    return serializeAvailability(value);
  }
  if (field === "provenance") {
    if (!isPublicProvenance(value))
      throw new Error("tool_comparison_value_invalid");
    return { publisher: value.publisher, sourceKind: value.sourceKind };
  }
  if (!isPublicRecoveryPolicy(value))
    throw new Error("tool_comparison_value_invalid");
  return { idempotency: value.idempotency, recovery: value.recovery };
}

function isPublicToolPrice(value: unknown): value is PublicToolPrice {
  if (!isRecord(value) || typeof value.kind !== "string") return false;
  if (value.kind === "on_request") return true;
  if (value.kind === "fixed")
    return exactAmountSchema.safeParse(value.amount).success;
  return (
    value.kind === "range" &&
    exactAmountSchema.safeParse(value.minimum).success &&
    exactAmountSchema.safeParse(value.maximum).success
  );
}

function isPublicEffectPolicy(value: unknown): value is PublicEffectPolicy {
  return (
    Array.isArray(value) &&
    value.every(
      (item: unknown) =>
        isRecord(item) &&
        typeof item.effectId === "string" &&
        (item.class === "data_release" ||
          item.class === "financial_exposure" ||
          item.class === "external_state_change") &&
        (item.authority === "none" ||
          item.authority === "explicit" ||
          item.authority === "mandate_or_explicit") &&
        (item.reversibility === "not_applicable" ||
          item.reversibility === "reversible" ||
          item.reversibility === "conditional" ||
          item.reversibility === "irreversible"),
    )
  );
}

function isPublicDataUsePolicy(value: unknown): value is PublicDataUsePolicy {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => {
      if (
        !isRecord(item) ||
        typeof item.effectId !== "string" ||
        typeof item.inputPointer !== "string" ||
        (item.classification !== "public" &&
          item.classification !== "personal" &&
          item.classification !== "sensitive" &&
          item.classification !== "credential") ||
        (item.phase !== "preparation" && item.phase !== "execution") ||
        (item.recipient !== "candidate_binding" &&
          item.recipient !== "selected_binding" &&
          item.recipient !== "named_recipient") ||
        !Array.isArray(item.purposes) ||
        !item.purposes.every((purpose: unknown) => typeof purpose === "string")
      ) {
        return false;
      }
      return true;
    })
  );
}

function isPublicAvailability(
  value: unknown,
): value is PublicToolAvailability {
  if (
    !isRecord(value) ||
    (value.posture !== "setup_required" &&
      value.posture !== "routeable" &&
      value.posture !== "unavailable")
  )
    return false;
  if (value.observedAt !== undefined && typeof value.observedAt !== "number")
    return false;
  if (value.validUntil !== undefined && typeof value.validUntil !== "number")
    return false;
  return (
    value.reason === undefined ||
    value.reason === "setup_required" ||
    value.reason === "temporarily_unavailable" ||
    value.reason === "readiness_expired" ||
    value.reason === "publisher_withdrew" ||
    value.reason === "under_review" ||
    value.reason === "updated_terms_require_review" ||
    value.reason === "not_supported_by_ae"
  );
}

function isPublicProvenance(
  value: unknown,
): value is PublicToolDescriptor["provenance"] {
  return (
    isRecord(value) &&
    (value.publisher === "provider_owned" ||
      value.publisher === "ae_curated_external" ||
      value.publisher === "third_party_gateway" ||
      value.publisher === "observed_external") &&
    (value.sourceKind === "ae_envelope" ||
      value.sourceKind === "openapi_http" ||
      value.sourceKind === "mcp" ||
      value.sourceKind === "agent_plugin_mcp" ||
      value.sourceKind === "x402")
  );
}

function isPublicRecoveryPolicy(value: unknown): value is PublicRecoveryPolicy {
  return (
    isRecord(value) &&
    (value.idempotency === "not_applicable" ||
      value.idempotency === "required") &&
    (value.recovery === "retry_safe" || value.recovery === "reconcile_required")
  );
}
