import {
  resolvePointedSchema,
  type JsonValue,
} from "@/modules/capability-contract/public";
import { addExactAmounts, type ExactAmount } from "@/modules/money/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import type { StableHashValue } from "@/modules/common/stable-hash";
import type {
  PublicOperationRef,
  RegisteredOperationMapping,
  RegisteredOperationMappingRef,
} from "../public";
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
  type PublicCommercialTerms,
  type PublicDataUsePolicy,
  type PublicEffectPolicy,
  type PublicOperationDescriptor,
  type PublicOperationNavigationRelation,
} from "./operation-projection-types";

export type InspectPlanInput = Readonly<{
  operationRefs: readonly string[];
  mappingRefs?: readonly string[];
  expiresInMs?: number;
}>;
export type InspectPlanResult =
  | Readonly<{
      kind: "ok";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      inspectPlanRef: string;
      operationRefs: readonly PublicOperationRef[];
      mappingRefs: readonly RegisteredOperationMappingRef[];
      summary: Readonly<{
        maximumCost:
          | Readonly<{ kind: "known"; amount: ExactAmount }>
          | Readonly<{ kind: "requires_preparation" }>;
        dataUse: PublicDataUsePolicy;
        effects: PublicEffectPolicy;
        expiry: number;
      }>;
      navigation: readonly PublicOperationNavigationRelation[];
    }>
  | Readonly<{
      kind: "unavailable";
      schemaVersion: PublicOperationRegistrySchemaVersion;
      reason:
        | "query_invalid"
        | "operation_not_found"
        | "operation_unavailable"
        | "mapping_unavailable"
        | "mapping_incompatible"
        | "mapping_cycle";
      operationRef?: string;
      navigation: readonly PublicOperationNavigationRelation[];
    }>;

const MAX_PLAN = 4;
const MAX_MAPPING_REFS = 32;

export async function inspectCapabilityOperationPlan(
  port: CapabilityOperationSourcePort,
  input: InspectPlanInput,
  now = Date.now(),
): Promise<InspectPlanResult> {
  const refs = normalizeRefs(input.operationRefs, MAX_PLAN);
  const mappingRefs =
    input.mappingRefs === undefined
      ? []
      : input.mappingRefs.length <= MAX_MAPPING_REFS &&
          input.mappingRefs.every(mappingRefIsValid)
        ? ([...new Set(input.mappingRefs)] as RegisteredOperationMappingRef[])
        : undefined;
  const expiresInMs = input.expiresInMs ?? 300_000;
  if (
    refs === undefined ||
    mappingRefs === undefined ||
    !Number.isSafeInteger(expiresInMs) ||
    expiresInMs < 1_000 ||
    expiresInMs > 86_400_000
  )
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
  if (presentRecords.length !== records.length) {
    const missingIndex = records.findIndex((record) => record === null);
    const missingOperationRef = refs[missingIndex];
    if (missingOperationRef === undefined) throw new Error("operation_plan_missing_ref_invariant");
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_not_found",
      operationRef: missingOperationRef,
      navigation: noOperationNavigation(),
    };
  }
  const operations = presentRecords.map((record) =>
    projectCapabilityOperation(record, now),
  );
  // A plan may only be produced against ops that are genuinely routeable right now.
  // Keyed ops whose credential/readiness is absent and observed x402 ops project as
  // 'integrated' (reason 'setup_required') but are NOT routeable; they must be
  // refused here rather than presented as a buildable plan (the commit/plan gate
  // already requires listRouteable, so this closes the registry preview surface too).
  const unavailableOperation = operations.find(
    (operation) => operation.availability.posture !== "routeable",
  );
  if (unavailableOperation !== undefined)
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "operation_unavailable",
      operationRef: unavailableOperation.operationRef,
      navigation: noOperationNavigation(),
    };
  const mappings: RegisteredOperationMapping[] = [];
  const networkIds = new Set(presentRecords.map((record) => record.networkId));
  const networkId = networkIds.size === 1 ? [...networkIds][0] : undefined;
  for (const mappingRef of mappingRefs) {
    const mapping =
      port.resolveMapping === undefined
        ? null
        : await port.resolveMapping(mappingRef, networkId);
    if (mapping === null)
      return {
        kind: "unavailable",
        schemaVersion: PublicOperationRegistrySchemaVersion,
        reason: "mapping_unavailable",
        navigation: noOperationNavigation(),
      };
    mappings.push(mapping);
  }
  if (!mappingsCompatible(mappings, presentRecords))
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "mapping_incompatible",
      navigation: noOperationNavigation(),
    };
  if (mappingCycle(mappings))
    return {
      kind: "unavailable",
      schemaVersion: PublicOperationRegistrySchemaVersion,
      reason: "mapping_cycle",
      navigation: noOperationNavigation(),
    };
  const expiry = Math.min(
    now + expiresInMs,
    ...operations.map(
      (operation) => operation.availability.validUntil ?? now + expiresInMs,
    ),
  );
  return {
    kind: "ok",
    schemaVersion: PublicOperationRegistrySchemaVersion,
    inspectPlanRef: `inspect-plan:v1:${canonicalDigest({ operationRefs: refs, mappingRefs, expiresAt: expiry }).slice(7)}`,
    operationRefs: refs,
    mappingRefs,
    summary: {
      maximumCost: aggregatePrice(
        operations.map((operation) => operation.commercial.price),
      ),
      dataUse: mergeDataUse(operations),
      effects: mergeEffects(operations),
      expiry,
    },
    navigation: operationNavigation("inspect_only"),
  };
}

function mappingRefIsValid(
  value: string,
): value is RegisteredOperationMappingRef {
  return /^mapping:v1:[0-9a-f]{64}$/.test(value);
}
function aggregatePrice(
  prices: readonly PublicCommercialTerms["price"][],
):
  | Readonly<{ kind: "known"; amount: ExactAmount }>
  | Readonly<{ kind: "requires_preparation" }> {
  let amount: ExactAmount | undefined;
  for (const price of prices) {
    if (price.kind === "on_request") return { kind: "requires_preparation" };
    const candidate = price.kind === "fixed" ? price.amount : price.maximum;
    amount =
      amount === undefined ? candidate : addExactAmounts(amount, candidate);
    if (amount === undefined) return { kind: "requires_preparation" };
  }
  return amount === undefined
    ? { kind: "requires_preparation" }
    : { kind: "known", amount };
}
function mergeDataUse(
  operations: readonly PublicOperationDescriptor[],
): PublicDataUsePolicy {
  return dedupe(operations.flatMap((operation) => operation.dataUse));
}
function mergeEffects(
  operations: readonly PublicOperationDescriptor[],
): PublicEffectPolicy {
  return dedupe(operations.flatMap((operation) => operation.effects));
}
function dedupe<T>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const digest = canonicalDigest(value as JsonValue);
    if (seen.has(digest)) return false;
    seen.add(digest);
    return true;
  });
}
function mappingsCompatible(
  mappings: readonly RegisteredOperationMapping[],
  records: readonly CapabilityOperationSourceRecord[],
): boolean {
  const contracts = new Map(
    records.map((record) => [
      `${record.contract.ref.capabilityId}:${record.contract.ref.version}`,
      record.contract,
    ]),
  );
  return mappings.every((mapping) => {
    const source = contracts.get(
      `${mapping.sourceContractRef.capabilityId}:${mapping.sourceContractRef.version}`,
    );
    const target = contracts.get(
      `${mapping.targetContractRef.capabilityId}:${mapping.targetContractRef.version}`,
    );
    if (
      source === undefined ||
      target === undefined ||
      source.ref.contractDigest !== mapping.sourceContractRef.contractDigest ||
      target.ref.contractDigest !== mapping.targetContractRef.contractDigest
    ) {
      return false;
    }
    const sourcePointer =
      mapping.kind === "array_project"
        ? mapping.sourceArrayPointer
        : mapping.sourceOutputPointer;
    const targetPointer =
      mapping.kind === "array_project"
        ? mapping.targetArrayPointer
        : mapping.targetInputPointer;
    const sourceSchema = resolvePointedSchema(
      source.outputSchema,
      sourcePointer,
    );
    const targetSchema = resolvePointedSchema(
      target.inputSchema,
      targetPointer,
    );
    if (
      sourceSchema === undefined ||
      targetSchema === undefined ||
      canonicalDigest(sourceSchema as StableHashValue) !==
        mapping.sourceSchemaIdentity ||
      canonicalDigest(targetSchema as StableHashValue) !==
        mapping.targetSchemaIdentity
    ) {
      return false;
    }
    return (
      mapping.kind !== "array_project" ||
      resolvePointedSchema(
        source.outputSchema,
        `${mapping.sourceArrayPointer}/0${mapping.sourceItemPointer}`,
      ) !== undefined
    );
  });
}
function mappingCycle(
  mappings: readonly RegisteredOperationMapping[],
): boolean {
  const graph = new Map<string, string[]>();
  for (const mapping of mappings) {
    const source =
      mapping.sourceContractRef.capabilityId +
      ":" +
      mapping.sourceContractRef.version;
    const target =
      mapping.targetContractRef.capabilityId +
      ":" +
      mapping.targetContractRef.version;
    graph.set(source, [...(graph.get(source) ?? []), target]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    if ((graph.get(node) ?? []).some(visit)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...graph.keys()].some(visit);
}
