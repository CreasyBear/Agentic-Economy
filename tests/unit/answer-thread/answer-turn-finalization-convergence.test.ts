import { afterEach, describe, expect, it } from 'vitest'

import {
  finalizeReservedAnswerTurnFromRequest,
  reserveAnswerTurn,
  stopAnswerTurn,
} from '@/modules/answer-thread/answer-thread.functions'
import { answerTurnFinalizationDigest } from '@/modules/answer-thread/testing'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  answerOperationCandidateSetDigest,
  type AnswerOperationCandidate,
  type AnswerOperationOutcome,
  type AnswerOperationSelection,
} from '@/modules/answer/answer-schema'
import type { AnswerToolCallInputRow } from '@/modules/answer-thread/internal/commands'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
  type AnswerThreadTestStore,
} from '../../helpers/answer-thread-test-port'

const resets: (() => void)[] = []

let fixtureCounter = 0

afterEach(() => {
  while (resets.length > 0) resets.pop()?.()
})

describe('answer turn finalization convergence', () => {
  it('atomically finalizes and exactly replays the same material', async () => {
    const fixture = await fixtureFor('complete')
    const first = await finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), fixture.args)
    const replay = await finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), fixture.args)

    expect(first).toMatchObject({ status: 'accepted', turnId: fixture.args.turnId })
    expect(replay).toMatchObject({ status: 'replayed', turnId: fixture.args.turnId })
    expect(fixture.store.turns.get(fixture.args.turnId)).toMatchObject({ status: 'complete' })
    expect(JSON.parse(fixture.store.turns.get(fixture.args.turnId)?.evidenceJson ?? '{}')).toEqual({
      providers: [],
      ...fixture.operation,
    })
    expect(fixture.store.reservations.get(fixture.args.reservationKey)).toMatchObject({
      state: 'finalized',
      finalStatus: 'complete',
      answerDigest: fixture.args.answerDigest,
    })
  })

  it('atomically finalizes and exactly replays error material', async () => {
    const fixture = await fixtureFor('error')
    const first = await finalizeReservedAnswerTurnFromRequest(
      new Request('https://example.test'),
      fixture.args,
    )
    const replay = await finalizeReservedAnswerTurnFromRequest(
      new Request('https://example.test'),
      fixture.args,
    )

    expect(first).toMatchObject({ status: 'accepted', turnId: fixture.args.turnId })
    expect(replay).toMatchObject({ status: 'replayed', turnId: fixture.args.turnId })
    expect(fixture.store.turns.get(fixture.args.turnId)).toMatchObject({ status: 'error' })
    expect(fixture.store.reservations.get(fixture.args.reservationKey)).toMatchObject({
      state: 'finalized',
      finalStatus: 'error',
      answerDigest: fixture.args.answerDigest,
    })
  })

  it('refuses changed material and stopped reservations', async () => {
    const fixture = await fixtureFor('complete')
    await expect(
      finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), fixture.args),
    ).resolves.toMatchObject({ status: 'accepted' })
    const changedOperation = operationMaterial('changed')
    const changed = await finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), {
      ...fixture.args,
      evidenceJson: JSON.stringify({ providers: [], ...changedOperation }),
    })
    expect(changed).toMatchObject({ status: 'conflict', reason: 'evidence_conflict' })

    const stoppedFixture = await fixtureFor('complete')
    await stopAnswerTurn({
      sessionId: stoppedFixture.args.sessionId,
      threadId: stoppedFixture.args.threadId,
      turnId: stoppedFixture.args.turnId,
    })
    await expect(
      finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), stoppedFixture.args),
    ).resolves.toMatchObject({ status: 'conflict', reason: 'stopped' })
  })

  it('refuses completed operation evidence without its frozen tool record', async () => {
    const fixture = await fixtureFor('complete')
    const outcome = fixture.operation.operationOutcome
    const changedOutcome: AnswerOperationOutcome = {
      toolId: outcome.toolId,
      operationRef: outcome.operationRef,
      resultDigest: outcome.resultDigest,
      toolCallDigest: `sha256:${'f'.repeat(64)}`,
      result: outcome.result,
    }
    const result = await finalizeReservedAnswerTurnFromRequest(new Request('https://example.test'), {
      ...fixture.args,
      evidenceJson: JSON.stringify({
        providers: [],
        ...fixture.operation,
        operationOutcome: changedOutcome,
      }),
    })
    expect(result).toMatchObject({ status: 'conflict', reason: 'evidence_conflict' })
  })
})

type OperationToolCall = AnswerToolCallInputRow & { turnId: string }

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
  toolCalls: readonly OperationToolCall[]
}

type Fixture = {
  store: AnswerThreadTestStore
  args: Parameters<typeof finalizeReservedAnswerTurnFromRequest>[1]
  operation: OperationMaterial
}

async function fixtureFor(finalStatus: 'complete' | 'error'): Promise<Fixture> {
  const store = createAnswerThreadTestStore()
  store.threads.set('thread-finalization', {
    threadId: 'thread-finalization',
    pseudonymousSessionId: 'session-finalization',
    title: 'finalization test',
    createdAt: 1,
    updatedAt: 1,
  })
  resets.push(installAnswerThreadTestPort(store))
  const fixtureId = ++fixtureCounter
  const query = 'finalization test'
  const requestDigest = `request-${fixtureId}`
  const admission = await reserveAnswerTurn({
    sessionId: 'session-finalization',
    threadId: 'thread-finalization',
    query,
    requestDigest,
    reservationKey: `reservation-${fixtureId}`,
    title: query,
  })
  if (admission.kind !== 'reserved') throw new Error(`expected reserved fixture, got ${admission.kind}`)
  const operation = operationMaterial()
  const evidenceJson = JSON.stringify({ providers: [], ...operation })
  const snapshotHash = 'snapshot-finalization'
  const proseJson = '{"oneLine":"stable"}'
  const artifactKindsJson = '["one-line","operation-candidates","operation-outcome"]'
  const answerDigest = answerTurnFinalizationDigest({
    expectedGeneration: admission.generation,
    turn: {
      turnId: admission.turnId,
      threadId: admission.threadId,
      seq: admission.turnSeq,
      query,
      intent: 'refine_search',
      evidenceJson,
      snapshotHash,
      proseJson,
      artifactKindsJson,
      status: finalStatus,
      createdAt: 1,
    },
    toolCalls: operation.toolCalls,
  })
  return {
    store,
    operation,
    args: {
      reservationKey: admission.reservationKey,
      requestDigest,
      sessionId: 'session-finalization',
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      expectedGeneration: admission.generation,
      createdAt: 1,
      answerDigest,
      query,
      intent: 'refine_search',
      finalStatus,
      evidenceJson,
      snapshotHash,
      proseJson,
      artifactKindsJson,
      finalizationHash: 'finalization-hash',
      toolCalls: operation.toolCalls,
      entries: [],
    },
  }
}

function operationMaterial(outputValue = 'finalization-value'): OperationMaterial {
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
    output: { value: outputValue },
    evidenceHash: 'sha256:checkpoint-evidence',
  }
  const resultDigest = canonicalDigest(result).toString()
  const inputJson = JSON.stringify({ operationRef, input: { value: outputValue } })
  const resultJson = JSON.stringify(result)
  const resultSummaryJson = JSON.stringify({ slugs: [], count: 0 })
  const toolCallDigest = canonicalDigest({
    toolId: 'operation.execute',
    input: inputJson,
    summary: resultSummaryJson,
    resultJson,
    status: 'complete',
  }).toString()
  const toolCalls: readonly OperationToolCall[] = [{
    toolCallId: 'finalization-operation-call',
    turnId: 'turn-finalization',
    seq: 1,
    toolId: 'operation.execute',
    inputJson,
    resultSummaryJson,
    resultJson,
    resultHash: toolCallDigest,
    status: 'complete',
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
