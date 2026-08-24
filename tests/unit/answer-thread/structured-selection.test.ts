import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/modules/answer/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/answer/server')>()
  return {
    ...actual,
    isAnswerToolUseAgentError: () => false,
    runAnswerToolUseAgent: vi.fn(async (input: { query: string }) => {
      const prose = {
        oneLine: 'No live operation was selected.',
        summary: 'The request needs an explicit operation selection.',
        nextStep: 'Choose one of the listed operations.',
      }
      return {
        prose,
        providers: [],
        allowedSlugs: new Set<string>(),
        toolCalls: [],
        modelRequests: [],
        timings: [],
        snapshot: {
          query: input.query,
          ...prose,
          providers: [],
          agentJsonUrl: '',
        },
        gate: { ok: true },
      }
    }),
  }
})

import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import type {
  AnswerOperationCandidate,
  AnswerOperationOutcome,
  AnswerOperationSelection,
} from '@/modules/answer/answer-schema'
import type { AnswerPriorTurnContext } from '@/modules/answer/public'
import { answerOperationCandidateSetDigest } from '@/modules/answer/answer-schema'
import type {
  AnswerPendingDecision,
  AnswerRequestInterpretation,
  AnswerToolCallRecord,
  AnswerTurnCheckpoint,
  AnswerTurnRecord,
  FrozenTurnEvidenceDraft,
} from '@/modules/answer-thread/answer-thread.schema'
import { buildAnswerRunReport } from '@/modules/answer-thread/harness'
import { runAnswerToolUseAgent } from '@/modules/answer/server'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { answerTurnRequestDigest, answerTurnReservationKey, streamAnswerTurn } from '@/modules/answer-thread/server'
import {
  persistAnswerTurnCheckpoint,
  readAnswerTurnCheckpoint,
  reserveAnswerTurn,
} from '@/modules/answer-thread/answer-thread.functions'
import {
  createAnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../../helpers/answer-thread-test-port'
import { parseAnswerOperationSelectionRecognition } from '@/modules/answer-thread/internal/turn-digests'

const SESSION_ID = 'structured-selection-session'
const THREAD_ID = 'structured-selection-thread'
function source() {
  return {
    list: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(null),
    search: vi.fn().mockResolvedValue([]),
  } satisfies KeylessExecutableSourcePort
}
const PENDING_OPERATION_REF = `operation:v1:${'c'.repeat(64)}`
const PENDING_DESCRIPTOR_DIGEST = 'sha256:structured-pending-descriptor'
const PENDING_BINDING_DIGEST = 'sha256:structured-pending-binding'
const PENDING_SNAPSHOT_HASH = 'sha256:structured-pending-snapshot'
const PENDING_TERMINAL_CHECKPOINT_DIGEST = 'sha256:structured-pending-terminal'
const STALE_PENDING_DESCRIPTOR_DIGEST = 'sha256:structured-stale-descriptor'

function pendingInterpretation(): AnswerRequestInterpretation {
  return {
    route: 'confirmation',
    requestedIntents: [{
      intentId: 'confirm-pending',
      phrase: 'yes',
      requestedResult: 'confirmation',
    }],
    continuation: 'resolve_pending',
    effectPolicy: 'run_when_ready',
  }
}

function pendingLineageFixture(input: {
  staleDescriptor?: boolean
} = {}) {
  const candidate: AnswerOperationCandidate = {
    rank: 1,
    operationRef: PENDING_OPERATION_REF,
    operationId: 'structured.pending-authority',
    descriptorDigest: PENDING_DESCRIPTOR_DIGEST,
    executionBindingDigest: PENDING_BINDING_DIGEST,
    business: {
      businessId: 'structured-business',
      slug: 'structured-business',
      name: 'Structured Business',
    },
    offering: {
      offeringRef: 'offering:structured-pending',
      revision: 1,
      label: 'Approval-gated operation',
      summary: 'An operation waiting for authority.',
    },
    matchReason: 'Matches the recorded pending operation.',
    summary: 'The operation needs authority before provider release.',
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
    inputSchemaDigest: 'sha256:structured-pending-input',
    inputJsonSchema: {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    },
    exactRebindRequired: false,
    authority: {
      publisher: 'ae_curated_external',
      sourceKind: 'openapi_http',
      authentication: {
        kind: 'platform_credential',
        scheme: 'api_key',
        in: 'header',
        name: 'Authorization',
      },
    },
    dataUse: [],
    effects: [],
    evidence: [{
      evidenceId: 'pending-result',
      outputPointer: '/output',
      purpose: 'recovery',
    }],
    recovery: { idempotency: 'required', recovery: 'reconcile_required' },
    navigation: [{
      relation: 'invoke',
      method: 'POST',
      actionId: 'operation.invoke',
      authentication: 'required',
      surfaces: ['chat'],
    }],
  }
  const operationCandidates = [candidate]
  const operationCandidatesDigest =
    answerOperationCandidateSetDigest(operationCandidates)
  const invokeResult = {
    kind: 'needs_authority' as const,
    invocationRef: 'invocation:structured-pending',
    operationRef: PENDING_OPERATION_REF,
    authorityRequest: {
      kind: 'approve_each' as const,
      operationRef: PENDING_OPERATION_REF,
      consequence: 'external_effect' as const,
      retryClass: 'replayable' as const,
      dataFields: ['value'],
    },
  }
  const resultDigest = canonicalDigest(invokeResult).toString()
  const inputJson = JSON.stringify({
    operationRef: PENDING_OPERATION_REF,
    input: { value: 'pending' },
    idempotencyKey: 'structured-pending-idempotency',
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
    toolCallId: 'structured-pending-call',
    turnId: 'structured-pending-prior',
    seq: 1,
    toolId: 'operation.invoke',
    inputJson,
    resultSummaryJson,
    resultJson,
    resultHash: toolCallDigest,
    status: 'complete',
    createdAt: 1,
  }
  const operationOutcome: AnswerOperationOutcome = {
    toolId: 'operation.invoke',
    operationRef: PENDING_OPERATION_REF,
    resultDigest,
    toolCallDigest,
    result: invokeResult,
  }
  const operationSelection: AnswerOperationSelection = {
    operationRef: PENDING_OPERATION_REF,
    toolId: 'operation.invoke',
    descriptorDigest: PENDING_DESCRIPTOR_DIGEST,
    executionBindingDigest: PENDING_BINDING_DIGEST,
    resultDigest,
    candidateSetDigest: operationCandidatesDigest,
  }
  const selectedInputDigest = canonicalDigest(inputJson).toString()
  const pendingDecision: AnswerPendingDecision = {
    kind: 'authority_required',
    operationRef: PENDING_OPERATION_REF,
    toolId: 'operation.invoke',
    candidateSetDigest: operationCandidatesDigest,
    descriptorDigest: input.staleDescriptor
      ? STALE_PENDING_DESCRIPTOR_DIGEST
      : PENDING_DESCRIPTOR_DIGEST,
    inputDigest: selectedInputDigest,
    decisionDigest: resultDigest,
    origin: {
      originTurnId: 'structured-pending-prior',
      originGeneration: 0,
      terminalCheckpointDigest: PENDING_TERMINAL_CHECKPOINT_DIGEST,
    },
  }
  const priorEvidence: FrozenTurnEvidenceDraft = {
    providers: [],
    operationCandidates,
    operationCandidatesDigest,
    operationOutcome,
    operationSelection,
    pendingDecision,
    selectedInputDigest,
    terminalCheckpointDigest: PENDING_TERMINAL_CHECKPOINT_DIGEST,
    allowedSlugs: [],
    agentJsonUrl: '',
    toolCalls: [toolCall],
    timings: [],
    workLog: [],
  }
  const priorTurn: AnswerTurnRecord = {
    turnId: 'structured-pending-prior',
    threadId: THREAD_ID,
    seq: 1,
    query: 'run the approval-gated operation',
    intent: 'refine_search',
    evidenceJson: JSON.stringify({
      ...priorEvidence,
      answerRun: buildAnswerRunReport({
        intent: 'refine_search',
        status: 'complete',
        snapshotHash: PENDING_SNAPSHOT_HASH,
        evidence: priorEvidence,
      }),
    }),
    snapshotHash: PENDING_SNAPSHOT_HASH,
    proseJson: JSON.stringify({
      oneLine: 'The operation is waiting for authority.',
      summary: 'Approval is required before release.',
      nextStep: 'Review the authority request.',
    }),
    artifactKindsJson: '["operation-candidates","operation-outcome"]',
    status: 'complete',
    createdAt: 1,
  }
  return {
    priorTurn,
    pendingDecision,
    operationCandidatesDigest,
    continuationSource: {
      priorTurnId: priorTurn.turnId,
      priorTurnSeq: priorTurn.seq,
      priorSnapshotHash: priorTurn.snapshotHash,
      priorTerminalCheckpointDigest: PENDING_TERMINAL_CHECKPOINT_DIGEST,
    },
  }
}

async function executeTurn(input: {
  query: string
  keylessExecutableSource: KeylessExecutableSourcePort
  interpretation?: AnswerRequestInterpretation
  preloadedPriorTurns: readonly AnswerTurnRecord[]
  inspectPriorContext?: (
    priorTurns: readonly AnswerPriorTurnContext[],
  ) => void
}) {
  const store = createAnswerThreadTestStore()
  store.threads.set(THREAD_ID, {
    threadId: THREAD_ID,
    pseudonymousSessionId: SESSION_ID,
    title: 'structured selection',
    createdAt: 1,
    updatedAt: 1,
  })
  const restorePort = installAnswerThreadTestPort(store)
  const requestDigest = answerTurnRequestDigest({
    threadId: THREAD_ID,
    query: input.query,
  })
  const admission = await reserveAnswerTurn({
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    query: input.query,
    requestDigest,
    reservationKey: answerTurnReservationKey({
      sessionId: SESSION_ID,
      threadScope: THREAD_ID,
      clientTurnKey: `structured:${crypto.randomUUID()}`,
    }),
    title: 'structured selection',
  })
  if (admission.kind !== 'reserved') {
    throw new Error(`unexpected admission: ${admission.kind}`)
  }
  const events: unknown[] = []
  try {
    await streamAnswerTurn({
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      query: input.query,
      requestDigest,
      admission,
      sourceWriteRequest: new Request('https://ae.test/api/answer/turn', {
        method: 'POST',
        headers: { 'X-AE-Turn-Key': 'structured-selection' },
      }),
      sourceWriteBody: '',
      keylessExecutableSource: input.keylessExecutableSource,
      preloadedPriorTurns: input.preloadedPriorTurns,
      querySafetyClassifier: async ({ priorTurns = [] }) => {
        input.inspectPriorContext?.(priorTurns)
        return {
          kind: 'allowed',
          interpretation: input.interpretation ?? {
            route: 'operation',
            requestedIntents: [{
              intentId: 'structured-selection-test',
              phrase: input.query,
              requestedResult: input.query,
            }],
            continuation: 'new',
            effectPolicy: 'run_when_ready',
          },
          modelRequest: { status: 'ok', durationMs: 0 },
        }
      },
    }, ({ event }) => events.push(event))
  } finally {
    restorePort()
  }
  return { events, store, turnId: admission.turnId }
}

async function runTurn(
  query: string,
  keylessExecutableSource: KeylessExecutableSourcePort,
  interpretation?: AnswerRequestInterpretation,
) {
  return (
    await executeTurn({
      query,
      keylessExecutableSource,
      ...(interpretation === undefined ? {} : { interpretation }),
      preloadedPriorTurns: [],
    })
  ).events
}

describe('answer turn structured selection gate', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['malformed closing brace', '{"operationRef":"operation:v1:' + 'a'.repeat(64) + '","input":{},"candidateSetDigest":"sha256:' + 'b'.repeat(64) + '"'],
    ['wrong schema', JSON.stringify({ operationRef: `operation:v1:${'a'.repeat(64)}`, input: [], candidateSetDigest: `sha256:${'b'.repeat(64)}` })],
    ['oversized envelope', JSON.stringify({ operationRef: `operation:v1:${'a'.repeat(64)}`, input: { value: 'x'.repeat(256 * 1024) }, candidateSetDigest: `sha256:${'b'.repeat(64)}` })],
    ['oversized envelope with selection fields after the bound', `{"padding":"${'x'.repeat(256 * 1024)}","operationRef":"operation:v1:${'a'.repeat(64)}","input":{},"candidateSetDigest":"sha256:${'b'.repeat(64)}"}`],
  ])('does not search or execute for %s', async (_label, query) => {
    const executableSource = source()
    await runTurn(query, executableSource)
    expect(parseAnswerOperationSelectionRecognition(query).kind).toBe('invalid')
    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
  })

  it('does not search or execute for a valid reordered envelope without frozen candidates', async () => {
    const query = JSON.stringify({
      candidateSetDigest: `sha256:${'b'.repeat(64)}`,
      input: { value: 'Darwin' },
      operationRef: `operation:v1:${'a'.repeat(64)}`,
    })
    const executableSource = source()
    const { store } = await executeTurn({
      query,
      keylessExecutableSource: executableSource,
      preloadedPriorTurns: [],
    })
    expect(parseAnswerOperationSelectionRecognition(query).kind).toBe('valid')
    expect([...store.reservations.values()]).toEqual([
      expect.objectContaining({
        query: `{"candidateSetDigest":"sha256:${'b'.repeat(64)}","input":{"value":"Darwin"},"operationRef":"operation:v1:${'a'.repeat(64)}"}`,
      }),
    ])
    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
  })

  it('supplies frozen operation identity to the follow-up preflight', async () => {
    const fixture = pendingLineageFixture()
    const priorEvidence = JSON.parse(
      fixture.priorTurn.evidenceJson,
    ) as Record<string, unknown>
    delete priorEvidence.pendingDecision
    let priorContext: readonly AnswerPriorTurnContext[] = []

    await executeTurn({
      query: 'What about another value?',
      keylessExecutableSource: source(),
      interpretation: {
        route: 'operation',
        requestedIntents: [{
          intentId: 'follow-up-value',
          phrase: 'another value',
          requestedResult: 'another value',
        }],
        continuation: 'refine_prior_operation',
        effectPolicy: 'run_when_ready',
      },
      preloadedPriorTurns: [{
        ...fixture.priorTurn,
        evidenceJson: JSON.stringify(priorEvidence),
      }],
      inspectPriorContext: (value) => {
        priorContext = value
      },
    })

    expect(priorContext).toEqual([
      expect.objectContaining({
        operation: {
          operationRef: PENDING_OPERATION_REF,
          operationId: 'structured.pending-authority',
          label: 'Approval-gated operation',
        },
      }),
    ])
  })

  it('asks what to execute for bare assent without a bound pending decision', async () => {
    const executableSource = source()
    const events = await runTurn('yes', executableSource, {
      route: 'confirmation',
      requestedIntents: [{
        intentId: 'confirm-1',
        phrase: 'yes',
        requestedResult: 'confirmation',
      }],
      continuation: 'resolve_pending',
      effectPolicy: 'run_when_ready',
    })

    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
    expect(runAnswerToolUseAgent).toHaveBeenCalledTimes(1)
    expect(runAnswerToolUseAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'yes',
        effectiveRoute: expect.objectContaining({
          lane: 'operation',
          effectAllowed: true,
        }),
      }),
    )
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      answer: {
        oneLine: 'No live operation was selected.',
      },
    })
  })
  it('resumes a fully bound pending authority through the frozen selected operation', async () => {
    const fixture = pendingLineageFixture()
    const executableSource = source()
    const { events, store, turnId } = await executeTurn({
      query: 'yes',
      keylessExecutableSource: executableSource,
      interpretation: pendingInterpretation(),
      preloadedPriorTurns: [fixture.priorTurn],
    })

    expect(executableSource.list).not.toHaveBeenCalled()
    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
    expect(runAnswerToolUseAgent).toHaveBeenCalledTimes(1)
    expect(runAnswerToolUseAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'yes',
        effectiveRoute: expect.objectContaining({
          lane: 'operation',
          effectAllowed: true,
        }),
      }),
    )
    expect(runAnswerToolUseAgent).not.toHaveBeenCalledWith(
      expect.objectContaining({
        keylessDataAsk: expect.anything(),
      }),
    )
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      answer: {
        oneLine: 'No live operation was selected.',
      },
    })

    const currentTurn = store.turns.get(turnId)
    expect(currentTurn?.status).toBe('complete')
    const currentEvidence = JSON.parse(currentTurn?.evidenceJson ?? '{}') as {
      continuationSource?: unknown
    }
    expect(currentEvidence.continuationSource).toEqual({
      priorTurnId: 'structured-pending-prior',
      priorTurnSeq: 1,
      priorSnapshotHash: 'sha256:structured-pending-snapshot',
      priorTerminalCheckpointDigest: 'sha256:structured-pending-terminal',
    })
  })

  it('rejects a pending lineage with one stale descriptor digest without I/O or continuation authority', async () => {
    const fixture = pendingLineageFixture({ staleDescriptor: true })
    const executableSource = source()
    const { events, store, turnId } = await executeTurn({
      query: 'yes',
      keylessExecutableSource: executableSource,
      interpretation: pendingInterpretation(),
      preloadedPriorTurns: [fixture.priorTurn],
    })

    expect(executableSource.list).not.toHaveBeenCalled()
    expect(executableSource.search).not.toHaveBeenCalled()
    expect(executableSource.read).not.toHaveBeenCalled()
    expect(runAnswerToolUseAgent).toHaveBeenCalledTimes(1)
    expect(runAnswerToolUseAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'yes',
        effectiveRoute: expect.objectContaining({
          lane: 'operation',
          effectAllowed: true,
        }),
      }),
    )
    expect(events.at(-1)).toMatchObject({
      type: 'complete',
      answer: {
        oneLine: 'No live operation was selected.',
      },
    })

    const currentTurn = store.turns.get(turnId)
    expect(currentTurn?.status).toBe('complete')
    const currentEvidence = JSON.parse(currentTurn?.evidenceJson ?? '{}') as {
      continuationSource?: unknown
      pendingDecision?: unknown
    }
    expect(currentEvidence.pendingDecision).toBeUndefined()
    expect(currentEvidence.continuationSource).toBeUndefined()
  })
  it('clears an older valid pending decision when the new interpretation starts fresh', async () => {
    const fixture = pendingLineageFixture()
    const executableSource = source()
    const { store, turnId } = await executeTurn({
      query: 'weather in Darwin',
      keylessExecutableSource: executableSource,
      interpretation: {
        route: 'operation',
        requestedIntents: [{
          intentId: 'darwin-weather',
          phrase: 'weather in Darwin',
          requestedResult: 'Darwin',
        }],
        continuation: 'new',
        effectPolicy: 'run_when_ready',
      },
      preloadedPriorTurns: [fixture.priorTurn],
    })

    expect(runAnswerToolUseAgent).toHaveBeenCalledTimes(1)
    const agentInput = vi.mocked(runAnswerToolUseAgent).mock.calls[0]?.[0]
    expect(agentInput).toMatchObject({ query: 'weather in Darwin' })
    expect(agentInput).not.toHaveProperty('keylessDataAsk')
    const currentTurn = store.turns.get(turnId)
    const currentEvidence = JSON.parse(currentTurn?.evidenceJson ?? '{}') as {
      continuationSource?: unknown
      pendingDecision?: unknown
    }
    expect(currentEvidence.pendingDecision).toBeUndefined()
    expect(currentEvidence.continuationSource).toBeUndefined()
  })


  it('keeps ordinary natural language on staged model/read navigation', async () => {
    const query = 'weather in Darwin'
    const executableSource = source()
    await runTurn(query, executableSource)
    expect(parseAnswerOperationSelectionRecognition(query)).toEqual({ kind: 'absent' })
    expect(vi.mocked(runAnswerToolUseAgent)).toHaveBeenCalledWith(
      expect.objectContaining({
        query,
        keylessExecutableSource: executableSource,
      }),
    )
    expect(executableSource.search).not.toHaveBeenCalled()
  })


  it('resumes a one-word retrieval checkpoint through the agent path', async () => {
    const query = 'weather'
    const store = createAnswerThreadTestStore()
    store.threads.set(THREAD_ID, {
      threadId: THREAD_ID,
      pseudonymousSessionId: SESSION_ID,
      title: query,
      createdAt: 1,
      updatedAt: 1,
    })
    const restorePort = installAnswerThreadTestPort(store)
    const requestDigest = answerTurnRequestDigest({ threadId: THREAD_ID, query })
    const admission = await reserveAnswerTurn({
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      query,
      requestDigest,
      reservationKey: answerTurnReservationKey({
        sessionId: SESSION_ID,
        threadScope: THREAD_ID,
        clientTurnKey: 'structured:weather-resume',
      }),
      title: query,
    })
    if (admission.kind !== 'reserved') {
      throw new Error(`unexpected admission: ${admission.kind}`)
    }
    const checkpoint: AnswerTurnCheckpoint = {
      schemaVersion: 1,
      reservationKey: admission.reservationKey,
      requestDigest,
      generation: admission.generation,
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      stepOrdinal: 1,
      route: 'tool_search',
      intent: 'refine_search',
      query,
      priorTurnCount: 0,
      priorProviders: [],
      priorAllowedSlugs: [],
      toolCalls: [],
      toolCallDigests: [],
      modelRequests: [],
      replayMessagesJson: '[]',
      continuationSource: {
        priorTurnId: 'checkpoint-prior-turn',
        priorTurnSeq: 1,
        priorSnapshotHash: 'sha256:checkpoint-prior-snapshot',
        priorTerminalCheckpointDigest: 'sha256:checkpoint-prior-terminal',
      },
    }
    await expect(persistAnswerTurnCheckpoint({
      reservationKey: admission.reservationKey,
      requestDigest,
      sessionId: SESSION_ID,
      threadId: admission.threadId,
      turnId: admission.turnId,
      turnSeq: admission.turnSeq,
      generation: admission.generation,
      checkpoint,
    })).resolves.toMatchObject({ kind: 'persisted' })
    try {
      await streamAnswerTurn({
        sessionId: SESSION_ID,
        threadId: THREAD_ID,
        query,
        requestDigest,
        admission,
        keylessExecutableSource: source(),
        preloadedPriorTurns: [],
        querySafetyClassifier: async () => ({
          kind: 'allowed',
          interpretation: {
            route: 'operation',
            requestedIntents: [{
              intentId: 'checkpoint-resume-test',
              phrase: query,
              requestedResult: query,
            }],
            continuation: 'new',
            effectPolicy: 'run_when_ready',
          },
          modelRequest: { status: 'ok', durationMs: 0 },
        }),
      }, () => {})
      expect(vi.mocked(runAnswerToolUseAgent)).toHaveBeenCalledWith(
        expect.objectContaining({
          query,
          resumeCheckpoint: checkpoint,
        }),
      )
      const agentInput = vi.mocked(runAnswerToolUseAgent).mock.calls.at(-1)?.[0]
      await agentInput?.onToolCheckpoint?.({
        stepOrdinal: 2,
        toolCalls: [],
        priorProviders: [],
        priorAllowedSlugs: [],
        modelRequests: [],
        replayMessagesJson: '[]',
      })
      const readback = await readAnswerTurnCheckpoint({
        reservationKey: admission.reservationKey,
        requestDigest,
        sessionId: SESSION_ID,
        threadId: admission.threadId,
        turnId: admission.turnId,
        turnSeq: admission.turnSeq,
        generation: admission.generation,
      })
      expect(readback).toMatchObject({
        kind: 'checkpoint',
        checkpoint: {
          continuationSource: checkpoint.continuationSource,
        },
      })
      if (readback.kind !== 'checkpoint') {
        throw new Error(`unexpected readback: ${readback.kind}`)
      }
      expect(readback.checkpoint).not.toHaveProperty('route')
      expect(readback.checkpoint).not.toHaveProperty('intent')
    } finally {
      restorePort()
    }
  })
})
