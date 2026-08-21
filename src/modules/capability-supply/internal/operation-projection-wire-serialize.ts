import type {
  CapabilityInputExample,
  JsonValue,
} from "@/modules/capability-contract/public";
import { exactAmountSchema } from "@/modules/money/public";
import { isRecord } from "@/modules/common/is-record";
import type {
  InspectPlanResult,
  OperationCompareResult,
  OperationComparisonFact,
  OperationComparisonValue,
  OperationDetailResult,
  OperationSearchFilters,
  OperationSearchResult,
  PublicDataUsePolicy,
  PublicEffectPolicy,
  PublicOperationAvailability,
  PublicOperationDescriptor,
  PublicOperationNavigationRelation,
  PublicOperationParameter,
  PublicOperationPrice,
  PublicOperationPriceEvidence,
  PublicRecoveryPolicy,
} from "../operation-projection";
import type {
  DeepWritable,
  InspectPlanWireResult,
  OperationCompareWireResult,
  OperationDetailWireResult,
  OperationSearchWireFilters,
  OperationSearchWireResult,
  OperationSurfaceWireDescriptor,
  OperationSurfaceWireNavigation,
} from "./operation-projection-wire-types";

export function serializeOperationDescriptor(
  operation: PublicOperationDescriptor,
): OperationSurfaceWireDescriptor {
  return {
    operationRef: operation.operationRef,
    operationId: operation.operationId,
    callVia: operation.callVia,
    paymentLane: operation.paymentLane,
    contract: {
      capabilityId: operation.contract.capabilityId,
      version: operation.contract.version,
      inputJsonSchema: JSON.stringify(operation.contract.inputJsonSchema),
      outputJsonSchema: JSON.stringify(operation.contract.outputJsonSchema),
      customerAnnotations: operation.contract.customerAnnotations.map(
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
      ...(operation.contract.inputExamples === undefined
        ? {}
        : {
            inputExamples: serializeInputExamples(
              operation.contract.inputExamples,
            ),
          }),
    },
    business: {
      businessId: operation.business.businessId,
      slug: operation.business.slug,
      name: operation.business.name,
    },
    offering: {
      offeringRef: operation.offering.offeringRef,
      revision: operation.offering.revision,
      label: operation.offering.label,
      summary: operation.offering.summary,
    },
    summary: operation.summary,
    commercial: {
      price: serializePrice(operation.commercial.price),
      ...(operation.commercial.priceEvidence === undefined
        ? {}
        : {
            priceEvidence: serializePriceEvidence(
              operation.commercial.priceEvidence,
            ),
          }),
      ...(operation.commercial.priceBreakdown === undefined
        ? {}
        : {
            priceBreakdown: {
              providerQuotedAmount: {
                ...operation.commercial.priceBreakdown.providerQuotedAmount,
              },
              agenticEconomyFee: {
                ...operation.commercial.priceBreakdown.agenticEconomyFee,
              },
              totalBuyerAuthorization: {
                ...operation.commercial.priceBreakdown.totalBuyerAuthorization,
              },
              network: operation.commercial.priceBreakdown.network,
              asset: operation.commercial.priceBreakdown.asset,
            },
          }),
      materialTerms: operation.commercial.materialTerms.map((term) => ({
        label: term.label,
        value: term.value,
      })),
      relationship: {
        kind: operation.commercial.relationship.kind,
        summary: operation.commercial.relationship.summary,
      },
    },
    dataUse: operation.dataUse.map(serializeDataUse),
    effects: operation.effects.map(serializeEffect),
    evidence: operation.evidence.map((evidence) => ({
      evidenceId: evidence.evidenceId,
      outputPointer: evidence.outputPointer,
      purpose: evidence.purpose,
    })),
    cancellation: { kind: operation.cancellation.kind },
    recovery: {
      idempotency: operation.recovery.idempotency,
      recovery: operation.recovery.recovery,
    },
    authentication: operation.authentication,
    transport: operation.transport,
    provenance: {
      publisher: operation.provenance.publisher,
      sourceKind: operation.provenance.sourceKind,
    },
    availability: serializeAvailability(operation.availability),
    navigation: serializeNavigation(operation.navigation),
    ...(operation.parameters === undefined
      ? {}
      : { parameters: operation.parameters.map(serializeParameter) }),
    ...(operation.catalogPrice === undefined
      ? {}
      : {
          catalogPrice: {
            scheme: operation.catalogPrice.scheme,
            ...(operation.catalogPrice.amount === undefined
              ? {}
              : { amount: operation.catalogPrice.amount }),
            ...(operation.catalogPrice.minAmount === undefined
              ? {}
              : { minAmount: operation.catalogPrice.minAmount }),
            ...(operation.catalogPrice.maxAmount === undefined
              ? {}
              : { maxAmount: operation.catalogPrice.maxAmount }),
            currency: operation.catalogPrice.currency,
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
  parameter: PublicOperationParameter,
): DeepWritable<PublicOperationParameter> {
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
  evidence: PublicOperationPriceEvidence,
): DeepWritable<PublicOperationPriceEvidence> {
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

export function serializeOperationSearchResult(
  result: OperationSearchResult,
): OperationSearchWireResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      query: result.query,
      items: result.items.map(serializeOperationDescriptor),
      matchedCount: result.matchedCount,
      ranking: result.ranking.map((entry) => ({
        operationRef: entry.operationRef,
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
        operationRef: entry.operationRef,
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

export function serializeOperationDetailResult(
  result: OperationDetailResult,
): OperationDetailWireResult {
  if (result.kind === "found") {
    return {
      kind: "found",
      schemaVersion: result.schemaVersion,
      operation: serializeOperationDescriptor(result.operation),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      operationRef: result.operationRef,
      reason: result.reason,
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "not_found",
    schemaVersion: result.schemaVersion,
    operationRef: result.operationRef,
    navigation: serializeNavigation(result.navigation),
  };
}

export function serializeOperationCompareResult(
  result: OperationCompareResult,
): OperationCompareWireResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      operations: result.operations.map(serializeOperationDescriptor),
      facts: result.facts.map((fact) => ({
        field: fact.field,
        values: fact.values.map((value) => ({
          operationRef: value.operationRef,
          value: serializeComparisonValue(value.value, fact.field),
          source: value.source,
          ...(value.observedAt === undefined
            ? {}
            : { observedAt: value.observedAt }),
          ...(value.validUntil === undefined
            ? {}
            : { validUntil: value.validUntil }),
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

export function serializeInspectPlanResult(
  result: InspectPlanResult,
): InspectPlanWireResult {
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      reason: result.reason,
      navigation: serializeNavigation(result.navigation),
    };
  }
  return {
    kind: "ok",
    schemaVersion: result.schemaVersion,
    inspectPlanRef: result.inspectPlanRef,
    operationRefs: [...result.operationRefs],
    mappingRefs: [...result.mappingRefs],
    summary: {
      maximumCost:
        result.summary.maximumCost.kind === "known"
          ? { kind: "known", amount: { ...result.summary.maximumCost.amount } }
          : { kind: "requires_preparation" },
      dataUse: result.summary.dataUse.map(serializeDataUse),
      effects: result.summary.effects.map(serializeEffect),
      expiry: result.summary.expiry,
    },
    navigation: serializeNavigation(result.navigation),
  };
}

function serializePrice(
  price: PublicOperationPrice,
): DeepWritable<PublicOperationPrice> {
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
  availability: PublicOperationAvailability,
): DeepWritable<PublicOperationAvailability> {
  return {
    posture: availability.posture,
    ...(availability.observedAt === undefined
      ? {}
      : { observedAt: availability.observedAt }),
    ...(availability.validUntil === undefined
      ? {}
      : { validUntil: availability.validUntil }),
    ...(availability.reason === undefined
      ? {}
      : { reason: availability.reason }),
  };
}

function serializeNavigation(
  navigation: readonly PublicOperationNavigationRelation[],
): OperationSurfaceWireNavigation[] {
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
  filters: OperationSearchFilters,
): OperationSearchWireFilters {
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
  value: OperationComparisonValue,
  field: OperationComparisonFact["field"],
): DeepWritable<OperationComparisonValue> {
  if (field === "summary") {
    if (typeof value !== "string")
      throw new Error("operation_comparison_value_invalid");
    return value;
  }
  if (field === "price") {
    if (!isPublicOperationPrice(value))
      throw new Error("operation_comparison_value_invalid");
    return serializePrice(value);
  }
  if (field === "effects") {
    if (!isPublicEffectPolicy(value))
      throw new Error("operation_comparison_value_invalid");
    return value.map(serializeEffect);
  }
  if (field === "dataUse") {
    if (!isPublicDataUsePolicy(value))
      throw new Error("operation_comparison_value_invalid");
    return value.map(serializeDataUse);
  }
  if (field === "availability") {
    if (!isPublicAvailability(value))
      throw new Error("operation_comparison_value_invalid");
    return serializeAvailability(value);
  }
  if (field === "provenance") {
    if (!isPublicProvenance(value))
      throw new Error("operation_comparison_value_invalid");
    return { publisher: value.publisher, sourceKind: value.sourceKind };
  }
  if (!isPublicRecoveryPolicy(value))
    throw new Error("operation_comparison_value_invalid");
  return { idempotency: value.idempotency, recovery: value.recovery };
}

function isPublicOperationPrice(value: unknown): value is PublicOperationPrice {
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
): value is PublicOperationAvailability {
  if (
    !isRecord(value) ||
    (value.posture !== "integrated" &&
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
): value is PublicOperationDescriptor["provenance"] {
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
