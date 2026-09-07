import { isPublicToolRef, type PublicToolRef } from "../public";
import {
  noToolNavigation,
  normalizeRefs,
  toolNavigation,
  projectCapabilityTool,
} from "./tool-project";
import {
  PublicToolRegistrySchemaVersion,
  type CapabilityToolSourcePort,
  type CapabilityToolSourceRecord,
  type PublicCapabilityUnavailableReason,
  type PublicDataUsePolicy,
  type PublicEffectPolicy,
  type PublicToolAvailability,
  type PublicToolDescriptor,
  type PublicToolNavigationRelation,
  type PublicToolPrice,
  type PublicRecoveryPolicy,
} from "./tool-projection-types";

export type ToolDetailInput = Readonly<{ toolRef: string }>;
export type ToolDetailResult =
  | Readonly<{
      kind: "found";
      schemaVersion: PublicToolRegistrySchemaVersion;
      tool: PublicToolDescriptor;
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicToolRegistrySchemaVersion;
      toolRef: string;
      reason: PublicCapabilityUnavailableReason;
      navigation: readonly PublicToolNavigationRelation[];
    }>
  | Readonly<{
      kind: "not_found";
      schemaVersion: PublicToolRegistrySchemaVersion;
      toolRef: string;
      navigation: readonly PublicToolNavigationRelation[];
    }>;
export type ToolComparisonValue =
  | string
  | PublicToolPrice
  | PublicEffectPolicy
  | PublicDataUsePolicy
  | PublicToolAvailability
  | Readonly<{
      publisher:
        | "provider_owned"
        | "ae_curated_external"
        | "third_party_gateway"
        | "observed_external";
      sourceKind:
        "ae_envelope" | "openapi_http" | "mcp" | "agent_plugin_mcp" | "x402";
    }>
  | PublicRecoveryPolicy;
export type ToolComparisonFact = Readonly<{
  field:
    | "summary"
    | "price"
    | "effects"
    | "dataUse"
    | "availability"
    | "provenance"
    | "recovery";
  values: readonly Readonly<{
    toolRef: PublicToolRef;
    value: ToolComparisonValue;
    source: "publication" | "readiness" | "contract" | "catalog";
    observedAt?: number;
    validUntil?: number;
    lastHealthyAt?: number;
  }>[];
}>;
export type ToolCompareInput = Readonly<{
  toolRefs: readonly string[];
}>;
export type ToolCompareResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicToolRegistrySchemaVersion;
      tools: readonly PublicToolDescriptor[];
      facts: readonly ToolComparisonFact[];
      navigation: readonly PublicToolNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicToolRegistrySchemaVersion;
      reason: "query_invalid" | "tool_not_found" | "tool_unavailable";
      navigation: readonly PublicToolNavigationRelation[];
    }>;

const MAX_COMPARISON = 4;

export async function detailCapabilityTool(
  port: CapabilityToolSourcePort,
  input: ToolDetailInput,
  now = Date.now(),
): Promise<ToolDetailResult> {
  if (!isPublicToolRef(input.toolRef))
    return {
      kind: "not_found",
      schemaVersion: PublicToolRegistrySchemaVersion,
      toolRef: input.toolRef,
      navigation: noToolNavigation(port.navigation),
    };
  const record = await port.loadCurrent(input.toolRef);
  if (record === null)
    return {
      kind: "not_found",
      schemaVersion: PublicToolRegistrySchemaVersion,
      toolRef: input.toolRef,
      navigation: noToolNavigation(port.navigation),
    };
  const tool = projectCapabilityTool(record, now, port.navigation);
  return tool.availability.posture === "unavailable"
    ? {
        kind: "unavailable",
        schemaVersion: PublicToolRegistrySchemaVersion,
        toolRef: tool.toolRef,
        reason: tool.availability.reason ?? "not_supported_by_ae",
        navigation: noToolNavigation(port.navigation),
      }
    : {
        kind: "found",
        schemaVersion: PublicToolRegistrySchemaVersion,
        tool,
      };
}

export async function compareCapabilityTools(
  port: CapabilityToolSourcePort,
  input: ToolCompareInput,
  now = Date.now(),
): Promise<ToolCompareResult> {
  const refs = normalizeRefs(input.toolRefs, MAX_COMPARISON);
  if (refs === undefined)
    return {
      kind: "unavailable",
      schemaVersion: PublicToolRegistrySchemaVersion,
      reason: "query_invalid",
      navigation: noToolNavigation(port.navigation),
    };
  const records = await Promise.all(refs.map((ref) => port.loadCurrent(ref)));
  const presentRecords = records.filter(
    (record): record is CapabilityToolSourceRecord => record !== null,
  );
  if (presentRecords.length !== records.length)
    return {
      kind: "unavailable",
      schemaVersion: PublicToolRegistrySchemaVersion,
      reason: "tool_not_found",
      navigation: noToolNavigation(port.navigation),
    };
  const tools = presentRecords.map((record) =>
    projectCapabilityTool(record, now, port.navigation),
  );
  if (
    tools.some(
      (tool) => tool.availability.posture === "unavailable",
    )
  )
    return {
      kind: "unavailable",
      schemaVersion: PublicToolRegistrySchemaVersion,
      reason: "tool_unavailable",
      navigation: noToolNavigation(port.navigation),
    };
  return {
    kind: "ok",
    schemaVersion: PublicToolRegistrySchemaVersion,
    tools,
    facts: comparisonFacts(tools),
    navigation: toolNavigation("read_only", port.navigation),
  };
}

function comparisonFacts(
  tools: readonly PublicToolDescriptor[],
): ToolComparisonFact[] {
  const fields: ToolComparisonFact["field"][] = [
    "summary",
    "price",
    "effects",
    "dataUse",
    "availability",
    "provenance",
    "recovery",
  ];
  return fields.map((field) => ({
    field,
    values: tools.map((tool) => ({
      toolRef: tool.toolRef,
      value: comparisonValue(tool, field),
      source:
        field === "availability"
          ? ("readiness" as const)
          : field === "price"
            ? ("catalog" as const)
            : field === "provenance"
              ? ("publication" as const)
              : ("contract" as const),
      ...(tool.availability.observedAt === undefined
        ? {}
        : { observedAt: tool.availability.observedAt }),
      ...(tool.availability.validUntil === undefined
        ? {}
        : { validUntil: tool.availability.validUntil }),
      ...(tool.availability.lastHealthyAt === undefined
        ? {}
        : { lastHealthyAt: tool.availability.lastHealthyAt }),
    })),
  }));
}
function comparisonValue(
  tool: PublicToolDescriptor,
  field: ToolComparisonFact["field"],
): ToolComparisonValue {
  if (field === "summary") return tool.summary;
  if (field === "price") return tool.commercial.price;
  if (field === "effects") return tool.effects;
  if (field === "dataUse") return tool.dataUse;
  if (field === "availability") return tool.availability;
  if (field === "provenance") return tool.provenance;
  return tool.recovery;
}
