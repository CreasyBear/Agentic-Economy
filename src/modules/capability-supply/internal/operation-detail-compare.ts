import { isPublicOperationRef, type PublicOperationRef } from "../public";
import {
  noOperationNavigation,
  normalizeRefs,
  operationNavigation,
  projectCapabilityOperation,
} from "./operation-project";
import {
  PublicOperationRegistrySchemaVersion,
  type CapabilityOperationSourcePort,
  type CapabilityOperationSourceRecord,
  type PublicCapabilityUnavailableReason,
  type PublicDataUsePolicy,
  type PublicEffectPolicy,
  type PublicOperationAvailability,
  type PublicOperationDescriptor,
  type PublicOperationNavigationRelation,
  type PublicOperationPrice,
  type PublicRecoveryPolicy,
} from "./operation-projection-types";

export type OperationDetailInput = Readonly<{ operationRef: string }>;
export type OperationDetailResult =
  | Readonly<{
      kind: "found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operation: PublicOperationDescriptor;
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      reason: PublicCapabilityUnavailableReason;
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "not_found";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operationRef: string;
      navigation: readonly PublicOperationNavigationRelation[];
    }>;
export type OperationComparisonValue =
  | string
  | PublicOperationPrice
  | PublicEffectPolicy
  | PublicDataUsePolicy
  | PublicOperationAvailability
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
export type OperationComparisonFact = Readonly<{
  field:
    | "summary"
    | "price"
    | "effects"
    | "dataUse"
    | "availability"
    | "provenance"
    | "recovery";
  values: readonly Readonly<{
    operationRef: PublicOperationRef;
    value: OperationComparisonValue;
    source: "publication" | "readiness" | "contract" | "catalog";
    observedAt?: number;
    validUntil?: number;
  }>[];
}>;
export type OperationCompareInput = Readonly<{
  operationRefs: readonly string[];
}>;
export type OperationCompareResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      operations: readonly PublicOperationDescriptor[];
      facts: readonly OperationComparisonFact[];
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason: "query_invalid" | "operation_not_found" | "operation_unavailable";
      navigation: readonly PublicOperationNavigationRelation[];
    }>;

const MAX_COMPARISON = 4;

export async function detailCapabilityOperation(
  port: CapabilityOperationSourcePort,
  input: OperationDetailInput,
  now = Date.now(),
): Promise<OperationDetailResult> {
  if (!isPublicOperationRef(input.operationRef))
    return {
      kind: "not_found",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operationRef: input.operationRef,
      navigation: noOperationNavigation(),
    };
  const record = await port.loadCurrent(input.operationRef);
  if (record === null)
    return {
      kind: "not_found",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      operationRef: input.operationRef,
      navigation: noOperationNavigation(),
    };
  const operation = projectCapabilityOperation(record, now);
  return operation.availability.posture === "unavailable"
    ? {
        kind: "unavailable",
        schemaVersion: PublicOperationRegistrySchemaVersion,
        operationRef: operation.operationRef,
        reason: operation.availability.reason ?? "not_supported_by_ae",
        navigation: noOperationNavigation(),
      }
    : {
        kind: "found",
        schemaVersion: PublicOperationRegistrySchemaVersion,
        operation,
      };
}

export async function compareCapabilityOperations(
  port: CapabilityOperationSourcePort,
  input: OperationCompareInput,
  now = Date.now(),
): Promise<OperationCompareResult> {
  const refs = normalizeRefs(input.operationRefs, MAX_COMPARISON);
  if (refs === undefined)
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "query_invalid",
      navigation: noOperationNavigation(),
    };
  const records = await Promise.all(refs.map((ref) => port.loadCurrent(ref)));
  const presentRecords = records.filter(
    (record): record is CapabilityOperationSourceRecord => record !== null,
  );
  if (presentRecords.length !== records.length)
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_not_found",
      navigation: noOperationNavigation(),
    };
  const operations = presentRecords.map((record) =>
    projectCapabilityOperation(record, now),
  );
  if (
    operations.some(
      (operation) => operation.availability.posture === "unavailable",
    )
  )
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_unavailable",
      navigation: noOperationNavigation(),
    };
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    operations,
    facts: comparisonFacts(operations),
    navigation: operationNavigation("inspect_only"),
  };
}

function comparisonFacts(
  operations: readonly PublicOperationDescriptor[],
): OperationComparisonFact[] {
  const fields: OperationComparisonFact["field"][] = [
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
    values: operations.map((operation) => ({
      operationRef: operation.operationRef,
      value: comparisonValue(operation, field),
      source:
        field === "availability"
          ? ("readiness" as const)
          : field === "price"
            ? ("catalog" as const)
            : field === "provenance"
              ? ("publication" as const)
              : ("contract" as const),
      ...(operation.availability.observedAt === undefined
        ? {}
        : { observedAt: operation.availability.observedAt }),
      ...(operation.availability.validUntil === undefined
        ? {}
        : { validUntil: operation.availability.validUntil }),
    })),
  }));
}
function comparisonValue(
  operation: PublicOperationDescriptor,
  field: OperationComparisonFact["field"],
): OperationComparisonValue {
  if (field === "summary") return operation.summary;
  if (field === "price") return operation.commercial.price;
  if (field === "effects") return operation.effects;
  if (field === "dataUse") return operation.dataUse;
  if (field === "availability") return operation.availability;
  if (field === "provenance") return operation.provenance;
  return operation.recovery;
}
