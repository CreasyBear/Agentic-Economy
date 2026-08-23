import type { ActionContext } from '@/modules/common/action'
import { createRuntimeId, createRuntimeIdPrefix } from '@/modules/common/runtime-id'
import { isRecord } from '@/modules/common/is-record'
import { runWithAbortAndTimeout } from '@/modules/common/transport-timeout'
import { roundFiniteNonNegative2 } from '@/modules/common/round-nonnegative-2'

import {
  runHarnessTool,
  type HarnessToolSurface,
  type RunHarnessToolInput,
  type RunHarnessToolOutcome,
} from './action-tool'
import {
  createHarnessRunCollector,
  type HarnessRunCollector,
} from './run-collector'
import {
  HarnessRunPhaseValues,
  type HarnessRun,
  type HarnessModelRequestRecord,
  type HarnessModelUsage,
  type HarnessRunPhase,
  type HarnessRunReport,
  type HarnessRunStatus,
  type HarnessRuntimeEvent,
  type HarnessToolDefinition,
} from './harness.schema'

type HarnessRunLoopClock = () => number

export type HarnessRunLoopEventSink = (event: HarnessRuntimeEvent) => void

export type HarnessRunLoopOptions = {
  runId?: string
  sessionId?: string
  collector?: HarnessRunCollector
  tools?: readonly (string | { id: string })[]
  now?: HarnessRunLoopClock
  signal?: AbortSignal
  timeoutMs?: number
  toolTimeoutMs?: number
  toolContext?: ActionContext
  surface?: HarnessToolSurface
  onEvent?: HarnessRunLoopEventSink
  throwOnError?: boolean
}

export type HarnessRunLoopPhaseContext<State> = {
  loop: HarnessRunLoop
  phase: HarnessRunPhase
  state: State
  signal?: AbortSignal
}

export type HarnessRunLoopPhaseHandler<State> = (
  context: HarnessRunLoopPhaseContext<State>,
) => State | void | Promise<State | void>

export type HarnessRunLoopPhaseHandlers<State> = Partial<Record<
  HarnessRunPhase,
  HarnessRunLoopPhaseHandler<State>
>>

export type HarnessRunLoopRunInput<State> = {
  initialState: State
  phases?: HarnessRunLoopPhaseHandlers<State>
  throwOnError?: boolean
}

export type HarnessRunLoopResult<State> = HarnessRun & {
  state: State
  report: HarnessRunReport
  error?: unknown
}

export type HarnessRunLoopToolInput<Input = unknown, Output = unknown> = Omit<
  RunHarnessToolInput,
  'input' | 'tool' | 'toolCallId'
> & {
  tool: HarnessToolDefinition<Input, Output>
  input: Input
  toolCallId?: string
  classifyResult?: (result: RunHarnessToolOutcome['result']) => RunHarnessToolOutcome['result']
}

export type HarnessRunLoopToolBatchInput = HarnessRunLoopToolInput<unknown, unknown>

export type HarnessRunLoopModelAccounting = Partial<Pick<
  HarnessModelRequestRecord,
  'seq' | 'stopReason' | 'requestId' | 'responseId' | 'usage' | 'costUsd' | 'costUnavailableReason'
>>

type HarnessRunLoopModelRuntimeEventAccounting = {
  seq?: number
  provider?: string
  model?: string
  stopReason?: string
  requestId?: string
  responseId?: string
  usage?: HarnessModelUsage
  costUsd?: number
  costUnavailableReason?: string
}

export type HarnessRunLoopModelInput<Result = unknown> = {
  seq?: number
  provider?: string
  model?: string
  requestId?: string
  costUnavailableReason?: string
  summarize?: (result: Result) => HarnessRunLoopModelAccounting | undefined
  summarizeError?: (error: unknown) => HarnessRunLoopModelAccounting | undefined
}

export type HarnessRunLoopGuardedWork<T> = (signal: AbortSignal | undefined) => T | Promise<T>

export class HarnessRunLoop {
  readonly runId: string
  readonly sessionId: string
  readonly collector: HarnessRunCollector

  private readonly now: HarnessRunLoopClock
  private readonly signal: AbortSignal | undefined
  private readonly timeoutMs: number | undefined
  private readonly toolTimeoutMs: number | undefined
  private readonly toolContext: ActionContext | undefined
  private readonly surface: HarnessToolSurface | undefined
  private readonly onEvent: HarnessRunLoopEventSink | undefined
  private readonly shouldThrowOnError: boolean
  private readonly runtimeEvents: HarnessRuntimeEvent[] = []
  private nextModelSeq = 0

  private startedAt: number | undefined
  private endedAt: number | undefined
  private status: HarnessRunStatus = 'ok'

  constructor(options: HarnessRunLoopOptions = {}) {
    this.runId = options.runId ?? createRunId()
    this.sessionId = options.sessionId ?? createSessionId()
    this.collector = options.collector ?? createHarnessRunCollector(options.tools ?? [])
    this.now = options.now ?? Date.now
    this.signal = options.signal
    this.timeoutMs = options.timeoutMs
    this.toolTimeoutMs = options.toolTimeoutMs
    this.toolContext = options.toolContext
    this.surface = options.surface
    this.onEvent = options.onEvent
    this.shouldThrowOnError = options.throwOnError ?? false

    if (options.collector !== undefined && options.tools !== undefined) {
      this.collector.noteAvailableTools(options.tools)
    }
  }

  get events(): readonly HarnessRuntimeEvent[] {
    return this.runtimeEvents
  }

  async run<State>(input: HarnessRunLoopRunInput<State>): Promise<HarnessRunLoopResult<State>> {
    this.startRun()

    let state = input.initialState
    let caughtError: unknown

    for (const phase of HarnessRunPhaseValues) {
      if (phase === 'report') {
        continue
      }
      try {
        state = await this.runPhase(phase, state, input.phases?.[phase], { applyGuards: true })
      } catch (error) {
        caughtError = error
        this.status = dominantStatus(this.status, statusFromError(error))
        break
      }
    }

    try {
      state = await this.runPhase('report', state, input.phases?.report, { applyGuards: false })
    } catch (error) {
      if (caughtError === undefined) {
        caughtError = error
      }
      this.status = dominantStatus(this.status, statusFromError(error))
    }

    const report = this.completeRun(this.status)

    const startedAt = this.startedAt ?? report.summary.run.startedAt ?? this.now()
    const result: HarnessRunLoopResult<State> = {
      runId: this.runId,
      sessionId: this.sessionId,
      status: this.status,
      startedAt,
      ...(this.endedAt === undefined ? {} : { endedAt: this.endedAt }),
      durationMs: report.summary.run.durationMs,
      state,
      report,
      ...(caughtError === undefined ? {} : { error: caughtError }),
    }

    if (caughtError !== undefined && (input.throwOnError ?? this.shouldThrowOnError)) {
      throw new HarnessRunLoopExecutionError(result)
    }

    return result
  }

  startRun(): void {
    if (this.endedAt !== undefined) {
      throw new Error('HarnessRunLoop instances cannot restart after completion')
    }
    if (this.startedAt !== undefined) {
      return
    }

    this.startedAt = this.now()
    this.emit({
      type: 'run.started',
      runId: this.runId,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
    })
  }

  completeRun(status?: HarnessRunStatus): HarnessRunReport {
    this.startRun()

    if (status !== undefined) {
      this.status = dominantStatus(this.status, status)
    }
    if (this.endedAt !== undefined) {
      return this.snapshot(this.status)
    }

    this.endedAt = this.now()
    const derivedReport = this.collector.snapshot({
      runId: this.runId,
      sessionId: this.sessionId,
      ...(this.startedAt === undefined ? {} : { startedAt: this.startedAt }),
      endedAt: this.endedAt,
    })
    this.status = dominantStatus(this.status, derivedReport.summary.run.status)
    const report = this.snapshot(this.status)
    this.emit({ type: 'run.completed', runId: this.runId, report })
    return report
  }

  async phase<T>(phase: string, work: HarnessRunLoopGuardedWork<T>): Promise<T> {
    this.startRun()
    return this.withPhaseEvents(phase, () => this.withRunGuards(work))
  }

  async runTool<Input, Output>(
    input: HarnessRunLoopToolInput<Input, Output>,
  ): Promise<RunHarnessToolOutcome> {
    const toolCallId = input.toolCallId ?? createToolCallId(input.tool.id)
    const startedAt = this.now()

    this.emit({
      type: 'tool.started',
      runId: this.runId,
      toolCallId,
      toolId: input.tool.id,
      at: startedAt,
    })

    try {
      const rawOutcome = await this.withRunGuards((signal) => runHarnessTool(this.toolInput(input, toolCallId, signal)))
      const outcome = input.classifyResult === undefined
        ? rawOutcome
        : { ...rawOutcome, result: input.classifyResult(rawOutcome.result) }
      const status = outcome.result.status
      this.emit({
        type: status === 'ok' ? 'tool.completed' : 'tool.failed',
        runId: this.runId,
        toolCallId,
        toolId: input.tool.id,
        at: this.now(),
        status,
        durationMs: this.elapsedSince(startedAt),
        ...(outcome.result.errorCode === undefined ? {} : { errorCode: outcome.result.errorCode }),
      })
      return outcome
    } catch (error) {
      this.emit({
        type: 'tool.failed',
        runId: this.runId,
        toolCallId,
        toolId: input.tool.id,
        at: this.now(),
        status: statusFromError(error),
        durationMs: this.elapsedSince(startedAt),
        errorCode: errorCodeFromError(error),
      })
      throw error
    }
  }

  async runToolBatch(
    inputs: readonly HarnessRunLoopToolBatchInput[],
  ): Promise<RunHarnessToolOutcome[]> {
    const outcomes: RunHarnessToolOutcome[] = []
    const tasks: Promise<void>[] = []
    let lastExclusive: Promise<void> = Promise.resolve()
    let sharedTasks: Promise<void>[] = []

    inputs.forEach((input, index) => {
      const concurrency = input.tool.concurrency ?? 'shared'
      const start = concurrency === 'exclusive'
        ? Promise.all([lastExclusive, ...sharedTasks])
        : lastExclusive
      const task = start.then(async () => {
        outcomes[index] = await this.runTool(input)
      })

      tasks.push(task)
      if (concurrency === 'exclusive') {
        lastExclusive = task
        sharedTasks = []
      } else {
        sharedTasks.push(task)
      }
    })

    const settled = await Promise.allSettled(tasks)
    const rejected = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (rejected !== undefined) {
      throw rejected.reason
    }

    return outcomes
  }

  async runModel<T>(
    input: HarnessRunLoopModelInput<T>,
    work: HarnessRunLoopGuardedWork<T>,
  ): Promise<T> {
    const startedAt = this.now()
    this.emit({
      type: 'model.started',
      runId: this.runId,
      at: startedAt,
      ...(input.seq === undefined ? {} : { seq: input.seq }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
      ...(input.costUnavailableReason === undefined ? {} : { costUnavailableReason: input.costUnavailableReason }),
    })

    try {
      const result = await this.withRunGuards(work)
      const accounting = input.summarize?.(result)
      this.emit({
        type: 'model.completed',
        runId: this.runId,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
        ...this.modelEventAccounting(input, accounting),
      })
      return result
    } catch (error) {
      const accounting = input.summarizeError?.(error)
      this.emit({
        type: 'model.failed',
        runId: this.runId,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
        errorCode: errorCodeFromError(error),
        ...this.modelEventAccounting(input, accounting),
      })
      throw error
    }
  }

  async evaluateGate(
    gate: string,
    work: () => boolean | Promise<boolean>,
    options: { errorCode?: string } = {},
  ): Promise<boolean> {
    const startedAt = this.now()
    try {
      const ok = await this.withRunGuards(work)
      this.emit({
        type: 'gate.evaluated',
        runId: this.runId,
        gate,
        ok,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
        ...(ok || options.errorCode === undefined ? {} : { errorCode: options.errorCode }),
      })
      return ok
    } catch (error) {
      this.emit({
        type: 'gate.evaluated',
        runId: this.runId,
        gate,
        ok: false,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
        errorCode: errorCodeFromError(error),
      })
      throw error
    }
  }

  async persist<T>(work: HarnessRunLoopGuardedWork<T>): Promise<T> {
    const startedAt = this.now()
    this.emit({
      type: 'persist.started',
      runId: this.runId,
      at: startedAt,
    })

    try {
      const result = await this.withRunGuards(work)
      this.emit({
        type: 'persist.completed',
        runId: this.runId,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
      })
      return result
    } catch (error) {
      this.emit({
        type: 'persist.failed',
        runId: this.runId,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
        errorCode: errorCodeFromError(error),
      })
      throw error
    }
  }

  emitOperationEvent(event: unknown): void {
    this.emit({
      type: 'operation.event',
      runId: this.runId,
      at: this.now(),
      event,
    })
  }

  recordRuntimeEvent(event: HarnessRuntimeEvent): void {
    this.emit(event)
  }

  recordModelRequest(record: HarnessModelRequestRecord): void {
    const seq = this.nextModelSeq
    this.nextModelSeq += 1
    this.collector.recordModelRequest({ ...record, seq })
  }

  snapshot(status?: HarnessRunStatus): HarnessRunReport {
    const derivedReport = this.collector.snapshot({
      runId: this.runId,
      sessionId: this.sessionId,
      ...(this.startedAt === undefined ? {} : { startedAt: this.startedAt }),
      ...(this.endedAt === undefined ? {} : { endedAt: this.endedAt }),
    })
    const resolvedStatus = status ?? dominantStatus(this.status, derivedReport.summary.run.status)
    if (derivedReport.summary.run.status === resolvedStatus) {
      return derivedReport
    }

    return this.collector.snapshot({
      runId: this.runId,
      sessionId: this.sessionId,
      status: resolvedStatus,
      ...(this.startedAt === undefined ? {} : { startedAt: this.startedAt }),
      ...(this.endedAt === undefined ? {} : { endedAt: this.endedAt }),
    })
  }

  private async withPhaseEvents<T>(phase: string, work: () => Promise<T>): Promise<T> {
    const startedAt = this.now()
    this.emit({
      type: 'phase.started',
      runId: this.runId,
      phase,
      at: startedAt,
    })

    try {
      const result = await work()
      this.emit({
        type: 'phase.completed',
        runId: this.runId,
        phase,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
      })
      return result
    } catch (error) {
      this.emit({
        type: 'phase.failed',
        runId: this.runId,
        phase,
        at: this.now(),
        durationMs: this.elapsedSince(startedAt),
        errorCode: errorCodeFromError(error),
      })
      throw error
    }
  }

  private runPhase<State>(
    phase: HarnessRunPhase,
    state: State,
    handler: HarnessRunLoopPhaseHandler<State> | undefined,
    options: { applyGuards: boolean },
  ): Promise<State> {
    return this.withPhaseEvents(
      phase,
      () => this.runPhaseHandler(phase, state, handler, options),
    )
  }

  private async runPhaseHandler<State>(
    phase: HarnessRunPhase,
    state: State,
    handler: HarnessRunLoopPhaseHandler<State> | undefined,
    options: { applyGuards: boolean },
  ): Promise<State> {
    const execute = async (signal: AbortSignal | undefined): Promise<State> => {
      if (handler === undefined) {
        return state
      }
      const maybeNextState = await handler({
        loop: this,
        phase,
        state,
        ...(signal === undefined ? {} : { signal }),
      })
      return maybeNextState === undefined ? state : maybeNextState
    }

    return options.applyGuards ? this.withRunGuards(execute) : execute(this.signal)
  }

  private async withRunGuards<T>(work: HarnessRunLoopGuardedWork<T>): Promise<T> {
    this.throwIfAborted()
    this.throwIfTimedOut()

    const remainingTimeoutMs = this.remainingTimeoutMs()
    return runWithAbortAndTimeout({
      run: work,
      ...(remainingTimeoutMs === undefined ? {} : { timeoutMs: remainingTimeoutMs }),
      ...(remainingTimeoutMs === undefined ? {} : { timeoutErrorMs: this.timeoutMs ?? remainingTimeoutMs }),
      ...(this.signal === undefined ? {} : { parentSignal: this.signal }),
      deferRun: true,
      abortError: (reason) => new HarnessRunLoopAbortError(reason),
      timeoutError: (timeoutMs) => new HarnessRunLoopTimeoutError(timeoutMs),
    })
  }

  private toolInput<Input, Output>(
    input: HarnessRunLoopToolInput<Input, Output>,
    toolCallId: string,
    signal: AbortSignal | undefined,
  ): RunHarnessToolInput {
    const context = input.context ?? this.toolContext
    const surface = input.surface ?? this.surface
    const timeoutMs = input.timeoutMs ?? this.toolTimeoutMs

    return {
      tool: input.tool as HarnessToolDefinition<unknown, unknown>,
      input: input.input,
      toolCallId,
      mode: input.mode,
      ...(context === undefined ? {} : { context }),
      ...(surface === undefined ? {} : { surface }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(signal === undefined ? {} : { signal }),
    }
  }

  private throwIfAborted(): void {
    if (this.signal?.aborted === true) {
      throw new HarnessRunLoopAbortError(this.signal.reason)
    }
  }

  private throwIfTimedOut(): void {
    const remainingTimeoutMs = this.remainingTimeoutMs()
    if (remainingTimeoutMs !== undefined && remainingTimeoutMs <= 0) {
      throw new HarnessRunLoopTimeoutError(this.timeoutMs ?? 0)
    }
  }

  private remainingTimeoutMs(): number | undefined {
    if (this.timeoutMs === undefined || this.startedAt === undefined) {
      return undefined
    }
    return Math.max(0, this.timeoutMs - (this.now() - this.startedAt))
  }

  private elapsedSince(startedAt: number): number {
    return roundFiniteNonNegative2(this.now() - startedAt)
  }

  private emit(event: HarnessRuntimeEvent): void {
    if (event.type === 'model.completed' || event.type === 'model.failed') {
      this.nextModelSeq = Math.max(this.nextModelSeq, (event.seq ?? this.nextModelSeq) + 1)
    }
    this.runtimeEvents.push(event)
    this.collector.recordRuntimeEvent(event)
    try {
      this.onEvent?.(event)
    } catch {
      // Observers must not be able to change the runtime outcome.
    }
  }

  private modelEventAccounting(
    input: {
      seq?: number
      provider?: string
      model?: string
      requestId?: string
      costUnavailableReason?: string
    },
    accounting: HarnessRunLoopModelAccounting | undefined,
  ): HarnessRunLoopModelRuntimeEventAccounting {
    const seq = accounting?.seq ?? input.seq
    const requestId = accounting?.requestId ?? input.requestId
    const costUnavailableReason = accounting?.costUnavailableReason ?? input.costUnavailableReason
    const usage = accounting?.usage
    return {
      ...(seq === undefined ? {} : { seq }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(accounting?.stopReason === undefined ? {} : { stopReason: accounting.stopReason }),
      ...(requestId === undefined ? {} : { requestId }),
      ...(accounting?.responseId === undefined ? {} : { responseId: accounting.responseId }),
      ...(usage === undefined ? {} : { usage }),
      ...(accounting?.costUsd === undefined ? {} : { costUsd: accounting.costUsd }),
      ...(costUnavailableReason === undefined ? {} : { costUnavailableReason }),
    }
  }
}

export class HarnessRunLoopExecutionError extends Error {
  readonly result: HarnessRunLoopResult<unknown>

  constructor(result: HarnessRunLoopResult<unknown>) {
    super(`Harness run ${result.runId} ended with ${result.status}`)
    this.name = 'HarnessRunLoopExecutionError'
    this.result = result
  }
}

export class HarnessRunLoopAbortError extends Error {
  readonly code = 'run_aborted'

  constructor(reason: unknown) {
    super(typeof reason === 'string' && reason.trim().length > 0 ? reason : 'Harness run aborted')
    this.name = 'HarnessRunLoopAbortError'
  }
}

export class HarnessRunLoopTimeoutError extends Error {
  readonly code = 'run_timeout'

  constructor(timeoutMs: number) {
    super(`Harness run timed out after ${timeoutMs}ms`)
    this.name = 'HarnessRunLoopTimeoutError'
  }
}

function statusFromError(error: unknown): HarnessRunStatus {
  if (error instanceof HarnessRunLoopAbortError) {
    return 'aborted'
  }
  if (error instanceof HarnessRunLoopTimeoutError) {
    return 'timeout'
  }
  return 'error'
}

function errorCodeFromError(error: unknown): string {
  if (error instanceof HarnessRunLoopAbortError || error instanceof HarnessRunLoopTimeoutError) {
    return error.code
  }
  if (isRecord(error) && typeof error.code === 'string' && error.code.trim().length > 0) {
    return normalizeErrorCode(error.code)
  }
  return 'run_error'
}

function dominantStatus(current: HarnessRunStatus, next: HarnessRunStatus): HarnessRunStatus {
  return statusPriority(next) > statusPriority(current) ? next : current
}

function statusPriority(status: HarnessRunStatus): number {
  switch (status) {
    case 'aborted':
      return 6
    case 'timeout':
      return 5
    case 'error':
      return 4
    case 'blocked':
      return 3
    case 'refused':
      return 2
    case 'skipped':
      return 1
    case 'ok':
      return 0
  }
}

function createRunId(): string {
  return createRuntimeId('hr')
}

function createSessionId(): string {
  return createRuntimeId('hs')
}

function createToolCallId(toolId: string): string {
  return createRuntimeId(createRuntimeIdPrefix('ht', toolId))
}



function normalizeErrorCode(value: string): string {
  return value.trim().replaceAll(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
}
