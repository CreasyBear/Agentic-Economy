import { afterEach, describe, expect, it } from 'vitest'

import type { AnswerTurnCheckpoint } from '@/modules/answer-thread/answer-thread.schema'
import {
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
  type AnswerOperationOutcome,
  type AnswerOperationSelection,
} from '@/modules/answer/answer-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  persistAnswerTurnCheckpoint,
  readAnswerTurnCheckpoint,
  renewAnswerTurnLease,
  reserveAnswerTurn,
  stopAnswerTurn,
  type AnswerTurnReservationResult,
} from '@/modules/answer-thread/answer-thread.functions'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  type AnswerThreadTestStore,
} from '../../helpers/answer-thread-test-port'

const resets: (() => void)[] = []

afterEach(() => {
  while (resets.length > 0) resets.pop()?.()
})

describe('answer turn checkpoint durability contract', () => {
  it('loads a reservation-bound checkpoint on replay without reporting a false pending state', async () => {
    const { store, admission } = await reservedFixture('checkpoint-replay')
    const operation = operationMaterial()
    const checkpoint = checkpointFor(admission, operation)

    await expect(persistAnswerTurnCheckpoint({
      reservationKey: admission.reservationKey,
      requestDigest: 'checkpoint-digest',
      sessionId: 'checkpoint-session',
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      generation: admission.generation,
      checkpoint,
    })).resolves.toMatchObject({ kind: 'persisted' })

    const storedReservation = store.reservations.get(admission.reservationKey)
    if (storedReservation === undefined) throw new Error('expected stored reservation')
    store.reservations.set(admission.reservationKey, { ...storedReservation, updatedAt: 0 })
    const replay = await reserveAnswerTurn({
      sessionId: 'checkpoint-session',
      query: 'checkpoint query',
      requestDigest: 'checkpoint-digest',
      reservationKey: admission.reservationKey,
      title: 'checkpoint query',
    })
    expect(replay).toMatchObject({ kind: 'reserved', generation: admission.generation + 1 })
    if (replay.kind !== 'reserved') throw new Error('expected reserved takeover')

    const readback = await readAnswerTurnCheckpoint({
      reservationKey: replay.reservationKey,
      requestDigest: 'checkpoint-digest',
      sessionId: 'checkpoint-session',
      threadId: replay.threadId,
      turnId: replay.turnId,
      turnSeq: replay.turnSeq,
      generation: replay.generation,
    })
    expect(readback).toEqual({
      kind: 'checkpoint',
      checkpoint: { ...checkpoint, generation: replay.generation },
    })
    expect(store.reservations.get(admission.reservationKey)?.state).toBe('reserved')
  })
  it('leaves a reserved retry recoverable when no checkpoint exists', async () => {
    const { store, admission } = await reservedFixture('checkpoint-absent')
    const reservation = store.reservations.get(admission.reservationKey)
    if (reservation === undefined) throw new Error('expected stored reservation')
    store.reservations.set(admission.reservationKey, { ...reservation, updatedAt: 0 })
    const replay = await reserveAnswerTurn({
      sessionId: 'checkpoint-session',
      query: 'checkpoint query',
      requestDigest: 'checkpoint-digest',
      reservationKey: admission.reservationKey,
      title: 'checkpoint query',
    })
    expect(replay).toMatchObject({ kind: 'reserved', generation: admission.generation + 1 })
    if (replay.kind !== 'reserved') throw new Error('expected reserved takeover')
    await expect(readAnswerTurnCheckpoint({
      reservationKey: replay.reservationKey,
      requestDigest: 'checkpoint-digest',
      sessionId: 'checkpoint-session',
      threadId: replay.threadId,
      turnId: replay.turnId,
      turnSeq: replay.turnSeq,
      generation: replay.generation,
    })).resolves.toEqual({ kind: 'missing' })
  })

  it('admits a fresh replay as in-progress without taking over the lease', async () => {
    const { admission } = await reservedFixture('checkpoint-in-progress')
    await expect(reserveAnswerTurn({
      sessionId: 'checkpoint-session',
      query: 'checkpoint query',
      requestDigest: 'checkpoint-digest',
      reservationKey: admission.reservationKey,
      title: 'checkpoint query',
    })).resolves.toMatchObject({
      kind: 'in_progress',
      generation: admission.generation,
    })
  })
  it('renews the active generation and refuses a stale worker fence', async () => {
    const { store, admission } = await reservedFixture('checkpoint-lease')
    await expect(renewAnswerTurnLease({
      reservationKey: admission.reservationKey,
      requestDigest: 'checkpoint-digest',
      sessionId: 'checkpoint-session',
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      generation: admission.generation,
    })).resolves.toEqual({
      kind: 'renewed',
      reservationKey: admission.reservationKey,
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      generation: admission.generation,
    })

    store.generations.set(admission.reservationKey, admission.generation + 1)
    await expect(renewAnswerTurnLease({
      reservationKey: admission.reservationKey,
      requestDigest: 'checkpoint-digest',
      sessionId: 'checkpoint-session',
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      generation: admission.generation,
    })).resolves.toEqual({
      kind: 'conflict',
      reason: 'generation_mismatch',
    })
  })

  it('rejects malformed, mismatched, stale, and stopped checkpoints before storing replay material', async () => {
    const malformed = await reservedFixture('checkpoint-malformed')
    const malformedCheckpoint = checkpointFor(malformed.admission, { replayMessagesJson: 'not-json' })
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(malformed.admission),
      checkpoint: malformedCheckpoint,
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'checkpoint_invalid' })

    const mismatched = await reservedFixture('checkpoint-mismatch')
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(mismatched.admission),
      checkpoint: checkpointFor(mismatched.admission, { requestDigest: 'other-digest' }),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'checkpoint_invalid' })

    const forged = await reservedFixture('checkpoint-forged-operation-digest')
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(forged.admission),
      checkpoint: checkpointFor(forged.admission, {
        ...operationMaterial(),
        operationCandidatesDigest: 'sha256:forged-operation-candidates',
      }),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'checkpoint_invalid' })

    const operation = operationMaterial()
    const otherRef = `operation:v1:${'b'.repeat(64)}`
    const otherResult = { ...operation.operationOutcome.result, operationRef: otherRef }
    const otherResultDigest = canonicalDigest(otherResult).toString()
    const selectedOther: CompleteAnswerOperationSelection = {
      operationRef: otherRef,
      toolId: operation.operationSelection.toolId,
      descriptorDigest: operation.operationSelection.descriptorDigest,
      resultDigest: otherResultDigest,
      candidateSetDigest: operation.operationSelection.candidateSetDigest,
    }
    const outcomeOther: AnswerOperationOutcome = {
      toolId: operation.operationOutcome.toolId,
      operationRef: otherRef,
      resultDigest: otherResultDigest,
      toolCallDigest: operation.operationOutcome.toolCallDigest,
      result: otherResult,
    }
    const candidateMismatch = await reservedFixture('checkpoint-candidate-mismatch')
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(candidateMismatch.admission),
      checkpoint: checkpointFor(candidateMismatch.admission, {
        ...operation,
        operationSelection: selectedOther,
        operationOutcome: outcomeOther,
        resultDigest: otherResultDigest,
        selectedOperationRef: otherRef,
      }),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'checkpoint_invalid' })

    const descriptorMismatch = await reservedFixture('checkpoint-descriptor-mismatch')
    const descriptorOperation = operationMaterial()
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(descriptorMismatch.admission),
      checkpoint: checkpointFor(descriptorMismatch.admission, {
        ...descriptorOperation,
        operationSelection: {
          operationRef: descriptorOperation.operationSelection.operationRef,
          toolId: descriptorOperation.operationSelection.toolId,
          descriptorDigest: 'sha256:wrong-descriptor',
          resultDigest: descriptorOperation.operationSelection.resultDigest,
          candidateSetDigest: descriptorOperation.operationSelection.candidateSetDigest,
        },
        descriptorDigest: 'sha256:wrong-descriptor',
      }),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'checkpoint_invalid' })

    const missingToolRecord = await reservedFixture('checkpoint-missing-tool-record')
    const missingToolOperation = operationMaterial()
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(missingToolRecord.admission),
      checkpoint: checkpointFor(missingToolRecord.admission, {
        ...missingToolOperation,
        operationOutcome: {
          toolId: missingToolOperation.operationOutcome.toolId,
          operationRef: missingToolOperation.operationOutcome.operationRef,
          resultDigest: missingToolOperation.operationOutcome.resultDigest,
          toolCallDigest: `sha256:${'f'.repeat(64)}`,
          result: missingToolOperation.operationOutcome.result,
        },
      }),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'checkpoint_invalid' })

    const stale = await reservedFixture('checkpoint-stale')
    stale.store.generations.set(stale.admission.reservationKey, stale.admission.generation + 1)
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(stale.admission),
      checkpoint: checkpointFor(stale.admission),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'generation_mismatch' })

    const stopped = await reservedFixture('checkpoint-stopped')
    await stopAnswerTurn({
      sessionId: 'checkpoint-session',
      threadId: stopped.admission.threadId,
      turnId: stopped.admission.turnId,
    })
    await expect(persistAnswerTurnCheckpoint({
      ...checkpointArgs(stopped.admission),
      checkpoint: checkpointFor(stopped.admission),
    })).resolves.toMatchObject({ kind: 'conflict', reason: 'stopped' })
  })
})

async function reservedFixture(key: string): Promise<{
  store: AnswerThreadTestStore
  admission: Extract<AnswerTurnReservationResult, { kind: 'reserved' }>
}> {
  const store = createAnswerThreadTestStore()
  resets.push(installAnswerThreadTestPort(store))
  const admission = await reserveAnswerTurn({
    sessionId: 'checkpoint-session',
    query: 'checkpoint query',
    requestDigest: 'checkpoint-digest',
    reservationKey: key,
    title: 'checkpoint query',
  })
  if (admission.kind !== 'reserved') throw new Error(`expected reserved fixture, got ${admission.kind}`)
  return { store, admission }
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
  resultDigest: string
  selectedOperationRef: string
  selectedToolId: 'operation.execute'
  descriptorDigest: string
  toolCalls: AnswerTurnCheckpoint['toolCalls']
  toolCallDigests: AnswerTurnCheckpoint['toolCallDigests']
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
  const toolCallId = 'checkpoint-operation-call'
  const toolCalls = [{
    toolCallId,
    turnId: 'checkpoint-turn',
    seq: 1,
    toolId: 'operation.execute' as const,
    inputJson,
    resultSummaryJson,
    resultJson,
    resultHash: toolCallDigest,
    status: 'complete' as const,
    createdAt: 1,
  }]
  const toolCallDigests = [{
    toolCallId,
    inputDigest: canonicalDigest(inputJson).toString(),
    resultDigest: toolCallDigest,
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
    resultDigest,
    selectedOperationRef: operationRef,
    selectedToolId: 'operation.execute',
    descriptorDigest: candidate.descriptorDigest,
    toolCalls,
    toolCallDigests,
  }
}

function checkpointArgs(admission: Extract<AnswerTurnReservationResult, { kind: 'reserved' }>) {
  return {
    reservationKey: admission.reservationKey,
    requestDigest: 'checkpoint-digest',
    sessionId: 'checkpoint-session',
    threadId: admission.threadId,
    turnId: admission.turnId,
    turnSeq: admission.turnSeq,
    generation: admission.generation,
  }
}

function checkpointFor(
  admission: Extract<AnswerTurnReservationResult, { kind: 'reserved' }>,
  overrides: Partial<AnswerTurnCheckpoint> = {},
): AnswerTurnCheckpoint {
  return {
    schemaVersion: 1,
    reservationKey: admission.reservationKey,
    requestDigest: 'checkpoint-digest',
    generation: admission.generation,
    threadId: admission.threadId,
    turnId: admission.turnId,
    turnSeq: admission.turnSeq,
    stepOrdinal: 1,
    route: 'tool_search',
    intent: 'refine_search',
    query: 'checkpoint query',
    priorTurnCount: 0,
    priorProviders: [],
    priorAllowedSlugs: [],
    toolCallDigests: [],
    toolCalls: [],
    modelRequests: [],
    replayMessagesJson: '[{"role":"user","content":"checkpoint query"}]',
    ...overrides,
  }
}

