import type {
  InspectPlanResult,
  OperationCompareResult,
  OperationDetailResult,
  OperationSearchResult,
  PublicOperationDescriptor,
  PublicOperationNavigationRelation,
} from "../operation-projection";
import { decodePublicSchema } from "./operation-projection-wire-schema";
import type {
  InspectPlanWireResult,
  OperationCompareWireResult,
  OperationDetailWireResult,
  OperationSearchWireResult,
  OperationSurfaceWireDescriptor,
  OperationSurfaceWireNavigation,
} from "./operation-projection-wire-types";

export function deserializeOperationDescriptor(
  operation: OperationSurfaceWireDescriptor,
): PublicOperationDescriptor {
  return {
    operationRef: operation.operationRef,
    operationId: operation.operationId,
    callVia: operation.callVia,
    paymentLane: operation.paymentLane,
    contract: {
      capabilityId: operation.contract.capabilityId,
      version: operation.contract.version,
      inputJsonSchema: decodePublicSchema(operation.contract.inputJsonSchema),
      outputJsonSchema: decodePublicSchema(operation.contract.outputJsonSchema),
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
            inputExamples: operation.contract.inputExamples.map((example) => ({
              ...(example.label === undefined ? {} : { label: example.label }),
              input: example.input,
            })),
          }),
    },
    business: operation.business,
    offering: operation.offering,
    summary: operation.summary,
    commercial: {
      price: operation.commercial.price,
      ...(operation.commercial.priceEvidence === undefined
        ? {}
        : { priceEvidence: operation.commercial.priceEvidence }),
      ...(operation.commercial.priceBreakdown === undefined
        ? {}
        : { priceBreakdown: operation.commercial.priceBreakdown }),
      materialTerms: operation.commercial.materialTerms,
      relationship: operation.commercial.relationship,
    },
    dataUse: operation.dataUse,
    effects: operation.effects,
    evidence: operation.evidence,
    cancellation: operation.cancellation,
    recovery: operation.recovery,
    authentication: operation.authentication,
    transport: operation.transport,
    provenance: operation.provenance,
    availability: operation.availability,
    navigation: deserializeNavigation(operation.navigation),
    ...(operation.parameters === undefined
      ? {}
      : { parameters: operation.parameters }),
    ...(operation.catalogPrice === undefined
      ? {}
      : { catalogPrice: operation.catalogPrice }),
  };
}

export function deserializeOperationSearchResult(
  result: OperationSearchWireResult,
): OperationSearchResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      query: result.query,
      items: result.items.map(deserializeOperationDescriptor),
      matchedCount: result.matchedCount,
      ranking: result.ranking,
      pagination: result.pagination,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  if (result.kind === "no_candidates") {
    return {
      kind: "no_candidates",
      schemaVersion: result.schemaVersion,
      query: result.query,
      appliedFilters: result.appliedFilters,
      matchedCount: result.matchedCount,
      ranking: result.ranking,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function deserializeOperationDetailResult(
  result: OperationDetailWireResult,
): OperationDetailResult {
  if (result.kind === "found") {
    return {
      kind: "found",
      schemaVersion: result.schemaVersion,
      operation: deserializeOperationDescriptor(result.operation),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      operationRef: result.operationRef,
      reason: result.reason,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "not_found",
    schemaVersion: result.schemaVersion,
    operationRef: result.operationRef,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function deserializeOperationCompareResult(
  result: OperationCompareWireResult,
): OperationCompareResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      operations: result.operations.map(deserializeOperationDescriptor),
      facts: result.facts,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "unavailable",
    schemaVersion: result.schemaVersion,
    reason: result.reason,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function deserializeInspectPlanResult(
  result: InspectPlanWireResult,
): InspectPlanResult {
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      reason: result.reason,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "ok",
    schemaVersion: result.schemaVersion,
    inspectPlanRef: result.inspectPlanRef,
    operationRefs: result.operationRefs,
    mappingRefs: result.mappingRefs,
    summary: {
      maximumCost: result.summary.maximumCost,
      dataUse: result.summary.dataUse,
      effects: result.summary.effects,
      expiry: result.summary.expiry,
    },
    navigation: deserializeNavigation(result.navigation),
  };
}

function deserializeNavigation(
  navigation: readonly OperationSurfaceWireNavigation[],
): PublicOperationNavigationRelation[] {
  return navigation.map(({ inputSchema, ...relation }) => ({
    ...relation,
    ...(inputSchema === undefined
      ? {}
      : { inputSchema: decodePublicSchema(inputSchema) }),
  }));
}
