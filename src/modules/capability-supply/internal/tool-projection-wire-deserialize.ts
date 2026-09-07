import type {
  ToolCompareResult,
  ToolDetailResult,
  ToolSearchResult,
  PublicToolDescriptor,
  PublicToolNavigationRelation,
} from "../tool-projection";
import { decodePublicSchema } from "./tool-projection-wire-schema";
import type {
  ToolCompareWireResult,
  ToolDetailWireResult,
  ToolSearchWireResult,
  ToolSurfaceWireDescriptor,
  ToolSurfaceWireNavigation,
} from "./tool-projection-wire-types";

export function deserializeToolDescriptor(
  tool: ToolSurfaceWireDescriptor,
): PublicToolDescriptor {
  return {
    toolRef: tool.toolRef,
    operationId: tool.operationId,
    callVia: tool.callVia,
    paymentLane: tool.paymentLane,
    contract: {
      capabilityId: tool.contract.capabilityId,
      version: tool.contract.version,
      inputJsonSchema: decodePublicSchema(tool.contract.inputJsonSchema),
      outputJsonSchema: decodePublicSchema(tool.contract.outputJsonSchema),
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
            inputExamples: tool.contract.inputExamples.map((example) => ({
              ...(example.label === undefined ? {} : { label: example.label }),
              input: example.input,
            })),
          }),
    },
    business: tool.business,
    offering: tool.offering,
    summary: tool.summary,
    commercial: {
      price: tool.commercial.price,
      ...(tool.commercial.priceEvidence === undefined
        ? {}
        : { priceEvidence: tool.commercial.priceEvidence }),
      ...(tool.commercial.priceBreakdown === undefined
        ? {}
        : { priceBreakdown: tool.commercial.priceBreakdown }),
      materialTerms: tool.commercial.materialTerms,
      relationship: tool.commercial.relationship,
    },
    dataUse: tool.dataUse,
    effects: tool.effects,
    evidence: tool.evidence,
    cancellation: tool.cancellation,
    recovery: tool.recovery,
    authentication: tool.authentication,
    ...(tool.payment === undefined ? {} : { payment: tool.payment }),
    transport: tool.transport,
    provenance: tool.provenance,
    availability: tool.availability,
    navigation: deserializeNavigation(tool.navigation),
    ...(tool.parameters === undefined
      ? {}
      : { parameters: tool.parameters }),
    ...(tool.catalogPrice === undefined
      ? {}
      : { catalogPrice: tool.catalogPrice }),
  };
}

export function deserializeToolSearchResult(
  result: ToolSearchWireResult,
): ToolSearchResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      query: result.query,
      items: result.items.map(deserializeToolDescriptor),
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

export function deserializeToolDetailResult(
  result: ToolDetailWireResult,
): ToolDetailResult {
  if (result.kind === "found") {
    return {
      kind: "found",
      schemaVersion: result.schemaVersion,
      tool: deserializeToolDescriptor(result.tool),
    };
  }
  if (result.kind === "unavailable") {
    return {
      kind: "unavailable",
      schemaVersion: result.schemaVersion,
      toolRef: result.toolRef,
      reason: result.reason,
      navigation: deserializeNavigation(result.navigation),
    };
  }
  return {
    kind: "not_found",
    schemaVersion: result.schemaVersion,
    toolRef: result.toolRef,
    navigation: deserializeNavigation(result.navigation),
  };
}

export function deserializeToolCompareResult(
  result: ToolCompareWireResult,
): ToolCompareResult {
  if (result.kind === "ok") {
    return {
      kind: "ok",
      schemaVersion: result.schemaVersion,
      tools: result.tools.map(deserializeToolDescriptor),
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

function deserializeNavigation(
  navigation: readonly ToolSurfaceWireNavigation[],
): PublicToolNavigationRelation[] {
  return navigation.map(({ inputSchema, ...relation }) => ({
    ...relation,
    ...(inputSchema === undefined
      ? {}
      : { inputSchema: decodePublicSchema(inputSchema) }),
  }));
}
