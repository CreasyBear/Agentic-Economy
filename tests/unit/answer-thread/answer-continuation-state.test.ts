import { describe, expect, it } from 'vitest'

import {
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
} from '@/modules/answer/answer-schema'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import type {
  AnswerPendingDecision,
  AnswerToolCallRecord,
  FrozenTurnEvidenceDraft,
} from '@/modules/answer-thread/answer-thread.schema'
import {
  pendingDecisionFor,
  readPriorContinuationState,
  selectedInputDigestFor,
} from '@/modules/answer-thread/internal/answer-continuation-state'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const OPERATION_REF = `operation:v1:${'a'.repeat(64)}`
const DESCRIPTOR_DIGEST = 'sha256:continuation-descriptor'
const BINDING_DIGEST = 'sha256:continuation-binding'
const TERMINAL_CHECKPOINT_DIGEST = 'sha256:continuation-terminal'
const SNAPSHOT_HASH = 'sha256:continuation-snapshot'
const TURN_ID = 'continuation-prior'

function candidate(): AnswerOperationCandidate {
  return {
    rank: 1,
    operationRef: OPERATION_REF,
    operationId: 'continuation.current',
    descriptorDigest: DESCRIPTOR_DIGEST,
    business: {
      businessId: 'business-continuation',
      slug: 'continuation-business',
      name: 'Continuation Business',
    },
    offering: {
      offeringRef: 'offering:continuation',
      revision: 1,
      label: 'Current value',
      summary: 'Returns a current value.',
    },
    matchReason: 'Matches the requested current value.',
    summary: 'Returns the current value.',
    availability: { posture: 'integrated' },
    commercial: {
      price: {
        kind: 'fixed',
        amount: { currency: 'USD', units: '0', exponent: 2 },
      },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No relationship.' },
    },
    requiredParameters: [],
    optionalParameters: [],
    inputSchemaDigest: 'sha256:continuation-input',
    inputJsonSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
    },
    exactRebindRequired: false,
    authority: {
      publisher: 'ae_curated_external',
      sourceKind: 'openapi_http',
      authentication: { kind: 'keyless' },
    },
    dataUse: [],
    effects: [],
    evidence: [],
    recovery: { idempotency: 'required', recovery: 'reconcile_required' },
    navigation: [],
    executionBindingDigest: BINDING_DIGEST,
  }
}

function boundPriorTurn(input?: {
  mutate?: (evidence: FrozenTurnEvidenceDraft) => void
  status?: 'complete' | 'error'
}) {
  const operationCandidates = [candidate()]
  const operationCandidatesDigest =
    answerOperationCandidateSetDigest(operationCandidates)
  const invokeResult = {
    kind: 'needs_authority' as const,
    invocationRef: 'invocation:continuation',
    operationRef: OPERATION_REF,
    authorityRequest: {
      kind: 'approve_each' as const,
      operationRef: OPERATION_REF,
      consequence: 'external_effect' as const,
      retryClass: 'replayable' as const,
      dataFields: ['value'],
    },
  }
  const resultDigest = canonicalDigest(invokeResult).toString()
  const inputJson = JSON.stringify({
    operationRef: OPERATION_REF,
    input: { value: 'pending' },
    idempotencyKey: 'continuation-idempotency',
  })
  const resultSummaryJson = JSON.stringify({ slugs: [], count: 0 })
  const resultJson = JSON.stringify(invokeResult)
  const toolCallDigest = canonicalDigest({
    toolId: 'operation.invoke',
    input: inputJson,
    summary: resultSummaryJson,
    resultJson,
    status: 'complete',
  }).toString()
  const toolCall: AnswerToolCallRecord = {
    toolCallId: 'continuation-call',
    turnId: TURN_ID,
    seq: 1,
    toolId: 'operation.invoke',
    inputJson,
    resultSummaryJson,
    resultJson,
    resultHash: toolCallDigest,
    status: 'complete',
    createdAt: 1,
  }
  const pendingDecision: AnswerPendingDecision = {
    kind: 'authority_required',
    operationRef: OPERATION_REF,
    toolId: 'operation.invoke',
    candidateSetDigest: operationCandidatesDigest,
    descriptorDigest: DESCRIPTOR_DIGEST,
    inputDigest: canonicalDigest(inputJson).toString(),
    decisionDigest: resultDigest,
    origin: {
      originTurnId: TURN_ID,
      originGeneration: 0,
      terminalCheckpointDigest: TERMINAL_CHECKPOINT_DIGEST,
    },
  }
  const evidence: FrozenTurnEvidenceDraft = {
    providers: [],
    operationCandidates,
    operationCandidatesDigest,
    operationOutcome: {
      toolId: 'operation.invoke',
      operationRef: OPERATION_REF,
      resultDigest,
      toolCallDigest,
      result: invokeResult,
    },
    operationSelection: {
      operationRef: OPERATION_REF,
      toolId: 'operation.invoke',
      descriptorDigest: DESCRIPTOR_DIGEST,
      executionBindingDigest: BINDING_DIGEST,
      resultDigest,
      candidateSetDigest: operationCandidatesDigest,
    },
    pendingDecision,
    selectedInputDigest: canonicalDigest(inputJson).toString(),
    terminalCheckpointDigest: TERMINAL_CHECKPOINT_DIGEST,
    allowedSlugs: [],
    agentJsonUrl: '',
    toolCalls: [toolCall],
    timings: [],
    workLog: [],
  }
  input?.mutate?.(evidence)
  return {
    turnId: TURN_ID,
    seq: 1,
    query: 'continue the pending operation',
    status: input?.status ?? 'complete',
    snapshotHash: SNAPSHOT_HASH,
    evidenceJson: JSON.stringify({
      ...evidence,
      answerRun: buildAnswerRunReport({
        intent: 'refine_search',
        status: 'complete',
        snapshotHash: SNAPSHOT_HASH,
        evidence,
      }),
    }),
  } as const
}

describe('answer-continuation-state', () => {
  it('keeps a fully bound pending decision on the prior continuation source', () => {
    const state = readPriorContinuationState([boundPriorTurn()])
    expect(state.source).toEqual({
      priorTurnId: TURN_ID,
      priorTurnSeq: 1,
      priorSnapshotHash: SNAPSHOT_HASH,
      priorTerminalCheckpointDigest: TERMINAL_CHECKPOINT_DIGEST,
    })
    expect(state.pendingDecision?.kind).toBe('authority_required')
    expect(state.pendingDecision?.operationRef).toBe(OPERATION_REF)
  })

  it.each([
    [
      'missing terminal checkpoint digest',
      (evidence: FrozenTurnEvidenceDraft) => {
        delete evidence.terminalCheckpointDigest
      },
    ],
    [
      'pending origin turn mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        if (evidence.pendingDecision?.origin === undefined) return
        evidence.pendingDecision = {
          ...evidence.pendingDecision,
          origin: {
            ...evidence.pendingDecision.origin,
            originTurnId: 'other-turn',
          },
        }
      },
    ],
    [
      'pending origin checkpoint mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        if (evidence.pendingDecision?.origin === undefined) return
        evidence.pendingDecision = {
          ...evidence.pendingDecision,
          origin: {
            ...evidence.pendingDecision.origin,
            terminalCheckpointDigest: 'sha256:tampered-terminal',
          },
        }
      },
    ],
    [
      'pending input digest mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        if (evidence.pendingDecision === undefined) return
        evidence.pendingDecision = {
          ...evidence.pendingDecision,
          inputDigest: 'sha256:tampered-input',
        }
      },
    ],
    [
      'selected input digest mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        evidence.selectedInputDigest = 'sha256:tampered-selected-input'
      },
    ],
    [
      'descriptor digest mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        if (evidence.pendingDecision === undefined) return
        evidence.pendingDecision = {
          ...evidence.pendingDecision,
          descriptorDigest: 'sha256:tampered-descriptor',
        }
      },
    ],
    [
      'candidate set digest mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        if (evidence.pendingDecision === undefined) return
        evidence.pendingDecision = {
          ...evidence.pendingDecision,
          candidateSetDigest: 'sha256:tampered-candidates',
        }
      },
    ],
    [
      'decision digest mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        if (evidence.pendingDecision === undefined) return
        evidence.pendingDecision = {
          ...evidence.pendingDecision,
          decisionDigest: 'sha256:tampered-decision',
        }
      },
    ],
    [
      'tool call result hash mismatch',
      (evidence: FrozenTurnEvidenceDraft) => {
        const [call] = evidence.toolCalls
        if (call === undefined) return
        evidence.toolCalls = [{ ...call, resultHash: 'sha256:tampered-call' }]
      },
    ],
  ] as const)('drops pending decision when %s', (_label, mutate) => {
    const state = readPriorContinuationState([boundPriorTurn({ mutate })])
    expect(state.pendingDecision).toBeUndefined()
    if (_label !== 'pending origin turn mismatch') {
      expect(state.source).toBeUndefined()
      return
    }
    expect(state.source).toEqual({
      priorTurnId: TURN_ID,
      priorTurnSeq: 1,
      priorSnapshotHash: SNAPSHOT_HASH,
      priorTerminalCheckpointDigest: TERMINAL_CHECKPOINT_DIGEST,
    })
  })

  it('returns empty state for incomplete prior turns', () => {
    expect(
      readPriorContinuationState([boundPriorTurn({ status: 'error' })]),
    ).toEqual({})
  })

  it('derives selected input and pending decision digests from complete invoke calls', () => {
    const inputJson = JSON.stringify({
      operationRef: OPERATION_REF,
      input: { value: 'x' },
    })
    const toolCalls: AnswerToolCallRecord[] = [
      {
        toolCallId: 'call-1',
        turnId: TURN_ID,
        seq: 1,
        toolId: 'operation.invoke',
        inputJson,
        resultSummaryJson: '{}',
        resultJson: JSON.stringify({ kind: 'pending' }),
        resultHash: 'sha256:call',
        status: 'complete',
        createdAt: 1,
      },
    ]
    const selection = {
      operationRef: OPERATION_REF,
      toolId: 'operation.invoke' as const,
      descriptorDigest: DESCRIPTOR_DIGEST,
      executionBindingDigest: BINDING_DIGEST,
      resultDigest: 'sha256:result',
      candidateSetDigest: 'sha256:candidates',
    }
    expect(selectedInputDigestFor(toolCalls, selection)).toBe(
      canonicalDigest(inputJson).toString(),
    )
    const pending = pendingDecisionFor(
      {
        toolId: 'operation.invoke',
        operationRef: OPERATION_REF,
        resultDigest: 'sha256:result',
        toolCallDigest: 'sha256:call',
        result: {
          kind: 'pending',
          invocationRef: 'inv:1',
          operationRef: OPERATION_REF,
          retryAfterMs: 1_000,
        },
      },
      selection,
      toolCalls,
    )
    expect(pending?.kind).toBe('operation_pending')
    expect(pending?.inputDigest).toBe(canonicalDigest(inputJson).toString())
  })

  it('does not create an unbound pending decision', () => {
    expect(
      pendingDecisionFor(
        {
          toolId: 'operation.invoke',
          operationRef: OPERATION_REF,
          resultDigest: 'sha256:result',
          toolCallDigest: 'sha256:call',
          result: {
            kind: 'pending',
            invocationRef: 'inv:1',
            operationRef: OPERATION_REF,
            retryAfterMs: 1_000,
          },
        },
        undefined,
        [],
      ),
    ).toBeUndefined()
  })
})
