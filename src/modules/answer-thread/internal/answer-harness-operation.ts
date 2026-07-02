import {
  HarnessRunPhaseValues,
  HarnessRunLoop,
  type HarnessModelRequestRecord,
  type HarnessRunLoopEventSink,
  type HarnessRunLoopPhaseHandlers,
  type HarnessRunLoopResult,
  type HarnessRunPhase,
  type HarnessRunReport,
  type HarnessRunStatus,
  type HarnessRuntimeEvent,
} from '@/modules/harness/public'

import {
  AnswerToolIdValues,
  type AnswerRunGateSummary,
  type AnswerToolCallRecord,
  type AnswerToolCallStatus,
  type AnswerTurnStatus,
} from '../answer-thread.schema'

type AnswerHarnessOperationClock = () => number

export type AnswerHarnessOperationModelPhase = {
  provider?: string
  model?: string
  run?: () => void | Promise<void>
}

export type AnswerHarnessOperationReportInput = {
  runId: string
  sessionId: string
  status: AnswerTurnStatus
  toolCalls?: readonly AnswerToolCallRecord[]
  gate?: AnswerRunGateSummary
  fallbackReport: HarnessRunReport
  model?: AnswerHarnessOperationModelPhase
  modelRequests?: readonly HarnessModelRequestRecord[]
  now?: AnswerHarnessOperationClock
  onEvent?: HarnessRunLoopEventSink
  persist?: () => void | Promise<void>
}

export type AnswerHarnessOperationState = {
  runId: string
  sessionId: string
  status: AnswerTurnStatus
  gate: AnswerRunGateSummary
  toolCalls: readonly AnswerToolCallRecord[]
  visitedPhases: readonly HarnessRunPhase[]
  observedToolCalls: readonly string[]
  model?: AnswerHarnessOperationModelPhase
  modelRequests: readonly HarnessModelRequestRecord[]
  persisted: boolean
}

export type AnswerHarnessOperationResult = HarnessRunLoopResult<AnswerHarnessOperationState> & {
  events: readonly HarnessRuntimeEvent[]
}

export type LiveAnswerHarnessOperationInput = {
  runId: string
  sessionId: string
  signal?: AbortSignal
  now?: AnswerHarnessOperationClock
  onEvent?: HarnessRunLoopEventSink
}

export type LiveAnswerHarnessOperation = {
  loop: HarnessRunLoop
  events: readonly HarnessRuntimeEvent[]
  start: () => void
  phase: <Result>(phase: HarnessRunPhase, work: () => Result | Promise<Result>) => Promise<Result>
  evaluateGate: (gate: AnswerRunGateSummary, status?: AnswerTurnStatus) => Promise<void>
  persist: <Result>(work: () => Result | Promise<Result>) => Promise<Result>
  complete: (status?: HarnessRunStatus) => HarnessRunReport
}

export function createLiveAnswerHarnessOperation(
  input: LiveAnswerHarnessOperationInput,
): LiveAnswerHarnessOperation {
  const events: HarnessRuntimeEvent[] = []
  const loop = new HarnessRunLoop({
    runId: input.runId,
    sessionId: input.sessionId,
    tools: AnswerToolIdValues,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.now === undefined ? {} : { now: input.now }),
    onEvent: (event) => {
      events.push(event)
      input.onEvent?.(event)
    },
  })

  return {
    loop,
    get events() {
      return events
    },
    start: () => loop.startRun(),
    phase: (phase, work) => loop.phase(phase, work),
    evaluateGate: (gate, status) => evaluateAnswerGate(loop, gate, status ?? gateStatusFromSummary(gate)),
    persist: (work) => loop.persist(work),
    complete: (status) => loop.completeRun(status),
  }
}

export async function buildAnswerHarnessOperationReport(
  input: AnswerHarnessOperationReportInput,
): Promise<HarnessRunReport> {
  try {
    return (await runAnswerHarnessOperation(input)).report
  } catch {
    return input.fallbackReport
  }
}

export async function runAnswerHarnessOperation(
  input: AnswerHarnessOperationReportInput,
): Promise<AnswerHarnessOperationResult> {
  const events: HarnessRuntimeEvent[] = []
  const forwardEvent = input.onEvent
  const now = input.now ?? Date.now
  const loop = new HarnessRunLoop({
    runId: input.runId,
    sessionId: input.sessionId,
    tools: AnswerToolIdValues,
    now,
    onEvent: (event) => {
      events.push(event)
      forwardEvent?.(event)
    },
  })
  const gate = input.gate ?? gateFromTurnStatus(input.status)
  const state = createAnswerHarnessOperationState({
    runId: input.runId,
    sessionId: input.sessionId,
    status: input.status,
    toolCalls: input.toolCalls ?? [],
    gate,
    modelRequests: input.modelRequests ?? [],
    ...(input.model === undefined ? {} : { model: input.model }),
  })
  const result = await loop.run({
    initialState: state,
    phases: buildAnswerHarnessOperationPhases({
      gate,
      now,
      status: input.status,
      ...(input.modelRequests === undefined ? {} : { modelRequests: input.modelRequests }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.persist === undefined ? {} : { persist: input.persist }),
    }),
  })

  return {
    ...result,
    events,
  }
}

export function createAnswerHarnessOperationState(input: {
  runId: string
  sessionId: string
  status: AnswerTurnStatus
  toolCalls?: readonly AnswerToolCallRecord[]
  gate?: AnswerRunGateSummary
  model?: AnswerHarnessOperationModelPhase
  modelRequests?: readonly HarnessModelRequestRecord[]
}): AnswerHarnessOperationState {
  return {
    runId: input.runId,
    sessionId: input.sessionId,
    status: input.status,
    gate: input.gate ?? gateFromTurnStatus(input.status),
    toolCalls: input.toolCalls ?? [],
    visitedPhases: [],
    observedToolCalls: [],
    modelRequests: input.modelRequests ?? [],
    ...(input.model === undefined ? {} : { model: input.model }),
    persisted: false,
  }
}

export function buildAnswerHarnessOperationPhases(input: {
  gate?: AnswerRunGateSummary
  model?: AnswerHarnessOperationModelPhase
  modelRequests?: readonly HarnessModelRequestRecord[]
  now?: AnswerHarnessOperationClock
  persist?: () => void | Promise<void>
  status?: AnswerTurnStatus
} = {}): HarnessRunLoopPhaseHandlers<AnswerHarnessOperationState> {
  const now = input.now ?? Date.now

  return Object.fromEntries(HarnessRunPhaseValues.map((phase) => [
    phase,
    async ({ loop, state }) => {
      const nextState = touchPhase(state, phase)

      switch (phase) {
        case 'retrieval':
          for (const toolCall of nextState.toolCalls) {
            recordObservedToolCall(loop, toolCall, now)
          }
          return {
            ...nextState,
            observedToolCalls: nextState.toolCalls.map((toolCall) => toolCall.toolCallId),
          }
        case 'model':
          for (const modelRequest of input.modelRequests ?? nextState.modelRequests) {
            recordObservedModelRequest(loop, modelRequest, now)
          }
          if (input.model === undefined) {
            return nextState
          }
          await loop.runModel<void>(input.model, async () => {
            await input.model?.run?.()
          })
          return nextState
        case 'gate':
          await evaluateAnswerGate(loop, input.gate ?? nextState.gate, input.status ?? nextState.status)
          return nextState
        case 'persist':
          await input.persist?.()
          return {
            ...nextState,
            persisted: true,
          }
        default:
          return nextState
      }
    },
  ])) as HarnessRunLoopPhaseHandlers<AnswerHarnessOperationState>
}

async function evaluateAnswerGate(
  loop: HarnessRunLoop,
  gate: AnswerRunGateSummary,
  status: AnswerTurnStatus,
): Promise<void> {
  if (gate.ok || gate.code === undefined) {
    await loop.evaluateGate(gate.source, () => gate.ok, gate.ok ? {} : { errorCode: 'answer_gate_blocked' })
    return
  }

  const code = gate.code
  if (status === 'error') {
    await loop.evaluateGate(gate.source, () => {
      throw createGateError(code)
    }).catch(() => false)
    return
  }

  await loop.evaluateGate(gate.source, () => false, { errorCode: code })
}

function touchPhase(
  state: AnswerHarnessOperationState,
  phase: HarnessRunPhase,
): AnswerHarnessOperationState {
  return {
    ...state,
    visitedPhases: [...state.visitedPhases, phase],
  }
}

function recordObservedToolCall(
  loop: HarnessRunLoop,
  toolCall: AnswerToolCallRecord,
  now: AnswerHarnessOperationClock,
): void {
  const startedAt = now()
  loop.recordRuntimeEvent({
    type: 'tool.started',
    runId: loop.runId,
    toolCallId: toolCall.toolCallId,
    toolId: toolCall.toolId,
    at: startedAt,
  })
  loop.recordRuntimeEvent({
    type: toolCall.status === 'complete' ? 'tool.completed' : 'tool.failed',
    runId: loop.runId,
    toolCallId: toolCall.toolCallId,
    toolId: toolCall.toolId,
    at: now(),
    status: answerToolCallStatusToHarnessStatus(toolCall.status),
    durationMs: 0,
    ...(toolCall.status === 'complete' ? {} : { errorCode: readToolCallErrorCode(toolCall) }),
  })
}

function recordObservedModelRequest(
  loop: HarnessRunLoop,
  modelRequest: HarnessModelRequestRecord,
  now: AnswerHarnessOperationClock,
): void {
  const startedAt = modelRequest.startedAt ?? now()
  const durationMs = modelRequest.durationMs
  const endedAt = modelRequest.endedAt ?? startedAt + durationMs
  const errorCode = modelRequest.status === 'ok'
    ? undefined
    : modelRequest.errorCode ?? `model_${modelRequest.status}`

  loop.recordRuntimeEvent({
    type: 'model.started',
    runId: loop.runId,
    at: startedAt,
    ...(modelRequest.seq === undefined ? {} : { seq: modelRequest.seq }),
    ...(modelRequest.provider === undefined ? {} : { provider: modelRequest.provider }),
    ...(modelRequest.model === undefined ? {} : { model: modelRequest.model }),
    ...(modelRequest.requestId === undefined ? {} : { requestId: modelRequest.requestId }),
    ...(modelRequest.costUnavailableReason === undefined ? {} : { costUnavailableReason: modelRequest.costUnavailableReason }),
  })
  loop.recordRuntimeEvent({
    type: modelRequest.status === 'ok' ? 'model.completed' : 'model.failed',
    runId: loop.runId,
    at: endedAt,
    durationMs,
    ...(modelRequest.seq === undefined ? {} : { seq: modelRequest.seq }),
    ...(modelRequest.provider === undefined ? {} : { provider: modelRequest.provider }),
    ...(modelRequest.model === undefined ? {} : { model: modelRequest.model }),
    ...(modelRequest.stopReason === undefined ? {} : { stopReason: modelRequest.stopReason }),
    ...(modelRequest.requestId === undefined ? {} : { requestId: modelRequest.requestId }),
    ...(modelRequest.responseId === undefined ? {} : { responseId: modelRequest.responseId }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(modelRequest.usage === undefined ? {} : { usage: modelRequest.usage }),
    ...(modelRequest.costUsd === undefined ? {} : { costUsd: modelRequest.costUsd }),
    ...(modelRequest.costUnavailableReason === undefined ? {} : { costUnavailableReason: modelRequest.costUnavailableReason }),
  })
}

function gateFromTurnStatus(status: AnswerTurnStatus): AnswerRunGateSummary {
  return {
    ok: status === 'complete',
    source: 'turn_status',
    ...(status === 'error' ? { code: 'turn_error' } : {}),
  }
}

function gateStatusFromSummary(gate: AnswerRunGateSummary): AnswerTurnStatus {
  return gate.ok ? 'complete' : 'error'
}

function answerToolCallStatusToHarnessStatus(status: AnswerToolCallStatus): HarnessRunStatus {
  switch (status) {
    case 'complete':
      return 'ok'
    case 'refused':
      return 'refused'
    case 'error':
      return 'error'
  }
}

function readToolCallErrorCode(toolCall: AnswerToolCallRecord): string {
  try {
    const parsed = JSON.parse(toolCall.resultSummaryJson) as { errorCode?: unknown }
    if (typeof parsed.errorCode === 'string' && parsed.errorCode.trim().length > 0) {
      return parsed.errorCode
    }
  } catch {
    // Fall through to a stable generic code.
  }
  return toolCall.status === 'refused' ? 'tool_refused' : 'tool_error'
}

function createGateError(code: string): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}
