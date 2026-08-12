import { describe, expect, it } from 'vitest'

import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import { buildHarnessRunReport } from '@/modules/harness/public'
import type { FrozenTurnEvidenceDraft } from '@/modules/answer-thread/harness'
import { buildPublicThreadProjection } from '@/modules/answer-thread/public'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import type { AnswerWorkStep } from '@/modules/answer/public'
import {
  AnswerArtifactSchema,
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
  type AnswerOperationOutcome,
  type AnswerOperationSelection,
} from '@/modules/answer/answer-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { publicWorkLog } from '@/modules/answer-thread/internal/public-worklog'
import {
  buildPublicThreadProjectionWithReservations,
  countAnswerThreadTurns,
  toReservationRecord,
  toThreadRecord,
  toTurnRecord,
} from '@/modules/answer-thread/convex'
import { emitReadAndCompareSteps } from '@/modules/answer-thread/internal/turns/types'

function withAnswerRun(evidence: FrozenTurnEvidenceDraft) {
  return {
    ...evidence,
    answerRun: buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'hash-secret',
      evidence,
    }),
  }
}

type CompleteAnswerOperationSelection = AnswerOperationSelection & {
  descriptorDigest: string
  resultDigest: string
  candidateSetDigest: string
}
type OperationMaterial = {
  operationCandidates: readonly AnswerOperationCandidate[]
  operationCandidatesDigest: string
  operationOutcome: AnswerOperationOutcome
  operationSelection: CompleteAnswerOperationSelection
  toolCalls: FrozenTurnEvidenceDraft['toolCalls']
}
function operationMaterial(): OperationMaterial {
  const operationRef = `operation:v1:${'a'.repeat(64)}`
  const candidate: AnswerOperationCandidate = {
    rank: 1,
    operationRef,
    operationId: 'checkpoint.current',
    descriptorDigest: 'sha256:checkpoint-descriptor',
    business: {
      businessId: 'business-checkpoint',
      slug: 'checkpoint-business',
      name: 'Checkpoint Business',
    },
    offering: {
      offeringRef: 'offering:checkpoint',
      revision: 1,
      label: 'Current value',
      summary: 'Returns a current value.',
    },
    matchReason: 'Matches the requested current value.',
    summary: 'Returns the current value.',
    availability: { posture: 'integrated' },
    commercial: {
      price: { kind: 'fixed', amount: { currency: 'USD', units: '0', exponent: 2 } },
      materialTerms: [],
      relationship: { kind: 'none', summary: 'No relationship.' },
    },
    requiredParameters: [],
    optionalParameters: [],
    inputSchemaDigest: 'sha256:checkpoint-input',
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
    evidence: [{ evidenceId: 'value', outputPointer: '/output', purpose: 'completion' }],
    recovery: { idempotency: 'not_applicable', recovery: 'retry_safe' },
    navigation: [],
  }
  const operationCandidates = [candidate]
  const operationCandidatesDigest = answerOperationCandidateSetDigest(operationCandidates)
  const result = {
    kind: 'ok' as const,
    operationRef,
    capabilityId: candidate.operationId,
    name: 'Checkpoint current value',
    output: { value: 'checkpoint-value' },
    evidenceHash: 'sha256:checkpoint-evidence',
  }
  const resultDigest = canonicalDigest(result).toString()
  const inputJson = JSON.stringify({ operationRef, input: { value: 'checkpoint-value' } })
  const resultJson = JSON.stringify(result)
  const resultSummaryJson = JSON.stringify({ slugs: [], count: 0 })
  const toolCallDigest = canonicalDigest({
    toolId: 'operation.execute',
    input: inputJson,
    summary: resultSummaryJson,
    resultJson,
    status: 'complete',
  }).toString()
  const toolCalls = [{
    toolCallId: 'projection-operation-call',
    turnId: 'turn-1',
    seq: 1,
    toolId: 'operation.execute' as const,
    inputJson,
    resultSummaryJson,
    resultJson,
    resultHash: toolCallDigest,
    status: 'complete' as const,
    createdAt: 1,
  }]
  const operationOutcome: AnswerOperationOutcome = {
    toolId: 'operation.execute',
    operationRef,
    resultDigest,
    toolCallDigest,
    result,
  }
  const operationSelection: CompleteAnswerOperationSelection = {
    operationRef,
    toolId: 'operation.execute',
    descriptorDigest: candidate.descriptorDigest,
    resultDigest,
    candidateSetDigest: operationCandidatesDigest,
  }
  return {
    operationCandidates,
    operationCandidatesDigest,
    operationOutcome,
    operationSelection,
    toolCalls,
  }
}

describe('public thread projection', () => {
  it('omits private persistence fields from the share-safe DTO', () => {
    const thread: AnswerThreadRecord = {
      threadId: 'thread-1',
      pseudonymousSessionId: 'session-secret',
      title: 'plumber Preston',
      createdAt: 1_000,
      updatedAt: 2_000,
    }

    const operation = operationMaterial()
    const turn: AnswerTurnRecord = {
      turnId: 'turn-1',
      threadId: 'thread-1',
      seq: 1,
      query: 'plumber Preston',
      intent: 'refine_search',
      evidenceJson: JSON.stringify(withAnswerRun({
        providers: [
          {
            citationIndex: 1,
            slug: 'preston-plumbing',
            name: 'Preston Plumbing',
            category: 'Plumber',
            suburb: 'Preston',
            stateTerritory: 'VIC',
            serviceArea: 'Preston',
            hoursLabel: 'Hours supplied',
            availabilityLabel: 'Published',
            trustLabel: 'Checked',
            responseTimeLabel: '',
            trustCue: 'Checked',
            nextStepLabel: 'Send inquiry',
            detailUrl: '/preston-plumbing',
            services: [],
          },
        ],
        ...operation,
        allowedSlugs: ['preston-plumbing'],
        agentJsonUrl: '/api/businesses/search?q=plumber',
        toolCalls: operation.toolCalls,
        timings: [],
        workLog: [
          {
            id: 'interpret.request',
            phase: 'interpret',
            status: 'complete',
            title: 'Reading your request',
          },
        ],
        harnessRun: buildHarnessRunReport({
          availableTools: ['registry.search'],
          tools: [{ toolId: 'registry.search', status: 'ok', durationMs: 0 }],
        }),
      })),
      snapshotHash: 'hash-secret',
      proseJson: JSON.stringify({
        oneLine: 'One listed business matches.',
        summary: 'The business handles timing, price, and availability.',
        nextStep: 'Open a provider page.',
      }),
      artifactKindsJson: '["one-line","operation-candidates","operation-outcome","provider-cards"]',
      status: 'complete',
      errorCopyId: 'err-secret',
      createdAt: 3_000,
    }

    const projection = buildPublicThreadProjection(thread, [turn])
    const serialized = JSON.stringify(projection)

    expect(projection.turns).toHaveLength(1)
    expect(projection.turns[0]?.artifacts.length).toBeGreaterThan(0)
    const projectedTurn = projection.turns[0]
    expect(projectedTurn).toBeDefined()
    const candidatesArtifact = projectedTurn?.artifacts.find((artifact) => artifact.kind === 'operation-candidates')
    const outcomeArtifact = projectedTurn?.artifacts.find((artifact) => artifact.kind === 'operation-outcome')
    expect(candidatesArtifact).toEqual({
      kind: 'operation-candidates',
      candidates: operation.operationCandidates,
      operationCandidatesDigest: operation.operationCandidatesDigest,
      selection: operation.operationSelection,
    })
    expect(outcomeArtifact).toEqual({
      kind: 'operation-outcome',
      outcome: operation.operationOutcome,
    })
    expect(projection.turns[0]?.workLog).toEqual([])
    expect(projection.turns[0]?.answerCheckSummary).toMatchObject({
      catalogSearches: 0,
      listingsRead: 1,
      listedBusinesses: 1,
      checksPassed: 3,
      checksFailed: 0,
    })
    expect(serialized).not.toContain('session-secret')
    expect(serialized).not.toContain('hash-secret')
    expect(serialized).not.toContain('err-secret')
    expect(serialized).not.toContain('evidenceJson')
    expect(serialized).not.toContain('pseudonymousSessionId')
    expect(serialized).not.toContain('allowedSlugs')
    expect(serialized).not.toContain('harnessRun')
    expect(serialized).not.toContain('toolsInvoked')
    const parsedEvidence: unknown = JSON.parse(turn.evidenceJson)
    if (!isRecord(parsedEvidence)) throw new Error('Expected frozen evidence record.')
    const frozenEvidence = parsedEvidence
    const projectWithOperationChanges = (changes: Record<string, unknown>) =>
      buildPublicThreadProjection(thread, [{
        ...turn,
        evidenceJson: JSON.stringify({ ...frozenEvidence, ...changes }),
      }]).turns[0]
    const otherRef = `operation:v1:${'b'.repeat(64)}`
    const otherResult = { ...operation.operationOutcome.result, operationRef: otherRef }
    const otherResultDigest = canonicalDigest(otherResult).toString()
    const otherSelection: CompleteAnswerOperationSelection = {
      operationRef: otherRef,
      toolId: operation.operationSelection.toolId,
      descriptorDigest: operation.operationSelection.descriptorDigest,
      resultDigest: otherResultDigest,
      candidateSetDigest: operation.operationSelection.candidateSetDigest,
    }
    const otherOutcome: AnswerOperationOutcome = {
      toolId: operation.operationOutcome.toolId,
      operationRef: otherRef,
      resultDigest: otherResultDigest,
      toolCallDigest: operation.operationOutcome.toolCallDigest,
      result: otherResult,
    }
    expect(projectWithOperationChanges({
      operationSelection: otherSelection,
      operationOutcome: otherOutcome,
    })?.status).toBe('error')
    const wrongDescriptorSelection: CompleteAnswerOperationSelection = {
      operationRef: operation.operationSelection.operationRef,
      toolId: operation.operationSelection.toolId,
      descriptorDigest: 'sha256:wrong-descriptor',
      resultDigest: operation.operationSelection.resultDigest,
      candidateSetDigest: operation.operationSelection.candidateSetDigest,
    }
    expect(projectWithOperationChanges({
      operationSelection: wrongDescriptorSelection,
    })?.status).toBe('error')
    const missingToolOutcome: AnswerOperationOutcome = {
      toolId: operation.operationOutcome.toolId,
      operationRef: operation.operationOutcome.operationRef,
      resultDigest: operation.operationOutcome.resultDigest,
      toolCallDigest: `sha256:${'f'.repeat(64)}`,
      result: operation.operationOutcome.result,
    }
    expect(projectWithOperationChanges({
      operationOutcome: missingToolOutcome,
    })?.status).toBe('error')
    const transportFailure = {
      kind: 'error' as const,
      operationRef: operation.operationOutcome.operationRef,
      code: 'response_invalid' as const,
      retryable: false,
      reason: 'response_output_invalid',
    }
    const transportFailureJson = JSON.stringify(transportFailure)
    const transportFailureDigest = canonicalDigest(transportFailure).toString()
    const sourceToolCall = operation.toolCalls[0]
    if (sourceToolCall === undefined) throw new Error('Operation fixture must include a tool call.')
    const transportFailureToolCallHash = canonicalDigest({
      toolId: sourceToolCall.toolId,
      input: sourceToolCall.inputJson,
      summary: sourceToolCall.resultSummaryJson,
      resultJson: transportFailureJson,
      status: 'error',
    }).toString()
    const transportFailureToolCall = {
      ...sourceToolCall,
      resultJson: transportFailureJson,
      resultHash: transportFailureToolCallHash,
      status: 'error' as const,
    }
    const transportFailureOutcome = {
      ...operation.operationOutcome,
      result: transportFailure,
      resultDigest: transportFailureDigest,
      toolCallDigest: transportFailureToolCallHash,
    }
    const transportFailureSelection = {
      ...operation.operationSelection,
      resultDigest: transportFailureDigest,
    }
    const failedTurn = projectWithOperationChanges({
      operationOutcome: transportFailureOutcome,
      operationSelection: transportFailureSelection,
      toolCalls: [transportFailureToolCall],
    })
    const failedOutcomeArtifact = failedTurn?.artifacts.find((artifact) => artifact.kind === 'operation-outcome')
    expect(failedOutcomeArtifact).toMatchObject({
      kind: 'operation-outcome',
      outcome: {
        result: {
          kind: 'error',
          code: 'response_invalid',
          reason: 'response_output_invalid',
        },
      },
    })
    if (failedOutcomeArtifact?.kind !== 'operation-outcome') {
      throw new Error('Expected the refused operation outcome artifact.')
    }
    expect(failedOutcomeArtifact.outcome.result).not.toHaveProperty('output')
    expect(JSON.stringify(failedTurn)).not.toContain('provider-secret')
    expect(JSON.stringify(failedTurn)).not.toContain('signed-payment-secret')
  })
  it('rejects operation artifact selections that are not tied to one member digest', () => {
    const operation = operationMaterial()
    const candidate = operation.operationCandidates[0]
    const selection = operation.operationSelection
    if (candidate === undefined) {
      throw new Error('Operation fixture must include a candidate.')
    }
    const artifact = {
      kind: 'operation-candidates' as const,
      candidates: operation.operationCandidates,
      operationCandidatesDigest: operation.operationCandidatesDigest,
      selection,
    }
    const otherRef = `operation:v1:${'b'.repeat(64)}`
    expect(AnswerArtifactSchema.safeParse({
      ...artifact,
      selection: { ...selection, operationRef: otherRef },
    }).success).toBe(false)
    expect(AnswerArtifactSchema.safeParse({
      ...artifact,
      selection: { ...selection, descriptorDigest: 'sha256:wrong-descriptor' },
    }).success).toBe(false)
  })

  it('projects malformed durable complete data as an error', () => {
    const projection = buildPublicThreadProjection(
      {
        threadId: 'thread-corrupt',
        pseudonymousSessionId: 'session-secret',
        title: 'Corrupt answer',
        createdAt: 1,
        updatedAt: 2,
      },
      [{
        turnId: 'turn-corrupt',
        threadId: 'thread-corrupt',
        seq: 1,
        query: 'plumber Preston',
        intent: 'refine_search',
        evidenceJson: '{',
        snapshotHash: 'hash-corrupt',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'complete',
        createdAt: 3,
      }],
    )

    expect(projection.turns[0]).toMatchObject({
      status: 'error',
      artifacts: [],
      oneLine: '',
      problem: { code: 'answer_turn_failed' },
    })
  })

  it('omits internal work phases while preserving observable work', () => {
    const steps: AnswerWorkStep[] = [
      { id: 'interpret.request', phase: 'interpret', status: 'complete', title: 'Reading your request' },
      { id: 'search.registry.initial', phase: 'search', status: 'complete', title: 'Searching for matches' },
      { id: 'route.answer', phase: 'route', status: 'complete', title: 'Choosing the next step' },
      { id: 'read.providers', phase: 'read', status: 'complete', title: 'Reading the details' },
      { id: 'assemble.answer', phase: 'assemble', status: 'complete', title: 'Putting together the answer' },
      { id: 'compare.fit', phase: 'compare', status: 'complete', title: 'Comparing the matches' },
    ]

    expect(publicWorkLog(steps)).toEqual([
      { id: 'step-1', phase: 'search', status: 'complete', title: 'Searching for matches' },
      { id: 'step-2', phase: 'read', status: 'complete', title: 'Reading the details' },
      { id: 'step-3', phase: 'compare', status: 'complete', title: 'Comparing the matches' },
    ])
  })

  it('does not fabricate read or compare work when no providers exist', () => {
    const steps: AnswerWorkStep[] = []
    emitReadAndCompareSteps(
      {
        emit: (step) => steps.push(step),
        entries: () => steps,
      },
      [],
    )

    expect(steps).toEqual([])
  })
  it('decodes host rows and preserves persisted-turn precedence over reservations', () => {
    const thread = toThreadRecord({
      threadId: 'thread-rows',
      pseudonymousSessionId: 'session-rows',
      title: 'decoded thread',
      createdAt: '1',
      updatedAt: '2',
    })
    const persisted = toTurnRecord({
      turnId: 'turn-persisted',
      threadId: 'thread-rows',
      seq: '1',
      query: 'persisted answer',
      intent: 'refine_search',
      evidenceJson: '{}',
      snapshotHash: 'snapshot',
      proseJson: '{}',
      artifactKindsJson: '[]',
      status: 'pending',
      createdAt: '3',
    })
    const reservationBase = {
      sessionId: 'session-rows',
      requestedThreadScope: 'thread-rows',
      requestDigest: 'private-digest',
      threadId: 'thread-rows',
      searchContextJson: '{}',
      createdAt: 4,
      updatedAt: 5,
    }
    const duplicateReservation = toReservationRecord({
      ...reservationBase,
      reservationKey: 'reservation-duplicate',
      turnId: 'turn-persisted',
      seq: 1,
      query: 'duplicate lifecycle row',
      state: 'stopped',
    })
    const pendingReservation = toReservationRecord({
      ...reservationBase,
      reservationKey: 'reservation-pending',
      turnId: 'turn-pending',
      seq: 2,
      query: 'pending lifecycle row',
      state: 'reserved',
    })
    const settledReservation = toReservationRecord({
      ...reservationBase,
      reservationKey: 'reservation-settled',
      turnId: 'turn-settled',
      seq: 3,
      query: 'settled lifecycle row',
      state: 'finalized',
    })
    const rows = {
      turns: [persisted],
      reservations: [duplicateReservation, pendingReservation, settledReservation],
    }

    expect(countAnswerThreadTurns(rows, 10)).toBe(2)
    expect(buildPublicThreadProjectionWithReservations(thread, rows, 10).turns.map((turn) => ({
      turnId: turn.turnId,
      seq: turn.seq,
      query: turn.query,
      status: turn.status,
    }))).toEqual([
      { turnId: 'turn-persisted', seq: 1, query: 'persisted answer', status: 'pending' },
      { turnId: 'turn-pending', seq: 2, query: 'pending lifecycle row', status: 'pending' },
    ])
  })

})
