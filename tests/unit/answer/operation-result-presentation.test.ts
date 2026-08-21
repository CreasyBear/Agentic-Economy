import { describe, expect, it } from 'vitest'
import {
  AnswerOperationOutcomeSchema,
  projectAnswerOperationResult,
} from '@/modules/answer/public'
import {
  sanitizeAnswerOperationOutcome,
} from '@/modules/answer/internal/operation-result-presentation'
import { isPublicOperationRef, type PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  answerOperationDescriptorMaterialDigest,
  buildOperationArtifactsFromToolCalls,
} from '@/modules/answer/internal/operation-artifacts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/answer-thread.schema'

const operationRefText = `operation:v1:${'7'.repeat(64)}`
if (!isPublicOperationRef(operationRefText)) throw new Error('fixture_operation_ref_invalid')

const descriptor = {
  operationRef: operationRefText,
  operationId: 'fixture.result',
  callVia: OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path,
  paymentLane: 'brokered',
  contract: {
    capabilityId: 'fixture.result',
    version: 3,
    inputJsonSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    outputJsonSchema: {
      type: 'object',
      properties: { link: { type: 'string', format: 'uri' } },
      required: ['link'],
      additionalProperties: false,
    },
    customerAnnotations: [{
      annotationId: 'link',
      document: 'output',
      pointer: '/link',
      label: 'Result link',
      role: 'completion_evidence',
      semanticIdentity: 'https-link',
    }],
  },
  business: { businessId: 'business:fixture', slug: 'fixture-source', name: 'Frozen source' },
  offering: {
    offeringRef: 'offering:fixture',
    revision: 1,
    label: 'Frozen operation label',
    summary: 'Returns one annotated result.',
  },
  summary: 'Returns one annotated result.',
  commercial: {
    price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
    materialTerms: [],
    relationship: { kind: 'none', summary: 'No relationship.' },
  },
  dataUse: [],
  effects: [],
  evidence: [{ evidenceId: 'link', outputPointer: '/link', purpose: 'completion' }],
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
} satisfies PublicOperationDescriptor

function record(
  toolId: AnswerToolCallRecord['toolId'],
  input: unknown,
  result: unknown,
  createdAt: number,
): AnswerToolCallRecord {
  return {
    toolCallId: `${toolId}:${createdAt}`,
    turnId: 'turn:frozen-presentation',
    seq: 1,
    toolId,
    inputJson: JSON.stringify(input),
    resultSummaryJson: JSON.stringify({ slugs: [], count: 1 }),
    resultJson: JSON.stringify(result),
    resultHash: canonicalDigest({ toolId, createdAt }).toString(),
    status: 'complete',
    createdAt,
  }
}

describe('frozen operation result presentation', () => {
  it('derives presentation only from exact detail and binds the effect timestamp', () => {
    const effectAt = Date.UTC(2026, 7, 13, 12)
    const result = {
      kind: 'ok' as const,
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.contract.capabilityId,
      name: descriptor.offering.label,
      output: { link: 'https://example.test/result' },
      evidenceHash: `sha256:${'9'.repeat(64)}`,
    }
    const searchOnly = buildOperationArtifactsFromToolCalls([
      record('registry.operations.search', { query: 'fixture' }, {
        kind: 'ok',
        items: [descriptor],
      }, effectAt - 10),
      record('operation.execute', { operationRef: descriptor.operationRef, input: {} }, result, effectAt),
    ])
    expect(searchOnly.outcome?.presentation).toBeUndefined()

    const artifacts = buildOperationArtifactsFromToolCalls([
      record('registry.operations.detail', { operationRef: descriptor.operationRef }, {
        kind: 'found',
        operation: descriptor,
      }, effectAt - 10),
      record('operation.execute', { operationRef: descriptor.operationRef, input: {} }, result, effectAt),
    ])

    expect(artifacts.outcome?.presentation).toEqual({
      descriptorDigest: answerOperationDescriptorMaterialDigest(descriptor),
      operationLabel: 'Frozen operation label',
      sourceLabel: 'Frozen source',
      outputSchemaDigest: canonicalDigest(descriptor.contract.outputJsonSchema).toString(),
      outputAnnotations: [{
        pointer: '/link',
        label: 'Result link',
        role: 'completion_evidence',
        semanticIdentity: 'https-link',
      }],
      actor: 'ae_runtime',
      observedAt: effectAt,
    })
    expect(artifacts.outcome?.presentation?.descriptorDigest).toBe(
      artifacts.candidates[0]?.descriptorDigest,
    )
  })
  it('freezes compare facts and inspect-plan summaries from completed read calls', () => {
    const observedAt = 1_786_622_400_000
    const comparison = {
      kind: 'ok' as const,
      schemaVersion: 'registry-operations:v1' as const,
      operations: [descriptor],
      facts: [{
        field: 'availability' as const,
        values: [{
          operationRef: descriptor.operationRef,
          value: { posture: 'routeable' as const },
          source: 'readiness' as const,
          observedAt,
          validUntil: observedAt + 60_000,
        }],
      }],
      navigation: [],
    }
    const plan = {
      kind: 'ok' as const,
      schemaVersion: 'registry-operations:v1' as const,
      inspectPlanRef: 'inspect-plan:v1:fixture',
      operationRefs: [descriptor.operationRef],
      mappingRefs: [],
      summary: {
        maximumCost: { kind: 'requires_preparation' as const },
        dataUse: [],
        effects: [],
        expiry: observedAt + 60_000,
      },
      navigation: [],
    }

    const artifacts = buildOperationArtifactsFromToolCalls([
      record('registry.operations.compare', { operationRefs: [descriptor.operationRef] }, comparison, observedAt),
      record('registry.operations.inspectPlan', { operationRefs: [descriptor.operationRef] }, plan, observedAt + 1),
    ])

    expect(artifacts.comparison).toEqual({
      operationRefs: [descriptor.operationRef],
      facts: comparison.facts,
    })
    expect(artifacts.plan).toEqual({
      inspectPlanRef: plan.inspectPlanRef,
      operationRefs: plan.operationRefs,
      mappingRefs: [],
      summary: plan.summary,
    })
  })


  it('rejects non-canonical private fields instead of projecting them', () => {
    const comparison = {
      kind: 'ok',
      schemaVersion: 'registry-operations:v1',
      operations: [descriptor],
      facts: [{
        field: 'availability',
        values: [{
          operationRef: descriptor.operationRef,
          value: { posture: 'routeable' },
          source: 'readiness',
          endpointUrl: 'https://private.example.test',
        }],
      }],
      navigation: [],
    }
    const plan = {
      kind: 'ok',
      schemaVersion: 'registry-operations:v1',
      inspectPlanRef: 'inspect-plan:v1:fixture',
      operationRefs: [descriptor.operationRef],
      mappingRefs: [],
      summary: {
        maximumCost: { kind: 'requires_preparation' },
        dataUse: [],
        effects: [],
        expiry: 1_786_622_460_000,
        endpointUrl: 'https://private.example.test',
      },
      navigation: [],
    }
    const artifacts = buildOperationArtifactsFromToolCalls([
      record('registry.operations.compare', { operationRefs: [descriptor.operationRef] }, comparison, 1),
      record('registry.operations.inspectPlan', { operationRefs: [descriptor.operationRef] }, plan, 2),
    ])
    expect(artifacts.comparison).toBeUndefined()
    expect(artifacts.plan).toBeUndefined()
  })

  it('replays the frozen descriptor without consulting changed registry labels', () => {
    const effectAt = 1_786_622_400_000
    const result = {
      kind: 'ok' as const,
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.contract.capabilityId,
      name: descriptor.offering.label,
      output: { link: 'https://example.test/result' },
      evidenceHash: `sha256:${'8'.repeat(64)}`,
    }
    const frozen = buildOperationArtifactsFromToolCalls([
      record('registry.operations.detail', { operationRef: descriptor.operationRef }, { kind: 'found', operation: descriptor }, effectAt - 1),
      record('operation.execute', { operationRef: descriptor.operationRef, input: {} }, result, effectAt),
    ]).outcome
    if (frozen === undefined) throw new Error('fixture_outcome_missing')

    const replayed = AnswerOperationOutcomeSchema.parse(JSON.parse(JSON.stringify(frozen)))
    const changedRegistryDescriptor = {
      ...descriptor,
      business: { ...descriptor.business, name: 'Changed mutable registry source' },
      offering: { ...descriptor.offering, label: 'Changed mutable registry operation' },
    }
    expect(changedRegistryDescriptor.business.name).not.toBe(replayed.presentation?.sourceLabel)
    expect(projectAnswerOperationResult(replayed).presentation).toMatchObject({
      operationLabel: 'Frozen operation label',
      sourceLabel: 'Frozen source',
    })
  })

  it('preserves frozen labels but binds continuation evidence to the new effect time', () => {
    const initialEffectAt = 1_786_622_400_000
    const continuedEffectAt = initialEffectAt + 60_000
    const result = {
      kind: 'ok' as const,
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.contract.capabilityId,
      name: descriptor.offering.label,
      output: { link: 'https://example.test/result' },
      evidenceHash: `sha256:${'6'.repeat(64)}`,
    }
    const initial = buildOperationArtifactsFromToolCalls([
      record('registry.operations.detail', { operationRef: descriptor.operationRef }, {
        kind: 'found',
        operation: descriptor,
      }, initialEffectAt - 1),
      record('operation.execute', { operationRef: descriptor.operationRef, input: {} }, result, initialEffectAt),
    ]).outcome
    if (initial?.presentation === undefined) throw new Error('fixture_presentation_missing')

    const continued = buildOperationArtifactsFromToolCalls([
      record('registry.operations.detail', { operationRef: descriptor.operationRef }, {
        kind: 'found',
        operation: {
          ...descriptor,
          business: { ...descriptor.business, name: 'Changed mutable registry source' },
          offering: { ...descriptor.offering, label: 'Changed mutable registry operation' },
        },
      }, continuedEffectAt - 1),
      record('operation.execute', { operationRef: descriptor.operationRef, input: {} }, result, continuedEffectAt),
    ], {
      operationRef: descriptor.operationRef,
      presentation: initial.presentation,
    }).outcome

    expect(continued?.presentation).toMatchObject({
      operationLabel: 'Frozen operation label',
      sourceLabel: 'Frozen source',
      observedAt: continuedEffectAt,
    })
  })

  it('keeps bidi-modified HTTPS output as text without changing frozen evidence', () => {
    const effectAt = Date.UTC(2026, 7, 13, 13)
    const providerUrl = 'https://example.test/\u061cresult'
    const result = {
      kind: 'ok' as const,
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.contract.capabilityId,
      name: descriptor.offering.label,
      output: { link: providerUrl },
      evidenceHash: `sha256:${'a'.repeat(64)}`,
    }
    const frozen = buildOperationArtifactsFromToolCalls([
      record('registry.operations.detail', { operationRef: descriptor.operationRef }, {
        kind: 'found',
        operation: descriptor,
      }, effectAt - 1),
      record('operation.execute', { operationRef: descriptor.operationRef, input: {} }, result, effectAt),
    ]).outcome
    if (frozen === undefined) throw new Error('fixture_outcome_missing')

    const projected = projectAnswerOperationResult(frozen)
    expect(projected.annotations[0]?.href).toBeUndefined()
    expect(projected.annotations[0]?.value).toBe(providerUrl)
    expect(projected.output).toEqual({ link: providerUrl })
    expect(frozen.result).toEqual(result)
    expect(frozen.resultDigest).toBe(canonicalDigest(result).toString())
  })
  it('withholds unsafe output while preserving opaque effect identity', () => {
    const rawResult = {
      kind: 'ok' as const,
      operationRef: descriptor.operationRef,
      capabilityId: descriptor.contract.capabilityId,
      name: descriptor.offering.label,
      output: { token: 'TOPSECRET', safe: 'ok' },
      evidenceHash: `sha256:${'b'.repeat(64)}`,
    }
    const rawResultDigest = canonicalDigest(rawResult).toString()
    const outcome = {
      toolId: 'operation.execute' as const,
      operationRef: descriptor.operationRef,
      resultDigest: rawResultDigest,
      toolCallDigest: `sha256:${'c'.repeat(64)}`,
      result: rawResult,
    }

    const sanitized = sanitizeAnswerOperationOutcome(outcome)
    expect(sanitized.result).toMatchObject({
      kind: 'unsafe_output',
      operationRef: descriptor.operationRef,
      resultHash: rawResultDigest,
      evidenceHash: rawResult.evidenceHash,
    })
    expect(sanitized.toolCallDigest).toBe(outcome.toolCallDigest)
    expect(JSON.stringify(sanitized)).not.toContain('TOPSECRET')

    const projected = projectAnswerOperationResult(outcome)
    expect(projected).toMatchObject({
      stateLabel: 'Result withheld',
      annotations: [],
    })
    expect(projected.output).toBeUndefined()
    expect(JSON.stringify(projected)).not.toContain('TOPSECRET')
  })
})
