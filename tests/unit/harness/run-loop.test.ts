import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  buildHarnessRunReport,
  HarnessRunLoop,
  HarnessRunLoopExecutionError,
  HarnessRunPhaseValues,
  type HarnessRunLoopPhaseHandlers,
  type HarnessRuntimeEvent,
  type HarnessToolDefinition,
} from '@/modules/harness/public'

describe('harness run loop', () => {
  it('emits the answer phase order and finalizes a report', async () => {
    const clock = createClock()
    const events: HarnessRuntimeEvent[] = []
    const loop = new HarnessRunLoop({
      runId: 'run-phase-order',
      sessionId: 'session-phase-order',
      now: clock.now,
      onEvent: (event) => events.push(event),
    })

    const phases = Object.fromEntries(HarnessRunPhaseValues.map((phase) => [
      phase,
      ({ state }: { state: { touched: string[] } }) => {
        clock.tick(2)
        return { touched: [...state.touched, phase] }
      },
    ])) as HarnessRunLoopPhaseHandlers<{ touched: string[] }>

    const result = await loop.run({
      initialState: { touched: [] as string[] },
      phases,
    })

    const phaseEvents = events.filter((event) => event.type.startsWith('phase.'))

    expect(result.status).toBe('ok')
    expect(result.report.summary.run).toMatchObject({
      runId: 'run-phase-order',
      sessionId: 'session-phase-order',
      status: 'ok',
    })
    expect(result.state.touched).toEqual(HarnessRunPhaseValues)
    expect(phaseEvents.map((event) => event.type)).toEqual(
      HarnessRunPhaseValues.flatMap(() => ['phase.started', 'phase.completed']),
    )
    expect(phaseEvents.map((event) => 'phase' in event ? event.phase : '')).toEqual(
      HarnessRunPhaseValues.flatMap((phase) => [phase, phase]),
    )
    expect(events.at(-1)?.type).toBe('run.completed')
  })

  it('captures sanitized operation events in the live collector', async () => {
    const clock = createClock()
    const events: HarnessRuntimeEvent[] = []
    const loop = new HarnessRunLoop({
      runId: 'run-operation',
      sessionId: 'session-operation',
      now: clock.now,
      onEvent: (event) => events.push(event),
    })

    const result = await loop.run({
      initialState: {},
      phases: {
        assemble: ({ loop }) => {
          clock.tick(1)
          loop.emitOperationEvent({ type: 'answer.delta', public: true })
        },
      },
    })

    const operationEvent = events.find((event) => event.type === 'operation.event')

    expect(operationEvent).toMatchObject({
      type: 'operation.event',
      runId: 'run-operation',
      event: { type: 'answer.delta', public: true },
    })
    expect(result.report.summary.events.byPhase.operation).toMatchObject({
      total: 1,
      ok: 1,
    })
  })

  it('captures tool begin/end from live execution', async () => {
    const clock = createClock()
    const events: HarnessRuntimeEvent[] = []
    const tool = createReadTool(clock)
    const loop = new HarnessRunLoop({
      runId: 'run-tool',
      sessionId: 'session-tool',
      tools: [tool],
      now: clock.now,
      onEvent: (event) => events.push(event),
    })

    const result = await loop.run({
      initialState: { count: 0 },
      phases: {
        retrieval: async ({ loop, state }) => {
          const outcome = await loop.runTool({
            tool,
            input: { q: 'plumber' },
            surface: 'agentTools',
          })
          const output = outcome.result.output as { count?: unknown } | undefined
          return { count: typeof output?.count === 'number' ? output.count : state.count }
        },
      },
    })

    const toolEvents = events.filter((event) => event.type.startsWith('tool.'))

    expect(toolEvents.map((event) => event.type)).toEqual(['tool.started', 'tool.completed'])
    expect(toolEvents).toMatchObject([
      { type: 'tool.started', toolId: 'registry.search' },
      { type: 'tool.completed', toolId: 'registry.search', status: 'ok', durationMs: 5 },
    ])
    expect(result.state.count).toBe(1)
    expect(result.report.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      ok: 1,
      totalDurationMs: 5,
    })
    expect(result.report.coverage.toolsUnused).toEqual([])
  })

  it('schedules tool batches with OMP-style shared and exclusive ordering', async () => {
    const log: string[] = []
    const first = createDeferred<void>()
    const second = createDeferred<void>()
    const third = createDeferred<void>()
    const loop = new HarnessRunLoop({
      runId: 'run-tool-batch',
      sessionId: 'session-tool-batch',
      tools: ['tool.first', 'tool.second', 'tool.third'],
    })

    const batch = loop.runToolBatch([
      {
        tool: createBatchTool('tool.first', 'shared', 'first', first.promise, log),
        input: {},
        surface: 'agentTools',
      },
      {
        tool: createBatchTool('tool.second', 'exclusive', 'second', second.promise, log),
        input: {},
        surface: 'agentTools',
      },
      {
        tool: createBatchTool('tool.third', 'shared', 'third', third.promise, log),
        input: {},
        surface: 'agentTools',
      },
    ])

    await waitForLog(log, ['start:first'])
    expect(log).toEqual(['start:first'])

    first.resolve()
    await waitForLog(log, ['start:first', 'finish:first', 'start:second'])
    expect(log).toEqual(['start:first', 'finish:first', 'start:second'])

    second.resolve()
    await waitForLog(log, ['start:first', 'finish:first', 'start:second', 'finish:second', 'start:third'])
    expect(log).toEqual(['start:first', 'finish:first', 'start:second', 'finish:second', 'start:third'])

    third.resolve()
    const outcomes = await batch

    expect(log).toEqual([
      'start:first',
      'finish:first',
      'start:second',
      'finish:second',
      'start:third',
      'finish:third',
    ])
    expect(outcomes.map((outcome) => outcome.result.status)).toEqual(['ok', 'ok', 'ok'])
    expect(loop.snapshot().summary.tools.total).toBe(3)
  })

  it('folds non-throwing tool and gate failures into the terminal run status', async () => {
    const clock = createClock()
    const events: HarnessRuntimeEvent[] = []
    const tool = createReadTool(clock)
    const loop = new HarnessRunLoop({
      runId: 'run-nonthrowing-failures',
      sessionId: 'session-nonthrowing-failures',
      tools: [tool],
      now: clock.now,
      onEvent: (event) => events.push(event),
    })

    const result = await loop.run({
      initialState: {},
      phases: {
        retrieval: async ({ loop }) => {
          await loop.runTool({
            tool,
            input: { q: 42 } as unknown as { q: string },
            surface: 'agentTools',
          })
        },
        gate: ({ loop }) => loop.evaluateGate(
          'catalog-grounding',
          () => false,
          { errorCode: 'grounding_failed' },
        ),
      },
    })

    const completed = events.find((event) => event.type === 'run.completed')

    expect(result.status).toBe('error')
    expect(result.report.summary.run.status).toBe('error')
    expect(completed).toMatchObject({
      type: 'run.completed',
      report: {
        summary: {
          run: { status: 'error' },
        },
      },
    })
    expect(result.report.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      error: 1,
    })
    expect(result.report.summary.gates?.byName['catalog-grounding']).toMatchObject({
      total: 1,
      blocked: 1,
    })
    expect(result.report.summary.errors.codes).toEqual(
      expect.arrayContaining(['grounding_failed', 'invalid_input']),
    )
  })

  it('propagates phase errors while still emitting a terminal report', async () => {
    const events: HarnessRuntimeEvent[] = []
    const loop = new HarnessRunLoop({
      runId: 'run-error',
      sessionId: 'session-error',
      now: createClock().now,
      onEvent: (event) => events.push(event),
      throwOnError: true,
    })

    let thrown: unknown
    try {
      await loop.run({
        initialState: {},
        phases: {
          route: () => {
            throw new Error('route failed')
          },
        },
      })
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(HarnessRunLoopExecutionError)
    const failure = thrown as HarnessRunLoopExecutionError
    expect(failure.result.status).toBe('error')
    expect(failure.result.report.summary.run.status).toBe('error')
    expect(failure.result.report.summary.errors.codes).toContain('run_error')
    expect(events.some((event) => event.type === 'phase.failed' && event.phase === 'route')).toBe(true)
    expect(events.at(-1)).toMatchObject({
      type: 'run.completed',
      report: {
        summary: {
          run: { status: 'error' },
        },
      },
    })
  })

  it('keeps abort and timeout terminal statuses distinct', async () => {
    const controller = new AbortController()
    controller.abort('user stopped')

    const aborted = await new HarnessRunLoop({
      runId: 'run-aborted',
      sessionId: 'session-aborted',
      signal: controller.signal,
    }).run({
      initialState: {},
      phases: {
        context: () => {
          throw new Error('should not reach aborted handler')
        },
      },
    })

    const timedOut = await new HarnessRunLoop({
      runId: 'run-timeout',
      sessionId: 'session-timeout',
      timeoutMs: 1,
    }).run({
      initialState: {},
      phases: {
        context: () => new Promise<void>(() => undefined),
      },
    })

    expect(aborted.status).toBe('aborted')
    expect(aborted.report.summary.errors.codes).toContain('run_aborted')
    expect(timedOut.status).toBe('timeout')
    expect(timedOut.report.summary.errors.codes).toContain('run_timeout')
  })

  it('passes timeout signals into guarded phase handlers', async () => {
    let sawAbort = false

    const timedOut = await new HarnessRunLoop({
      runId: 'run-phase-timeout-signal',
      sessionId: 'session-phase-timeout-signal',
      timeoutMs: 1,
    }).run({
      initialState: {},
      phases: {
        context: ({ signal }) => new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => {
            sawAbort = true
            resolve()
          }, { once: true })
        }),
      },
    })

    expect(sawAbort).toBe(true)
    expect(timedOut.status).toBe('timeout')
    expect(timedOut.report.summary.errors.codes).toContain('run_timeout')
  })

  it('builds a collector report from runtime events', () => {
    const report = buildHarnessRunReport({
      availableTools: ['registry.search', 'registry.detail'],
      runtimeEvents: [
        { type: 'run.started', runId: 'run-runtime', sessionId: 'session-runtime', startedAt: 100 },
        { type: 'phase.started', runId: 'run-runtime', phase: 'context', at: 100 },
        { type: 'phase.completed', runId: 'run-runtime', phase: 'context', at: 105 },
        { type: 'tool.started', runId: 'run-runtime', toolCallId: 'tool-1', toolId: 'registry.search', at: 105 },
        {
          type: 'tool.failed',
          runId: 'run-runtime',
          toolCallId: 'tool-1',
          toolId: 'registry.search',
          at: 115,
          status: 'timeout',
          errorCode: 'tool_timeout',
        },
        { type: 'model.started', runId: 'run-runtime', at: 115, provider: 'test-provider', model: 'test-model' },
        { type: 'model.completed', runId: 'run-runtime', at: 125 },
        {
          type: 'gate.evaluated',
          runId: 'run-runtime',
          gate: 'catalog-grounding',
          ok: false,
          at: 126,
          errorCode: 'grounding_failed',
        },
        { type: 'operation.event', runId: 'run-runtime', at: 127, event: { type: 'answer.delta' } },
      ],
      snapshot: { runId: 'run-runtime', sessionId: 'session-runtime', startedAt: 100, endedAt: 130 },
    })

    expect(report.summary.run.status).toBe('timeout')
    expect(report.summary.tools.byName['registry.search']).toMatchObject({
      timeout: 1,
      totalDurationMs: 10,
    })
    expect(report.summary.events.byPhase.context).toMatchObject({ ok: 1, totalDurationMs: 5 })
    expect(report.summary.events.byPhase.operation).toMatchObject({ ok: 1 })
    const modelCounters = report.summary.models?.byModel['test-model']
    const gateCounters = report.summary.gates?.byName['catalog-grounding']
    expect(modelCounters).toMatchObject({ ok: 1, totalDurationMs: 10 })
    expect(gateCounters).toMatchObject({ blocked: 1 })
    expect(report.coverage).toMatchObject({
      toolsAvailable: ['registry.detail', 'registry.search'],
      toolsInvoked: ['registry.search'],
      toolsUnused: ['registry.detail'],
      modelsUsed: ['test-model'],
      providersUsed: ['test-provider'],
    })
  })
})

function createReadTool(clock: ReturnType<typeof createClock>): HarnessToolDefinition<
  { q: string },
  { kind: 'ok'; count: number }
> {
  return {
    id: 'registry.search',
    name: 'Registry search',
    summary: 'Search published listings.',
    boundaries: ['Read-only catalog facts.'],
    tier: 'read',
    surfaces: ['agentTools'],
    inputSchema: z.object({ q: z.string() }),
    outputSchema: z.object({ kind: z.literal('ok'), count: z.number() }),
    async run() {
      clock.tick(5)
      return { kind: 'ok', count: 1 }
    },
    summarizeOutput: (output: { kind: 'ok'; count: number }) => ({ kind: output.kind, count: output.count }),
  }
}

function createBatchTool(
  id: string,
  concurrency: 'shared' | 'exclusive',
  label: string,
  waitFor: Promise<void>,
  log: string[],
): HarnessToolDefinition<unknown, unknown> {
  return {
    id,
    name: label,
    summary: 'Batch test tool.',
    boundaries: ['Read-only test fixture.'],
    tier: 'read',
    surfaces: ['agentTools'],
    inputSchema: z.object({}) as z.ZodType<unknown>,
    outputSchema: z.object({ kind: z.literal('ok'), label: z.string() }) as z.ZodType<unknown>,
    approval: 'allow',
    concurrency,
    async run() {
      log.push(`start:${label}`)
      await waitFor
      log.push(`finish:${label}`)
      return { kind: 'ok', label }
    },
  }
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

async function waitForLog(log: readonly string[], expected: readonly string[]): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (JSON.stringify(log) === JSON.stringify(expected)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function createClock(start = 1_000): {
  now: () => number
  tick: (durationMs: number) => void
} {
  let current = start
  return {
    now: () => current,
    tick: (durationMs: number) => {
      current += durationMs
    },
  }
}
