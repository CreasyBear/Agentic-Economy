import {
  deserializeOperationDescriptor,
  type OperationSurfaceWireDescriptor,
  type PublicOperationDescriptor,
} from "@/modules/capability-supply/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";
import { safeJsonStringify } from "@/modules/common/safe-json-stringify";
import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  AnswerOperationCandidateSchema,
  AnswerOperationOutcomeSchema,
  AnswerOperationSelectionSchema,
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
  type AnswerOperationOutcome,
  type AnswerOperationSelection,
} from "../answer-schema";
import type { KeylessDataAskResolution } from "./keyless-data-ask";
import type {
  AnswerToolCallRecord,
  AnswerToolId,
} from "@/modules/answer-thread/answer-thread.schema";

const MAX_SELECTED_SCHEMA_BYTES = 256 * 1024;
const OPERATION_TOOL_IDS = new Set<AnswerToolId>([
  "operation.execute",
  "operation.invoke",
]);
export type AnswerOperationArtifacts = Readonly<{
  candidates: readonly AnswerOperationCandidate[];
  candidateSetDigest?: string;
  outcome?: AnswerOperationOutcome;
  selection?: AnswerOperationSelection;
}>;

export function buildOperationArtifactsFromToolCalls(
  records: readonly AnswerToolCallRecord[],
  keylessDataAsk?: KeylessDataAskResolution,
): AnswerOperationArtifacts {
  const selectedRef =
    keylessDataAsk?.kind === "resolved"
      ? (keylessDataAsk.selectedCandidate?.operationRef ??
        keylessDataAsk.selected?.operationRef)
      : readSelectedOperationRef(records);
  const descriptors = readCanonicalOperationDescriptors(records);
  const frozenCandidates =
    keylessDataAsk === undefined || keylessDataAsk.kind === "unavailable"
      ? []
      : (keylessDataAsk.operationCandidates ??
        (keylessDataAsk.kind === "resolved" &&
        keylessDataAsk.selectedCandidate !== undefined
          ? [keylessDataAsk.selectedCandidate]
          : []));
  const canonicalCandidates =
    frozenCandidates.length > 0
      ? frozenCandidates
          .slice(0, ANSWER_OPERATION_CANDIDATE_LIMIT)
          .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
      : descriptors
          .slice(0, ANSWER_OPERATION_CANDIDATE_LIMIT)
          .map((descriptor, index) =>
            toCandidate(descriptor, index + 1, selectedRef),
          )
          .filter(
            (candidate): candidate is AnswerOperationCandidate =>
              candidate !== undefined,
          );
  const candidates = canonicalCandidates.map((candidate) =>
    compactCandidate(candidate, selectedRef),
  );
  const computedDigest =
    canonicalCandidates.length === 0
      ? undefined
      : answerOperationCandidateSetDigest(canonicalCandidates);
  const resolutionDigest =
    keylessDataAsk?.kind === "resolved"
      ? (keylessDataAsk.candidateSetDigest ?? computedDigest)
      : keylessDataAsk?.kind === "needs_clarification"
        ? keylessDataAsk.decision.candidateSetDigest
        : computedDigest;
  const digest = candidates.length === 0 ? undefined : resolutionDigest;
  const outcome = readOperationOutcome(records);
  const selection = readOperationSelection(
    records,
    candidates,
    digest,
    outcome?.resultDigest,
  );
  return {
    candidates,
    ...(digest === undefined ? {} : { candidateSetDigest: digest }),
    ...(outcome === undefined ? {} : { outcome }),
    ...(selection === undefined ? {} : { selection }),
  };
}
function compactCandidate(
  candidate: AnswerOperationCandidate,
  selectedRef: string | undefined,
): AnswerOperationCandidate {
  const selected = candidate.operationRef === selectedRef;
  if (selected && candidate.inputJsonSchema !== undefined) {
    return { ...candidate, exactRebindRequired: false };
  }
  const { inputJsonSchema: _inputJsonSchema, ...compact } = candidate;
  return { ...compact, exactRebindRequired: true };
}

function readCanonicalOperationDescriptors(
  records: readonly AnswerToolCallRecord[],
): readonly OperationSurfaceWireDescriptor[] {
  const descriptors: OperationSurfaceWireDescriptor[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    if (!record.toolId.startsWith("registry.operations.")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.resultJson);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    for (const descriptor of operationSurfaceDescriptors(parsed)) {
      if (seen.has(descriptor.operationRef)) continue;
      seen.add(descriptor.operationRef);
      descriptors.push(descriptor);
    }
  }
  return descriptors;
}

function operationSurfaceDescriptors(
  value: Record<string, unknown>,
): readonly OperationSurfaceWireDescriptor[] {
  switch (value.kind) {
    case "found":
      return isOperationSurfaceWireDescriptor(value.operation)
        ? [value.operation]
        : [];
    case "ok":
      if (isOperationSurfaceWireDescriptorArray(value.items))
        return value.items;
      if (isOperationSurfaceWireDescriptorArray(value.operations))
        return value.operations;
      return [];
    default:
      return [];
  }
}

function isOperationSurfaceWireDescriptorArray(
  value: unknown,
): value is OperationSurfaceWireDescriptor[] {
  return Array.isArray(value) && value.every(isOperationSurfaceWireDescriptor);
}

function isOperationSurfaceWireDescriptor(
  value: unknown,
): value is OperationSurfaceWireDescriptor {
  if (
    !isRecord(value) ||
    typeof value.operationRef !== "string" ||
    typeof value.operationId !== "string" ||
    typeof value.summary !== "string" ||
    !isRecord(value.contract) ||
    typeof value.contract.inputJsonSchema !== "string" ||
    typeof value.contract.outputJsonSchema !== "string" ||
    !Array.isArray(value.contract.customerAnnotations) ||
    !isRecord(value.business) ||
    !isRecord(value.offering) ||
    !isRecord(value.commercial) ||
    !isRecord(value.provenance) ||
    !isRecord(value.availability) ||
    !Array.isArray(value.navigation) ||
    !Array.isArray(value.dataUse) ||
    !Array.isArray(value.effects) ||
    !Array.isArray(value.evidence) ||
    !isRecord(value.recovery) ||
    (value.parameters !== undefined && !Array.isArray(value.parameters))
  ) {
    return false;
  }
  return true;
}

function readSelectedOperationRef(
  records: readonly AnswerToolCallRecord[],
): string | undefined {
  for (const record of [...records].toReversed()) {
    if (!OPERATION_TOOL_IDS.has(record.toolId)) continue;
    try {
      const parsed: unknown = JSON.parse(record.inputJson);
      if (!isRecord(parsed) || typeof parsed.operationRef !== "string")
        continue;
      return parsed.operationRef;
    } catch {
      continue;
    }
  }
  return undefined;
}
function readOperationSelection(
  records: readonly AnswerToolCallRecord[],
  candidates: readonly AnswerOperationCandidate[],
  candidateSetDigest: string | undefined,
  resultDigest: string | undefined,
): AnswerOperationSelection | undefined {
  for (const record of [...records].toReversed()) {
    if (!OPERATION_TOOL_IDS.has(record.toolId)) continue;
    try {
      const parsed: unknown = JSON.parse(record.inputJson);
      if (!isRecord(parsed) || typeof parsed.operationRef !== "string")
        continue;
      const candidate = candidates.find(
        (item) => item.operationRef === parsed.operationRef,
      );
      const selection = AnswerOperationSelectionSchema.safeParse({
        operationRef: parsed.operationRef,
        toolId: record.toolId,
        ...(candidate === undefined
          ? {}
          : {
              descriptorDigest: candidate.descriptorDigest,
              ...(candidate.executionBindingDigest === undefined
                ? {}
                : { executionBindingDigest: candidate.executionBindingDigest }),
            }),
        ...(resultDigest === undefined ? {} : { resultDigest }),
        ...(candidateSetDigest === undefined ? {} : { candidateSetDigest }),
      });
      if (selection.success) return selection.data;
    } catch {
      continue;
    }
  }
  return undefined;
}

function readOperationOutcome(
  records: readonly AnswerToolCallRecord[],
): AnswerOperationOutcome | undefined {
  for (const record of [...records].toReversed()) {
    if (!OPERATION_TOOL_IDS.has(record.toolId)) continue;
    let result: unknown;
    try {
      result = JSON.parse(record.resultJson);
    } catch {
      continue;
    }
    if (!isRecord(result)) continue;
    const operationRef =
      typeof result.operationRef === "string"
        ? result.operationRef
        : operationRefFromInput(record.inputJson);
    if (operationRef === undefined) continue;
    const candidate = AnswerOperationOutcomeSchema.safeParse({
      toolId: record.toolId,
      operationRef,
      resultDigest: canonicalDigest(result).toString(),
      toolCallDigest: record.resultHash,
      result,
    });
    if (candidate.success) return candidate.data;
  }
  return undefined;
}
function operationRefFromInput(inputJson: string): string | undefined {
  try {
    const input: unknown = JSON.parse(inputJson);
    return isRecord(input) && typeof input.operationRef === "string"
      ? input.operationRef
      : undefined;
  } catch {
    return undefined;
  }
}

export function answerOperationCandidateFromPublicDescriptor(
  descriptor: PublicOperationDescriptor,
  rank: number,
  options: Readonly<{
    matchReason?: string;
    includeInputSchema?: boolean;
    executionBindingDigest?: string;
  }> = {},
): AnswerOperationCandidate | undefined {
  try {
    const inputJsonSchema = structuredClone(
      descriptor.contract.inputJsonSchema,
    ) as Record<string, unknown>;
    const parameters = (descriptor.parameters ?? [])
      .slice(0, 32)
      .map((parameter) => ({ ...parameter }));
    const requiredParameters = parameters.filter(
      (parameter): parameter is typeof parameter & { required: true } =>
        parameter.required,
    );
    const optionalParameters = parameters.filter(
      (parameter): parameter is typeof parameter & { required: false } =>
        !parameter.required,
    );
    const candidate = {
      rank,
      operationRef: descriptor.operationRef,
      operationId: descriptor.operationId,
      descriptorDigest: canonicalDigest(descriptor).toString(),
      ...(options.executionBindingDigest === undefined
        ? {}
        : { executionBindingDigest: options.executionBindingDigest }),
      business: { ...descriptor.business },
      offering: { ...descriptor.offering },
      matchReason: options.matchReason ?? "canonical_operation_surface",
      summary: descriptor.summary,
      availability: { ...descriptor.availability },
      commercial: {
        price: descriptor.commercial.price,
        ...(descriptor.commercial.priceEvidence === undefined
          ? {}
          : {
              priceEvidence: {
                ...descriptor.commercial.priceEvidence,
                evidenceRefs: [
                  ...descriptor.commercial.priceEvidence.evidenceRefs,
                ],
              },
            }),
        materialTerms: descriptor.commercial.materialTerms.map((term) => ({
          ...term,
        })),
        relationship: { ...descriptor.commercial.relationship },
      },
      requiredParameters,
      optionalParameters,
      inputSchemaDigest: canonicalDigest(inputJsonSchema).toString(),
      ...(options.includeInputSchema === true ? { inputJsonSchema } : {}),
      exactRebindRequired: options.includeInputSchema !== true,
      authority: {
        publisher: descriptor.provenance.publisher,
        sourceKind: descriptor.provenance.sourceKind,
        authentication: { ...descriptor.authentication },
      },
      dataUse: descriptor.dataUse.map((policy) => ({
        effectId: policy.effectId,
        inputPointer: policy.inputPointer,
        classification: policy.classification,
        phase: policy.phase,
        recipient: policy.recipient,
        purposes: [...policy.purposes],
      })),
      effects: descriptor.effects.map((effect) => ({ ...effect })),
      evidence: descriptor.evidence.map((item) => ({ ...item })),
      recovery: { ...descriptor.recovery },
      navigation: descriptor.navigation.map((relation) => ({
        relation: relation.relation,
        ...(relation.pathTemplate === undefined
          ? {}
          : { pathTemplate: relation.pathTemplate }),
        method: relation.method,
        actionId: relation.actionId,
        authentication: relation.authentication,
        ...(relation.inputSchema === undefined
          ? {}
          : { inputSchema: structuredClone(relation.inputSchema) }),
        ...(relation.surfaces === undefined
          ? {}
          : { surfaces: [...relation.surfaces] }),
        ...(relation.precondition === undefined
          ? {}
          : { precondition: relation.precondition }),
      })),
    };
    const parsed = AnswerOperationCandidateSchema.safeParse(candidate);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function toCandidate(
  descriptor: OperationSurfaceWireDescriptor,
  rank: number,
  selectedRef?: string,
): AnswerOperationCandidate | undefined {
  try {
    return answerOperationCandidateFromPublicDescriptor(
      deserializeOperationDescriptor(descriptor),
      rank,
      {
        matchReason: "canonical_operation_surface",
        includeInputSchema: selectedRef === descriptor.operationRef,
      },
    );
  } catch {
    return undefined;
  }
}

function boundedInputSchema(
  value: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const json = safeJsonStringify(value);
  return new TextEncoder().encode(json).byteLength <= MAX_SELECTED_SCHEMA_BYTES
    ? value
    : undefined;
}
