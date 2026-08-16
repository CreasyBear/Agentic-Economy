import {
  answerOperationCandidateFromPublicDescriptor,
  answerOperationDescriptorMaterialDigest,
} from './operation-artifacts'
import { canonicalDigest, isCanonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import { isRecord } from '@/modules/common/is-record'
import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  answerOperationCandidateSetDigest,
  type AnswerContinuation,
  type AnswerOperationCandidate,
} from '../answer-schema'
import {
  isPublicOperationRef,
  isAnonymousKeylessOperationEligible,
  operationDetailOutputSchema,
  type PublicOperationDescriptor,
  type PublicOperationParameter,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'
import {
  operationExecutionBindingDigest,
  type OperationExecutableDescriptor,
} from '@/modules/capability-execution/operation-execute.functions'
import type {
  KeylessExecutableSourcePort,
  KeylessExecutableToolDescriptor,
} from '@/modules/capability-execution/operation-execute.actions'
import { findStrictToolSchemaViolation } from '@/modules/harness/strict-schema'
export type KeylessDataAskDecisionCandidate = AnswerOperationCandidate

export type KeylessDataAskClarificationStatus = 'changed' | 'unavailable'


export type KeylessDataAskDecision = Readonly<{
  kind: 'choose_operation'
  candidates: readonly KeylessDataAskDecisionCandidate[]
  candidateSetDigest: string
  status?: KeylessDataAskClarificationStatus
  invalidOperationRef?: string
}>

export type KeylessDataAskResolution =
  | Readonly<{
      kind: 'resolved'
      descriptors: readonly KeylessExecutableToolDescriptor[]
      candidates: readonly KeylessExecutableToolDescriptor[]
      selected?: KeylessExecutableToolDescriptor
      /** Rich registry projections are kept outside executable descriptors. */
      operationCandidates?: readonly AnswerOperationCandidate[]
      selectedCandidate?: AnswerOperationCandidate
      candidateSetDigest?: string
    }>
  | Readonly<{
      kind: 'needs_clarification'
      descriptors: readonly KeylessExecutableToolDescriptor[]
      candidates: readonly KeylessExecutableToolDescriptor[]
      /** Rich registry projections are kept outside executable descriptors. */
      operationCandidates?: readonly AnswerOperationCandidate[]
      decision: KeylessDataAskDecision
    }>
  | Readonly<{
      kind: 'unavailable'
      reason: 'source_unavailable' | 'duplicate_operation_ref'
    }>
const MAX_CANDIDATES = ANSWER_OPERATION_CANDIDATE_LIMIT

function parametersFromSchema(
  schema: Record<string, JsonValue>,
): Pick<AnswerOperationCandidate, 'requiredParameters' | 'optionalParameters'> {
  const required = new Set(Array.isArray(schema.required)
    ? schema.required.filter((value): value is string => typeof value === 'string')
    : [])
  const properties = schema.properties !== undefined && isJsonObject(schema.properties)
    ? schema.properties
    : {}
  const parameters = Object.entries(properties).slice(0, 32).flatMap(([name, value]) => {
    const property = isJsonObject(value) ? value : undefined
    if (property === undefined) return []
    const type = typeof property.type === 'string' ? property.type : 'value'
    const description = typeof property.description === 'string' ? property.description : undefined
    const example = property.example
    const enumValues = Array.isArray(property.enum)
      ? property.enum.filter((item): item is string => typeof item === 'string')
      : undefined
    const defaultValue = property.default
    const style: 'form' | 'simple' | undefined = property.style === 'form'
      ? 'form'
      : property.style === 'simple'
        ? 'simple'
        : undefined
    const explode = typeof property.explode === 'boolean' ? property.explode : undefined
    return [{
      group: 'body' as const,
      name,
      type,
      ...(description === undefined ? {} : { description }),
      ...(example === undefined ? {} : { example }),
      ...(enumValues === undefined || enumValues.length === 0 ? {} : { enumValues }),
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
      ...(style === undefined ? {} : { style }),
      ...(explode === undefined ? {} : { explode }),
      required: required.has(name),
    }]
  })
  return {
    requiredParameters: parameters.filter(
      (parameter): parameter is typeof parameter & { required: true } => parameter.required,
    ),
    optionalParameters: parameters.filter(
      (parameter): parameter is typeof parameter & { required: false } => !parameter.required,
    ),
  }
}
function parametersFromPublicDescriptor(
  parameters: readonly PublicOperationParameter[],
): Pick<AnswerOperationCandidate, 'requiredParameters' | 'optionalParameters'> {
  const cloned = parameters.slice(0, 32).map((parameter) => ({
    group: parameter.group,
    name: parameter.name,
    type: parameter.type,
    ...(parameter.description === undefined ? {} : { description: parameter.description }),
    ...(parameter.example === undefined ? {} : { example: parameter.example }),
    ...(parameter.enumValues === undefined ? {} : { enumValues: [...parameter.enumValues] }),
    ...(parameter.default === undefined ? {} : { default: parameter.default }),
    required: parameter.required,
    ...(parameter.style === undefined ? {} : { style: parameter.style }),
    ...(parameter.explode === undefined ? {} : { explode: parameter.explode }),
  }))
  const requiredParameters: AnswerOperationCandidate['requiredParameters'] = []
  const optionalParameters: AnswerOperationCandidate['optionalParameters'] = []
  for (const parameter of cloned) {
    if (parameter.required) {
      requiredParameters.push({ ...parameter, required: true })
    } else {
      optionalParameters.push({ ...parameter, required: false })
    }
  }
  return { requiredParameters, optionalParameters }
}


function cloneJsonRecord(value: Readonly<Record<string, unknown>>): Record<string, JsonValue> | undefined {
  const parsed = jsonValueSchema.safeParse(value)
  if (!parsed.success || !isRecord(parsed.data)) return undefined
  return structuredClone(parsed.data) as Record<string, JsonValue>
}

function candidateFromDescriptor(
  descriptor: KeylessExecutableToolDescriptor,
  rank: number,
  operation?: PublicOperationDescriptor,
): AnswerOperationCandidate {
  if (operation !== undefined) {
    const canonical = answerOperationCandidateFromPublicDescriptor(operation, rank, {
      includeInputSchema: true,
      ...(descriptor.executionBindingDigest === undefined ? {} : { executionBindingDigest: descriptor.executionBindingDigest }),
    })
    if (canonical !== undefined) {
      return canonical
    }
  }
  const inputSchema = operation?.contract.inputJsonSchema ?? descriptor.inputSchema
  const inputJsonSchema = cloneJsonRecord(inputSchema)
  const operationId = operation?.operationId ?? descriptor.capabilityId
  const business = operation?.business ?? {
    businessId: `capability:${descriptor.capabilityId}`,
    slug: descriptor.capabilityId,
    name: descriptor.name,
  }
  const offering = operation?.offering ?? {
    offeringRef: `offering:${descriptor.capabilityId}`,
    revision: 1,
    label: descriptor.name,
    summary: descriptor.summary,
  }
  const availability = operation?.availability ?? { posture: 'routeable' as const }
  const commercial = operation?.commercial ?? {
    price: { kind: 'on_request' as const },
    materialTerms: [],
    relationship: { kind: 'none' as const, summary: 'No published commercial relationship.' },
  }
  const provenance = operation?.provenance ?? {
    publisher: 'ae_curated_external' as const,
    sourceKind: 'openapi_http' as const,
  }
  const schemaParameters: Pick<AnswerOperationCandidate, 'requiredParameters' | 'optionalParameters'> = inputJsonSchema === undefined
    ? { requiredParameters: [], optionalParameters: [] }
    : parametersFromSchema(inputJsonSchema)
  const parameterSets = operation?.parameters === undefined
    ? schemaParameters
    : parametersFromPublicDescriptor(operation.parameters)
  const requiredParameters = parameterSets.requiredParameters
  const optionalParameters = parameterSets.optionalParameters
  const candidate: AnswerOperationCandidate = {
    rank,
    operationRef: descriptor.operationRef as AnswerOperationCandidate['operationRef'],
    operationId,
    descriptorDigest: answerOperationDescriptorMaterialDigest(operation ?? {
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.capabilityId,
      name: descriptor.name,
      summary: descriptor.summary,
      inputSchema,
      availability,
      commercial,
      provenance,
    }),
    ...(descriptor.executionBindingDigest === undefined ? {} : { executionBindingDigest: descriptor.executionBindingDigest }),
    business,
    offering,
    matchReason: 'canonical_operation_surface',
    summary: (operation?.summary ?? descriptor.summary).slice(0, 400),
    availability,
    commercial: {
      price: commercial.price,
      ...(commercial.priceEvidence === undefined ? {} : { priceEvidence: { ...commercial.priceEvidence, evidenceRefs: [...commercial.priceEvidence.evidenceRefs] } }),
      materialTerms: commercial.materialTerms.map((term) => ({ label: term.label, value: term.value })),
      relationship: { ...commercial.relationship },
    },
    requiredParameters,
    optionalParameters,
    inputSchemaDigest: canonicalDigest(inputSchema).toString(),
    ...(inputJsonSchema === undefined ? {} : { inputJsonSchema }),
    exactRebindRequired: inputJsonSchema === undefined,
    authority: {
      publisher: provenance.publisher,
      sourceKind: provenance.sourceKind,
      authentication: operation === undefined ? { kind: 'keyless' as const } : { ...operation.authentication },
    },
    dataUse: (operation?.dataUse ?? []).slice(0, 12).map((policy) => ({
      effectId: policy.effectId,
      inputPointer: policy.inputPointer,
      classification: policy.classification,
      phase: policy.phase,
      recipient: policy.recipient,
      purposes: [...policy.purposes],
    })),
    effects: (operation?.effects ?? []).slice(0, 12).map((effect) => ({ ...effect })),
    evidence: (operation?.evidence ?? []).slice(0, 12).map((item) => ({ ...item })),
    recovery: operation?.recovery === undefined
      ? { idempotency: 'not_applicable' as const, recovery: 'retry_safe' as const }
      : { ...operation.recovery },
    navigation: (operation?.navigation ?? []).slice(0, 12).map((relation) => {
      const relationInputSchema = relation.inputSchema === undefined
        ? undefined
        : cloneJsonRecord(relation.inputSchema)
      return {
        relation: relation.relation,
        ...(relation.pathTemplate === undefined ? {} : { pathTemplate: relation.pathTemplate }),
        method: relation.method,
        actionId: relation.actionId,
        authentication: relation.authentication,
        ...(relationInputSchema === undefined ? {} : { inputSchema: relationInputSchema }),
        ...(relation.surfaces === undefined ? {} : { surfaces: [...relation.surfaces] }),
        ...(relation.precondition === undefined ? {} : { precondition: relation.precondition }),
      }
    }),
  }
  return candidate
}




/**
 * Rebinds one operation ref from a completed exact registry detail result to
 * the current anonymous executable descriptor. Detail evidence is only
 * accepted when the optional current public reread has the same descriptor
 * digest; executable authority and input schema come from `source.read`.
 */
export async function rebindKeylessDataAskFromRegistryDetail(
  operationRef: string,
  result: unknown,
  source: KeylessExecutableSourcePort,
): Promise<KeylessDataAskResolution> {
  try {
    if (!isPublicOperationRef(operationRef)) {
      return { kind: 'unavailable', reason: 'source_unavailable' }
    }
    const detail = operationDetailOutputSchema.safeParse(result)
    if (
      !detail.success
      || detail.data.kind !== 'found'
      || detail.data.operation.operationRef !== operationRef
    ) {
      return { kind: 'unavailable', reason: 'source_unavailable' }
    }
    const detailOperation = detail.data.operation
    const detailDescriptorDigest = answerOperationDescriptorMaterialDigest(detailOperation)

    let executable: OperationExecutableDescriptor | null
    try {
      executable = await source.read(operationRef)
    } catch {
      return { kind: 'unavailable', reason: 'source_unavailable' }
    }
    if (
      executable === null
      || executable.operationRef !== operationRef
      || !isAnonymousKeylessOperationEligible({
        authority: executable.authority,
        adapterId: executable.adapterId,
        method: executable.method,
        sourceKind: executable.provenance.sourceKind,
        price: executable.price,
        effects: executable.effects,
      })
      || findStrictToolSchemaViolation(executable.inputSchema) !== null
    ) {
      return { kind: 'unavailable', reason: 'source_unavailable' }
    }

    let publicOperation = detailOperation
    if (source.readPublic !== undefined) {
      let reread: PublicOperationDescriptor | null
      try {
        reread = await source.readPublic(operationRef)
      } catch {
        return { kind: 'unavailable', reason: 'source_unavailable' }
      }
      const current = operationDetailOutputSchema.safeParse({
        kind: 'found',
        schemaVersion: 'registry-operations:v1',
        operation: reread,
      })
      if (
        !current.success
        || current.data.kind !== 'found'
        || current.data.operation.operationRef !== operationRef
        || answerOperationDescriptorMaterialDigest(current.data.operation) !== detailDescriptorDigest
      ) {
        return { kind: 'unavailable', reason: 'source_unavailable' }
      }
      publicOperation = current.data.operation
    }

    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef,
      capabilityId: executable.capabilityId,
      name: executable.name,
      summary: publicOperation.summary,
      searchTerms: [publicOperation.operationId, executable.capabilityId, executable.name],
      inputSchema: executable.inputSchema,
      publicOperation,
      executionBindingDigest: operationExecutionBindingDigest(executable),
      ...(publicOperation.contract.inputExamples === undefined
        ? {}
        : { inputExamples: publicOperation.contract.inputExamples }),
    }
    const candidate = candidateFromDescriptor(descriptor, 1, publicOperation)
    const operationCandidates = [candidate]
    return {
      kind: 'resolved',
      descriptors: [descriptor],
      candidates: [descriptor],
      operationCandidates,
      selected: descriptor,
      selectedCandidate: candidate,
      candidateSetDigest: answerOperationCandidateSetDigest(operationCandidates),
    }
  } catch {
    return { kind: 'unavailable', reason: 'source_unavailable' }
  }
}

function descriptorFromCandidate(candidate: AnswerOperationCandidate): KeylessExecutableToolDescriptor | undefined {
  if (candidate.inputJsonSchema === undefined) return undefined
  return {
    operationRef: candidate.operationRef,
    capabilityId: candidate.operationId,
    name: candidate.offering.label,
    summary: candidate.summary,
    searchTerms: [
      candidate.operationId,
      candidate.business.name,
      candidate.business.slug,
      candidate.offering.label,
    ],
    inputSchema: candidate.inputJsonSchema,
    ...(candidate.executionBindingDigest === undefined ? {} : { executionBindingDigest: candidate.executionBindingDigest }),
  }
}


function isJsonObject(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export const ANSWER_OPERATION_INPUT_MAX_BYTES = 256 * 1024

export type AnswerOperationSelectionInput = Readonly<{
  operationRef: PublicOperationRef
  input: Record<string, JsonValue>
  candidateSetDigest: string
}>

export function parseAnswerOperationSelectionInput(query: string): AnswerOperationSelectionInput | undefined {
  if (new TextEncoder().encode(query).byteLength > ANSWER_OPERATION_INPUT_MAX_BYTES) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(query)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)
    || Object.keys(parsed).some((key) => key !== 'operationRef' && key !== 'input' && key !== 'candidateSetDigest')
    || !isPublicOperationRef(parsed.operationRef)
    || typeof parsed.candidateSetDigest !== 'string'
    || !isCanonicalDigest(parsed.candidateSetDigest)
    || !isRecord(parsed.input)) {
    return undefined
  }
  const input = jsonValueSchema.safeParse(parsed.input)
  return input.success && isJsonObject(input.data)
    ? { operationRef: parsed.operationRef, input: input.data, candidateSetDigest: parsed.candidateSetDigest }
    : undefined
}



function needsClarificationForCandidates(
  candidates: readonly AnswerOperationCandidate[],
  status?: KeylessDataAskClarificationStatus,
  invalidOperationRef?: string,
): KeylessDataAskResolution {
  const uniqueCandidates = candidates
    .filter((candidate, index, all) =>
      all.findIndex((other) => other.operationRef === candidate.operationRef) === index)
    .slice(0, MAX_CANDIDATES)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
  const descriptors = uniqueCandidates.flatMap((candidate) => descriptorFromCandidate(candidate) ?? [])
  const operationCandidates = uniqueCandidates.length === 0 ? {} : { operationCandidates: uniqueCandidates }
  return {
    kind: 'needs_clarification',
    descriptors,
    candidates: descriptors,
    ...operationCandidates,
    decision: {
      kind: 'choose_operation',
      candidates: uniqueCandidates,
      candidateSetDigest: answerOperationCandidateSetDigest(uniqueCandidates),
      ...(status === undefined ? {} : { status }),
      ...(invalidOperationRef === undefined ? {} : { invalidOperationRef }),
    },
  }
}
export function keylessDataAskFromCandidates(
  candidates: readonly AnswerOperationCandidate[],
  status?: KeylessDataAskClarificationStatus,
): KeylessDataAskResolution {
  return needsClarificationForCandidates(candidates, status)
}

/**
 * Rebinds one explicit structured selection against the candidate set frozen
 * by the prior answer. Natural-language text is never interpreted here.
 */
export async function resolveKeylessDataAskSelection(
  query: string,
  previousCandidates: readonly AnswerOperationCandidate[],
  source: KeylessExecutableSourcePort,
): Promise<KeylessDataAskResolution | undefined> {
  if (previousCandidates.length === 0) return undefined
  const parsedSelection = parseAnswerOperationSelectionInput(query)
  if (parsedSelection === undefined) return undefined

  const frozenCandidates = previousCandidates.slice(0, MAX_CANDIDATES)
  const candidateSetDigest = answerOperationCandidateSetDigest(frozenCandidates)
  if (parsedSelection.candidateSetDigest !== candidateSetDigest) {
    return needsClarificationForCandidates(frozenCandidates, 'changed')
  }

  const uniqueCandidates = frozenCandidates
  const selectedCandidate = uniqueCandidates.find(
    (candidate) => candidate.operationRef === parsedSelection.operationRef,
  )
  if (selectedCandidate === undefined) {
    return needsClarificationForCandidates(
      uniqueCandidates,
      undefined,
      parsedSelection.operationRef,
    )
  }
  const invalidCandidateSet = uniqueCandidates.filter(
    (candidate) => candidate.operationRef !== selectedCandidate.operationRef,
  )

  let executable: OperationExecutableDescriptor | null
  try {
    executable = await source.read(selectedCandidate.operationRef)
  } catch {
    executable = null
  }
  if (executable === null
    || executable.operationRef !== selectedCandidate.operationRef
    || !isAnonymousKeylessOperationEligible({
      authority: executable.authority,
      adapterId: executable.adapterId,
      method: executable.method,
      sourceKind: executable.provenance.sourceKind,
      price: executable.price,
      effects: executable.effects,
    })) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'unavailable',
      selectedCandidate.operationRef,
    )
  }
  if (findStrictToolSchemaViolation(executable.inputSchema) !== null) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'changed',
      selectedCandidate.operationRef,
    )
  }

  let publicOperation: PublicOperationDescriptor | undefined
  if (source.readPublic !== undefined) {
    try {
      publicOperation = (await source.readPublic(selectedCandidate.operationRef)) ?? undefined
    } catch {
      return needsClarificationForCandidates(
        invalidCandidateSet,
        'unavailable',
        selectedCandidate.operationRef,
      )
    }
    if (publicOperation === undefined
      || publicOperation.operationRef !== selectedCandidate.operationRef
      || publicOperation.availability.posture === 'unavailable'
      || findStrictToolSchemaViolation(publicOperation.contract.inputJsonSchema) !== null) {
      return needsClarificationForCandidates(
        invalidCandidateSet,
        'unavailable',
        selectedCandidate.operationRef,
      )
    }
  }

  const currentDescriptor: KeylessExecutableToolDescriptor = {
    operationRef: executable.operationRef,
    capabilityId: executable.capabilityId,
    name: executable.name,
    summary: publicOperation?.summary ?? executable.name,
    searchTerms: [
      ...(publicOperation === undefined ? [] : [publicOperation.operationId]),
      executable.capabilityId,
      executable.name,
    ],
    inputSchema: cloneJsonRecord(executable.inputSchema) ?? executable.inputSchema,
    ...(publicOperation === undefined ? {} : { publicOperation }),
    ...(publicOperation?.contract.inputExamples === undefined
      ? {}
      : { inputExamples: publicOperation.contract.inputExamples }),
    executionBindingDigest: operationExecutionBindingDigest(executable),
  }
  const selectedIndex = uniqueCandidates.findIndex(
    (candidate) => candidate.operationRef === selectedCandidate.operationRef,
  )
  const currentCandidate = candidateFromDescriptor(
    currentDescriptor,
    selectedIndex + 1,
    publicOperation,
  )
  const executableInputSchemaDigest = canonicalDigest(executable.inputSchema).toString()
  const publicInputSchemaDigest = publicOperation === undefined
    ? undefined
    : canonicalDigest(publicOperation.contract.inputJsonSchema).toString()
  if (executableInputSchemaDigest !== selectedCandidate.inputSchemaDigest
    || (publicInputSchemaDigest !== undefined
      && publicInputSchemaDigest !== selectedCandidate.inputSchemaDigest)
    || (publicOperation !== undefined
      && currentCandidate.descriptorDigest !== selectedCandidate.descriptorDigest)
    || currentCandidate.executionBindingDigest !== selectedCandidate.executionBindingDigest) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'changed',
      selectedCandidate.operationRef,
    )
  }

  const reboundCandidates = uniqueCandidates.map((candidate) =>
    candidate.operationRef === selectedCandidate.operationRef
      ? {
          ...currentCandidate,
          rank: candidate.rank,
          matchReason: candidate.matchReason,
        }
      : candidate)
  const reboundDigest = answerOperationCandidateSetDigest(reboundCandidates)
  if (reboundDigest !== parsedSelection.candidateSetDigest) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'changed',
      selectedCandidate.operationRef,
    )
  }
  const candidateDescriptors = reboundCandidates.flatMap(
    (candidate) => descriptorFromCandidate(candidate) ?? [],
  )
  const reboundCandidate = reboundCandidates.find(
    (candidate) => candidate.operationRef === selectedCandidate.operationRef,
  )
  if (reboundCandidate === undefined) {
    return needsClarificationForCandidates(
      invalidCandidateSet,
      'changed',
      selectedCandidate.operationRef,
    )
  }
  return deepFreeze({
    kind: 'resolved' as const,
    descriptors: [currentDescriptor],
    candidates: candidateDescriptors,
    selected: currentDescriptor,
    operationCandidates: reboundCandidates,
    selectedCandidate: reboundCandidate,
    candidateSetDigest: reboundDigest,
  })
}
/**
 * Reuses one frozen operation only when structured request interpretation says
 * the user is refining it or resolving its pending decision. Natural-language
 * prefixes are deliberately not an authority for capability reuse.
 */
export async function resolveKeylessDataAskFromInterpretation(
  continuation: AnswerContinuation,
  previousCandidates: readonly AnswerOperationCandidate[],
  selectedOperationRef: string | undefined,
  source: KeylessExecutableSourcePort,
): Promise<KeylessDataAskResolution | undefined> {
  if (
    continuation !== 'refine_prior_operation'
    && continuation !== 'resolve_pending'
  ) {
    return undefined
  }
  const continuationCandidates =
    selectedOperationRef === undefined
      ? previousCandidates
      : previousCandidates.filter(
          (candidate) => candidate.operationRef === selectedOperationRef,
        )
  if (continuationCandidates.length !== 1) return undefined
  const candidate = continuationCandidates[0]
  if (candidate === undefined) return undefined
  if (continuation === 'resolve_pending') {
    const descriptor = descriptorFromCandidate(candidate)
    if (descriptor === undefined) return undefined
    return deepFreeze({
      kind: 'resolved' as const,
      descriptors: [descriptor],
      candidates: [descriptor],
      operationCandidates: continuationCandidates,
      selected: descriptor,
      selectedCandidate: candidate,
      candidateSetDigest:
        answerOperationCandidateSetDigest(continuationCandidates),
    })
  }
  return resolveKeylessDataAskSelection(
    JSON.stringify({
      operationRef: candidate.operationRef,
      input: {},
      candidateSetDigest: answerOperationCandidateSetDigest(
        continuationCandidates,
      ),
    }),
    continuationCandidates,
    source,
  )
}
