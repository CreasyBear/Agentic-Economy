import { describe, expect, it, vi } from 'vitest'

import {
  operationExecutionBindingDigest,
  type KeylessExecutableSourcePort,
  type KeylessExecutableToolDescriptor,
  type OperationExecutableDescriptor,
} from '@/modules/capability-execution'
import {
  isPublicOperationRef,
  type PublicOperationDescriptor,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import type { JsonValue } from '@/modules/capability-contract/public'
import {
  ANSWER_OPERATION_INPUT_MAX_BYTES,
  keylessDataAskFromCandidates,
  parseAnswerOperationSelectionInput,
  rebindKeylessDataAskFromRegistryDetail,
  resolveKeylessDataAskFromInterpretation,
  resolveKeylessDataAskSelection,
} from '@/modules/answer/internal/keyless-data-ask'
import {
  answerOperationCandidateFromPublicDescriptor,
  answerOperationDescriptorMaterialDigest,
  buildOperationArtifactsFromToolCalls,
} from '@/modules/answer/internal/operation-artifacts'
import {
  AnswerOperationCandidateSchema,
  AnswerOperationOutcomeSchema,
  answerOperationCandidateSetDigest,
} from '@/modules/answer/answer-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const valueInputSchema: Readonly<Record<string, JsonValue>> = {
  type: 'object',
  properties: { value: { type: 'string' } },
  required: ['value'],
  additionalProperties: false,
}

const alphaRefText = `operation:v1:${'a'.repeat(64)}`
const betaRefText = `operation:v1:${'b'.repeat(64)}`
if (!isPublicOperationRef(alphaRefText) || !isPublicOperationRef(betaRefText)) {
  throw new Error('test_operation_ref_invalid')
}
const alphaRef: PublicOperationRef = alphaRefText
const betaRef: PublicOperationRef = betaRefText

const alphaDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: alphaRef,
  capabilityId: 'alpha.weather',
  name: 'Alpha Weather',
  summary: 'Shared weather feed',
  searchTerms: ['weather'],
  inputSchema: valueInputSchema,
}

const betaDescriptor: KeylessExecutableToolDescriptor = {
  operationRef: betaRef,
  capabilityId: 'beta.weather',
  name: 'Beta Weather',
  summary: 'Shared weather feed',
  searchTerms: ['weather'],
  inputSchema: valueInputSchema,
}

function publicOperationFor(
  operationRef: PublicOperationRef,
  descriptor: KeylessExecutableToolDescriptor,
): PublicOperationDescriptor {
  return {
    operationRef,
    operationId: `operation:${descriptor.capabilityId}`,
    callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
    paymentLane: 'brokered',
    contract: {
      capabilityId: descriptor.capabilityId,
      version: 1,
      inputJsonSchema: valueInputSchema,
      outputJsonSchema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      },
      customerAnnotations: [{
        annotationId: 'value',
        document: 'input',
        pointer: '/value',
        label: 'Requested value',
        role: 'request',
      }],
    },
    business: {
      businessId: `business:${descriptor.capabilityId}`,
      slug: descriptor.capabilityId,
      name: descriptor.name,
    },
    offering: {
      offeringRef: `offering:${descriptor.capabilityId}`,
      revision: 1,
      label: descriptor.name,
      summary: descriptor.summary,
    },
    summary: descriptor.summary,
    commercial: {
      price: {
        kind: 'fixed',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No published commercial relationship.' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    cancellation: { kind: 'unsupported' },
    recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    authentication: { kind: 'keyless' },
    transport: { method: 'GET', requestTimeoutMs: 5_000 },
    provenance: { publisher: 'ae_curated_external', sourceKind: 'openapi_http' },
    availability: { posture: 'routeable' },
    navigation: [{
      relation: 'execute',
      method: 'POST',
      actionId: 'operation.execute',
      authentication: 'none',
      surfaces: ['answerThread'],
    }],
  }
}

function executableDescriptor(
  descriptor: KeylessExecutableToolDescriptor,
  overrides: Partial<OperationExecutableDescriptor> = {},
): OperationExecutableDescriptor {
  return {
    operationRef: descriptor.operationRef,
    capabilityId: descriptor.capabilityId,
    name: descriptor.name,
    endpointUrl: `https://api.example.test/${descriptor.capabilityId}`,
    authority: { kind: 'keyless' },
    adapterId: 'http-json:v1',
    price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
    effects: [],
    method: 'GET',
    query: [{ inputPointer: '/value', parameter: 'value' }],
    requestTimeoutMs: 5_000,
    inputSchema: descriptor.inputSchema,
    provenance: { publisher: 'provider_owned', sourceKind: 'openapi_http' },
    ...overrides,
  }
}

function candidateFor(
  operation: PublicOperationDescriptor,
  executable: OperationExecutableDescriptor,
  rank: number,
) {
  const candidate = answerOperationCandidateFromPublicDescriptor(operation, rank, {
    includeInputSchema: true,
    executionBindingDigest: operationExecutionBindingDigest(executable),
  })
  if (candidate === undefined) throw new Error('expected valid operation candidate fixture')
  return candidate
}

function selectionFixture() {
  const alphaOperation = publicOperationFor(alphaRef, alphaDescriptor)
  const betaOperation = publicOperationFor(betaRef, betaDescriptor)
  const alphaExecutable = executableDescriptor(alphaDescriptor)
  const betaExecutable = executableDescriptor(betaDescriptor)
  const candidates = [
    candidateFor(alphaOperation, alphaExecutable, 1),
    candidateFor(betaOperation, betaExecutable, 2),
  ]
  const currentExecutables = new Map<string, OperationExecutableDescriptor>([
    [alphaRef, alphaExecutable],
    [betaRef, betaExecutable],
  ])
  const currentPublicOperations = new Map<string, PublicOperationDescriptor>([
    [alphaRef, alphaOperation],
    [betaRef, betaOperation],
  ])
  const read = vi.fn(async (operationRef: string) => currentExecutables.get(operationRef) ?? null)
  const readPublic = vi.fn(async (operationRef: string) => currentPublicOperations.get(operationRef) ?? null)
  const search = vi.fn(async () => [])
  const source = {
    list: vi.fn(async () => []),
    read,
    readPublic,
    search,
  } satisfies KeylessExecutableSourcePort
  const initial = keylessDataAskFromCandidates(candidates)
  if (initial.kind !== 'needs_clarification') throw new Error('expected candidate set')
  return {
    alphaOperation,
    betaOperation,
    alphaExecutable,
    betaExecutable,
    candidates,
    initial,
    source,
    read,
    readPublic,
    search,
  }
}

function selectionQuery(
  operationRef: string,
  candidateSetDigest: string,
  input: Record<string, string> = { value: 'Darwin' },
): string {
  return JSON.stringify({ operationRef, input, candidateSetDigest })
}

describe('explicit structured operation selection', () => {
  it('rereads the exact operationRef and returns selected artifacts for the frozen candidate set', async () => {
    const fixture = selectionFixture()
    const query = selectionQuery(betaRef, fixture.initial.decision.candidateSetDigest)

    expect(parseAnswerOperationSelectionInput(query)).toEqual({
      operationRef: betaRef,
      input: { value: 'Darwin' },
      candidateSetDigest: fixture.initial.decision.candidateSetDigest,
    })

    const result = await resolveKeylessDataAskSelection(
      query,
      fixture.initial.decision.candidates,
      fixture.source,
    )

    expect(result?.kind).toBe('resolved')
    if (result?.kind !== 'resolved') throw new Error('expected selected operation')
    expect(result.selected).toMatchObject({
      operationRef: betaRef,
      capabilityId: fixture.betaExecutable.capabilityId,
      inputSchema: fixture.betaExecutable.inputSchema,
      executionBindingDigest: operationExecutionBindingDigest(fixture.betaExecutable),
    })
    expect(result.selectedCandidate).toEqual(fixture.candidates[1])
    expect(result.operationCandidates).toEqual(fixture.candidates)
    expect(result.candidateSetDigest).toBe(fixture.initial.decision.candidateSetDigest)
    expect(fixture.initial.decision.candidateSetDigest).toBe(answerOperationCandidateSetDigest(fixture.candidates))
    expect(result.candidates.map(({ operationRef }) => operationRef)).toEqual([alphaRef, betaRef])
    expect(fixture.read.mock.calls).toEqual([[betaRef]])
    expect(fixture.readPublic.mock.calls).toEqual([[betaRef]])
    expect(fixture.search).not.toHaveBeenCalled()
  })
  it('preserves structured selection when only readiness timestamps refresh', async () => {
    const fixture = selectionFixture()
    fixture.readPublic.mockResolvedValueOnce({
      ...fixture.betaOperation,
      availability: {
        ...fixture.betaOperation.availability,
        observedAt: 100,
        validUntil: 200,
      },
    })

    const result = await resolveKeylessDataAskSelection(
      selectionQuery(betaRef, fixture.initial.decision.candidateSetDigest),
      fixture.initial.decision.candidates,
      fixture.source,
    )

    expect(result?.kind).toBe('resolved')
    if (result?.kind !== 'resolved') throw new Error('expected readiness refresh to preserve selection')
    const frozenCandidate = fixture.candidates[1]
    if (frozenCandidate === undefined) throw new Error('expected frozen beta candidate')
    expect(result.candidateSetDigest).toBe(fixture.initial.decision.candidateSetDigest)
    expect(result.selectedCandidate?.descriptorDigest).toBe(frozenCandidate.descriptorDigest)
    expect(result.selectedCandidate?.availability).toMatchObject({
      posture: 'routeable',
      observedAt: 100,
      validUntil: 200,
    })
  })


  it('reclarifies a stale candidate-set digest before rereading any operation', async () => {
    const fixture = selectionFixture()
    const staleDigest = canonicalDigest({ stale: true }).toString()

    const result = await resolveKeylessDataAskSelection(
      selectionQuery(alphaRef, staleDigest),
      fixture.initial.decision.candidates,
      fixture.source,
    )

    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected stale clarification')
    expect(result.decision.status).toBe('changed')
    expect(result.decision.candidateSetDigest).toBe(fixture.initial.decision.candidateSetDigest)
    expect(result.decision.candidates).toEqual(fixture.initial.decision.candidates)
    expect(fixture.read).not.toHaveBeenCalled()
    expect(fixture.readPublic).not.toHaveBeenCalled()
  })

  it('reclarifies when the current executable input schema no longer matches the frozen candidate', async () => {
    const fixture = selectionFixture()
    fixture.read.mockResolvedValueOnce({
      ...fixture.betaExecutable,
      inputSchema: {
        type: 'object',
        properties: { changed: { type: 'string' } },
        required: ['changed'],
        additionalProperties: false,
      },
    })

    const result = await resolveKeylessDataAskSelection(
      selectionQuery(betaRef, fixture.initial.decision.candidateSetDigest),
      fixture.initial.decision.candidates,
      fixture.source,
    )

    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected executable mismatch clarification')
    expect(result.decision.status).toBe('changed')
    expect(result.decision.invalidOperationRef).toBe(betaRef)
    expect(result.decision.candidates.map(({ operationRef }) => operationRef)).toEqual([alphaRef])
  })

  it('reclarifies when the current public descriptor digest no longer matches the frozen candidate', async () => {
    const fixture = selectionFixture()
    fixture.readPublic.mockResolvedValueOnce({
      ...fixture.betaOperation,
      summary: 'Changed public descriptor',
    })

    const result = await resolveKeylessDataAskSelection(
      selectionQuery(betaRef, fixture.initial.decision.candidateSetDigest),
      fixture.initial.decision.candidates,
      fixture.source,
    )

    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected public descriptor mismatch clarification')
    expect(result.decision.status).toBe('changed')
    expect(result.decision.invalidOperationRef).toBe(betaRef)
    expect(result.decision.candidates.map(({ operationRef }) => operationRef)).toEqual([alphaRef])
  })

  it('reclarifies when the current executable binding digest no longer matches the frozen candidate', async () => {
    const fixture = selectionFixture()
    fixture.read.mockResolvedValueOnce({
      ...fixture.betaExecutable,
      endpointUrl: 'https://api.example.test/changed-binding',
    })

    const result = await resolveKeylessDataAskSelection(
      selectionQuery(betaRef, fixture.initial.decision.candidateSetDigest),
      fixture.initial.decision.candidates,
      fixture.source,
    )

    expect(result?.kind).toBe('needs_clarification')
    if (result?.kind !== 'needs_clarification') throw new Error('expected binding mismatch clarification')
    expect(result.decision.status).toBe('changed')
    expect(result.decision.invalidOperationRef).toBe(betaRef)
    expect(result.decision.candidates.map(({ operationRef }) => operationRef)).toEqual([alphaRef])
  })

  it('does not expose raw text, ordinal, or name selection', async () => {
    const fixture = selectionFixture()

    expect(parseAnswerOperationSelectionInput('option 2')).toBeUndefined()
    expect(parseAnswerOperationSelectionInput('choose Beta Weather')).toBeUndefined()
    await expect(resolveKeylessDataAskSelection(
      'option 2',
      fixture.initial.decision.candidates,
      fixture.source,
    )).resolves.toBeUndefined()
    expect(fixture.read).not.toHaveBeenCalled()
    expect(fixture.search).not.toHaveBeenCalled()
  })

  it('rejects malformed, non-object, and oversized structured selection envelopes', () => {
    expect(parseAnswerOperationSelectionInput('{"operationRef":')).toBeUndefined()
    expect(parseAnswerOperationSelectionInput(JSON.stringify({
      operationRef: alphaRef,
      input: [],
    }))).toBeUndefined()
    expect(parseAnswerOperationSelectionInput(JSON.stringify({
      operationRef: alphaRef,
      input: { value: 'x'.repeat(ANSWER_OPERATION_INPUT_MAX_BYTES) },
      candidateSetDigest: canonicalDigest({ candidates: [] }).toString(),
    }))).toBeUndefined()
  })
})

describe('structured follow-up operation reuse', () => {
  it('rebinds only the frozen selected operation for an input refinement', async () => {
    const fixture = selectionFixture()

    const result = await resolveKeylessDataAskFromInterpretation(
      'refine_prior_operation',
      fixture.candidates,
      betaRef,
      fixture.source,
    )

    expect(result?.kind).toBe('resolved')
    if (result?.kind !== 'resolved') throw new Error('expected selected operation')
    expect(result.selected?.operationRef).toBe(betaRef)
    expect(result.selectedCandidate).toEqual(fixture.candidates[1])
    expect(result.operationCandidates).toEqual([fixture.candidates[1]])
    expect(fixture.read.mock.calls).toEqual([[betaRef]])
    expect(fixture.readPublic.mock.calls).toEqual([[betaRef]])
    expect(fixture.search).not.toHaveBeenCalled()
  })

  it('does not reuse prior candidates for a new request', async () => {
    const fixture = selectionFixture()

    const result = await resolveKeylessDataAskFromInterpretation(
      'new',
      fixture.candidates,
      betaRef,
      fixture.source,
    )

    expect(result).toBeUndefined()
    expect(fixture.read).not.toHaveBeenCalled()
    expect(fixture.readPublic).not.toHaveBeenCalled()
  })
})


describe('exact registry-detail rebind', () => {
  it('rereads current executable and public detail state and returns canonical selected artifacts', async () => {
    const descriptor = alphaDescriptor
    const operation = publicOperationFor(alphaRef, descriptor)
    const executable = executableDescriptor(descriptor)
    const bindingDigest = operationExecutionBindingDigest(executable)
    const read = vi.fn(async (operationRef: string) => operationRef === descriptor.operationRef ? executable : null)
    const readPublic = vi.fn(async (operationRef: string) => operationRef === descriptor.operationRef ? operation : null)
    const source = {
      list: vi.fn(async () => []),
      read,
      readPublic,
      search: vi.fn(async () => []),
    } satisfies KeylessExecutableSourcePort
    const detail = {
      kind: 'found',
      schemaVersion: 'registry-operations:v1',
      operation,
    }

    const result = await rebindKeylessDataAskFromRegistryDetail(
      descriptor.operationRef,
      detail,
      source,
    )

    expect(result.kind).toBe('resolved')
    if (result.kind !== 'resolved') throw new Error('expected detail rebind')
    const expectedDescriptor = {
      operationRef: descriptor.operationRef,
      capabilityId: executable.capabilityId,
      name: executable.name,
      summary: operation.summary,
      searchTerms: [operation.operationId, executable.capabilityId, executable.name],
      inputSchema: executable.inputSchema,
      publicOperation: operation,
      executionBindingDigest: bindingDigest,
    }
    expect(result.descriptors).toEqual([expectedDescriptor])
    expect(result.candidates).toEqual([expectedDescriptor])
    expect(result.selected).toEqual(expectedDescriptor)
    expect(result.selectedCandidate).toMatchObject({
      rank: 1,
      operationRef: descriptor.operationRef,
      operationId: operation.operationId,
      descriptorDigest: answerOperationDescriptorMaterialDigest(operation),
      executionBindingDigest: bindingDigest,
      inputSchemaDigest: canonicalDigest(operation.contract.inputJsonSchema).toString(),
      inputJsonSchema: operation.contract.inputJsonSchema,
      exactRebindRequired: false,
    })
    expect(result.operationCandidates).toEqual([result.selectedCandidate])
    expect(result.candidateSetDigest).toBe(canonicalDigest([{
      rank: 1,
      operationRef: descriptor.operationRef,
      descriptorDigest: answerOperationDescriptorMaterialDigest(operation),
      executionBindingDigest: bindingDigest,
      availability: { posture: 'routeable' },
    }]).toString())
    expect(read.mock.calls).toEqual([[descriptor.operationRef]])
    expect(readPublic.mock.calls).toEqual([[descriptor.operationRef]])
  })
})


describe('current candidate and operation artifacts', () => {
  it('preserves keyless truth and canonical parameter metadata in Answer candidates', () => {
    const fixture = selectionFixture()
    const candidate = fixture.initial.decision.candidates[0]
    if (candidate === undefined) throw new Error('expected candidate')
    expect(candidate.authority.authentication).toEqual({ kind: 'keyless' })
    const richParameter = {
      group: 'header' as const,
      name: 'x-api-key',
      type: 'string',
      description: 'Credential header',
      example: 'demo-key',
      enumValues: ['demo-key', 'live-key'],
      default: 'demo-key',
      style: 'simple' as const,
      explode: false,
      required: true as const,
    }
    const parsed = AnswerOperationCandidateSchema.safeParse({
      ...candidate,
      requiredParameters: [richParameter],
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.requiredParameters[0]).toEqual(richParameter)
  })

  it('accepts current public price evidence in answer candidates', () => {
    const fixture = selectionFixture()
    const candidate = fixture.initial.decision.candidates[0]
    expect(candidate).toBeDefined()
    expect(AnswerOperationCandidateSchema.safeParse({
      ...candidate,
      commercial: {
        ...candidate?.commercial,
        priceEvidence: {
          priceDigest: 'sha256:price',
          sourceRef: 'pricing:example',
          evidenceRefs: ['https://example.com/pricing'],
          observedAt: 1,
          validUntil: 2,
        },
      },
    }).success).toBe(true)
  })

  it('keeps candidate-set identity when display compaction removes nonselected schemas', () => {
    const fixture = selectionFixture()
    const artifacts = buildOperationArtifactsFromToolCalls([], fixture.initial)
    expect(artifacts.candidates).toHaveLength(2)
    expect(artifacts.candidates.every((candidate) => candidate.inputJsonSchema === undefined)).toBe(true)
    expect(artifacts.candidates.every((candidate) => candidate.exactRebindRequired)).toBe(true)
    expect(artifacts.candidateSetDigest).toBe(fixture.initial.decision.candidateSetDigest)
  })

  it('separates and validates the canonical operation result digest from the tool wrapper digest', () => {
    const result = {
      kind: 'ok' as const,
      operationRef: alphaRef,
      capabilityId: alphaDescriptor.capabilityId,
      name: alphaDescriptor.name,
      output: { value: 'current' },
      evidenceHash: 'sha256:evidence',
    }
    const wrapperDigest = 'sha256:tool-wrapper'
    const artifacts = buildOperationArtifactsFromToolCalls([{
      toolCallId: 'call:operation',
      turnId: 'turn:operation',
      seq: 0,
      toolId: 'operation.execute',
      inputJson: JSON.stringify({ operationRef: alphaRef, input: { value: 'current' } }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 0 }),
      resultJson: JSON.stringify(result),
      resultHash: wrapperDigest,
      status: 'complete',
      createdAt: 1,
    }])

    expect(artifacts.outcome).toMatchObject({
      resultDigest: canonicalDigest(result).toString(),
      toolCallDigest: wrapperDigest,
    })
    expect(AnswerOperationOutcomeSchema.safeParse({
      ...artifacts.outcome,
      resultDigest: 'sha256:forged',
    }).success).toBe(false)
    if (artifacts.outcome === undefined) throw new Error('expected operation outcome')
    expect(AnswerOperationOutcomeSchema.safeParse({
      ...artifacts.outcome,
      toolId: 'operation.invoke',
    }).success).toBe(false)
    const mismatchedResult = { ...result, operationRef: betaRef }
    expect(AnswerOperationOutcomeSchema.safeParse({
      ...artifacts.outcome,
      result: mismatchedResult,
      resultDigest: canonicalDigest(mismatchedResult).toString(),
    }).success).toBe(false)
  })

  it('replays the recorder resultHash for an oversized operation refusal', () => {
    const result = {
      kind: 'refused' as const,
      operationRef: alphaRef,
      reason: 'result_too_large' as const,
      resultHash: 'sha256:full-result',
    }
    const wrapperDigest = 'sha256:tool-wrapper'
    const artifacts = buildOperationArtifactsFromToolCalls([{
      toolCallId: 'call:operation',
      turnId: 'turn:operation',
      seq: 0,
      toolId: 'operation.execute',
      inputJson: JSON.stringify({ operationRef: alphaRef, input: { value: 'current' } }),
      resultSummaryJson: JSON.stringify({ slugs: [], count: 0, errorCode: 'result_too_large' }),
      resultJson: JSON.stringify(result),
      resultHash: wrapperDigest,
      status: 'refused',
      createdAt: 1,
    }])

    expect(artifacts.outcome?.result).toEqual(result)
    expect(artifacts.outcome?.resultDigest).toBe(canonicalDigest(result).toString())
    expect(artifacts.outcome?.toolCallDigest).toBe(wrapperDigest)
  })
})
