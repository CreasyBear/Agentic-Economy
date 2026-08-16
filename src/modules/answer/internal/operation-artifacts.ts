import {
  deserializeOperationDescriptor,
  type OperationSurfaceWireDescriptor,
  type PublicOperationDescriptor,
} from "@/modules/capability-supply/public";
import { canonicalDigest } from "@/modules/common/canonical-digest";
import { isRecord } from "@/modules/common/is-record";
import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  AnswerOperationCandidateSchema,
  AnswerOperationOutcomeSchema,
  AnswerOperationPresentationSchema,
  AnswerOperationSelectionSchema,
  answerOperationCandidateSetDigest,
  projectAnswerOperationComparison,
  projectAnswerOperationPlan,
  type AnswerOperationCandidate,
  type AnswerOperationComparison,
  type AnswerOperationOutcome,
  type AnswerOperationPlan,
  type AnswerOperationPresentation,
  type AnswerOperationSelection,
} from "../answer-schema";
import { decideAnswerOperationResultPrivacy } from "./operation-result-presentation";
import type { KeylessDataAskResolution } from "./keyless-data-ask";
import type {
  AnswerToolCallRecord,
  AnswerToolId,
} from "@/modules/answer-thread/answer-thread.schema";

const OPERATION_TOOL_IDS = new Set<AnswerToolId>([
  "operation.execute",
  "operation.invoke",
]);
export function answerOperationDescriptorMaterialDigest<
  T extends {
    readonly availability: {
      readonly posture: unknown;
      readonly observedAt?: number;
      readonly validUntil?: number;
    };
  },
>(descriptor: T): string {
  const {
    observedAt: _observedAt,
    validUntil: _validUntil,
    ...materialAvailability
  } = descriptor.availability;
  return canonicalDigest({
    ...descriptor,
    availability: materialAvailability,
  }).toString();
}

export type AnswerOperationArtifacts = Readonly<{
  candidates: readonly AnswerOperationCandidate[];
  candidateSetDigest?: string;
  comparison?: AnswerOperationComparison;
  outcome?: AnswerOperationOutcome;
  plan?: AnswerOperationPlan;
  selection?: AnswerOperationSelection;
}>;

export function buildOperationArtifactsFromToolCalls(
  records: readonly AnswerToolCallRecord[],
  keylessDataAsk?: KeylessDataAskResolution,
  frozenPresentation?: Readonly<{
    operationRef: string
    presentation: AnswerOperationPresentation
  }>,
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
  const comparison = readOperationComparison(records);
  const outcome = readOperationOutcome(records, frozenPresentation);
  const plan = readOperationPlan(records);
  const selection = readOperationSelection(
    records,
    candidates,
    digest,
    outcome?.resultDigest,
  );
  return {
    candidates,
    ...(digest === undefined ? {} : { candidateSetDigest: digest }),
    ...(comparison === undefined ? {} : { comparison }),
    ...(outcome === undefined ? {} : { outcome }),
    ...(plan === undefined ? {} : { plan }),
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

type OperationArtifactDescriptor =
  | OperationSurfaceWireDescriptor
  | PublicOperationDescriptor;

function readCanonicalOperationDescriptors(
  records: readonly AnswerToolCallRecord[],
): readonly OperationArtifactDescriptor[] {
  const descriptors: OperationArtifactDescriptor[] = [];
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
): readonly OperationArtifactDescriptor[] {
  switch (value.kind) {
    case "found":
      return isOperationArtifactDescriptor(value.operation)
        ? [value.operation]
        : [];
    case "ok":
      if (isOperationArtifactDescriptorArray(value.items))
        return value.items;
      if (isOperationArtifactDescriptorArray(value.operations))
        return value.operations;
      return [];
    default:
      return [];
  }
}

function isOperationArtifactDescriptorArray(
  value: unknown,
): value is OperationArtifactDescriptor[] {
  return Array.isArray(value) && value.every(isOperationArtifactDescriptor);
}

function isOperationArtifactDescriptor(
  value: unknown,
): value is OperationArtifactDescriptor {
  if (
    !isRecord(value) ||
    typeof value.operationRef !== "string" ||
    typeof value.operationId !== "string" ||
    typeof value.summary !== "string" ||
    !isRecord(value.contract) ||
    (typeof value.contract.inputJsonSchema !== "string" &&
      !isRecord(value.contract.inputJsonSchema)) ||
    (typeof value.contract.outputJsonSchema !== "string" &&
      !isRecord(value.contract.outputJsonSchema)) ||
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

function readOperationComparison(
  records: readonly AnswerToolCallRecord[],
): AnswerOperationComparison | undefined {
  for (const record of records.toReversed()) {
    if (record.toolId !== 'registry.operations.compare' || record.status !== 'complete') {
      continue
    }
    try {
      const comparison = projectAnswerOperationComparison(JSON.parse(record.resultJson))
      if (comparison !== undefined) return comparison
    } catch {
      continue
    }
  }
  return undefined
}

function readOperationPlan(
  records: readonly AnswerToolCallRecord[],
): AnswerOperationPlan | undefined {
  for (const record of records.toReversed()) {
    if (record.toolId !== 'registry.operations.inspectPlan' || record.status !== 'complete') {
      continue
    }
    try {
      const plan = projectAnswerOperationPlan(JSON.parse(record.resultJson))
      if (plan !== undefined) return plan
    } catch {
      continue
    }
  }
  return undefined
}

function readOperationOutcome(
  records: readonly AnswerToolCallRecord[],
  frozenPresentation?: Readonly<{
    operationRef: string
    presentation: AnswerOperationPresentation
  }>,
): AnswerOperationOutcome | undefined {
  for (let recordIndex = records.length - 1; recordIndex >= 0; recordIndex -= 1) {
    const record = records[recordIndex]
    if (record === undefined || !OPERATION_TOOL_IDS.has(record.toolId)) continue
    let rawResult: unknown
    try {
      rawResult = JSON.parse(record.resultJson)
    } catch {
      continue
    }
    if (!isRecord(rawResult)) continue
    const operationRef =
      typeof rawResult.operationRef === 'string'
        ? rawResult.operationRef
        : operationRefFromInput(record.inputJson)
    if (operationRef === undefined) continue
    const decision = decideAnswerOperationResultPrivacy(operationRef, rawResult)
    const result = decision.result
    const presentation =
      frozenPresentation?.operationRef === operationRef
        ? {
            ...frozenPresentation.presentation,
            observedAt: record.createdAt,
          }
        : readOperationPresentation(
            records,
            operationRef,
            record.createdAt,
            recordIndex,
          )
    const candidate = AnswerOperationOutcomeSchema.safeParse({
      toolId: record.toolId,
      operationRef,
      resultDigest: decision.resultDigest,
      toolCallDigest: record.resultHash,
      ...(presentation === undefined ? {} : { presentation }),
      result,
    })
    if (candidate.success) return candidate.data
  }
  return undefined
}
function readOperationPresentation(
  records: readonly AnswerToolCallRecord[],
  operationRef: string,
  observedAt: number,
  beforeIndex: number,
): AnswerOperationPresentation | undefined {
  for (let recordIndex = beforeIndex - 1; recordIndex >= 0; recordIndex -= 1) {
    const record = records[recordIndex];
    if (record === undefined
      || record.toolId !== "registry.operations.detail"
      || record.status !== "complete"
      || record.createdAt > observedAt) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.resultJson);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    const descriptor = operationSurfaceDescriptors(parsed).find(
      (item) => item.operationRef === operationRef,
    );
    if (descriptor === undefined) continue;
    try {
      const publicDescriptor =
        typeof descriptor.contract.inputJsonSchema === "string"
          ? deserializeOperationDescriptor(
              descriptor as OperationSurfaceWireDescriptor,
            )
          : (descriptor as PublicOperationDescriptor);
      const presentation = AnswerOperationPresentationSchema.safeParse({
        descriptorDigest:
          answerOperationDescriptorMaterialDigest(publicDescriptor),
        operationLabel: publicDescriptor.offering.label.slice(0, 200),
        sourceLabel: publicDescriptor.business.name.slice(0, 200),
        outputSchemaDigest: canonicalDigest(
          publicDescriptor.contract.outputJsonSchema,
        ).toString(),
        outputAnnotations: publicDescriptor.contract.customerAnnotations
          .filter((annotation) => annotation.document === "output")
          .slice(0, 128)
          .map((annotation) => ({
            pointer: annotation.pointer.slice(0, 1_024),
            label: annotation.label.slice(0, 200),
            role: annotation.role,
            ...(annotation.semanticIdentity === undefined
              ? {}
              : {
                  semanticIdentity: annotation.semanticIdentity.slice(0, 256),
                }),
          })),
        actor: "ae_runtime",
        observedAt,
      });
      if (presentation.success) return presentation.data;
    } catch {
      continue;
    }
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
      descriptorDigest: answerOperationDescriptorMaterialDigest(descriptor),
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
  descriptor: OperationArtifactDescriptor,
  rank: number,
  selectedRef?: string,
): AnswerOperationCandidate | undefined {
  try {
    const publicDescriptor =
      typeof descriptor.contract.inputJsonSchema === "string"
        ? deserializeOperationDescriptor(descriptor as OperationSurfaceWireDescriptor)
        : (descriptor as PublicOperationDescriptor);
    return answerOperationCandidateFromPublicDescriptor(
      publicDescriptor,
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
