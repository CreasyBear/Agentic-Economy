import { describe, expect, it } from 'vitest'

import {
  buildHarnessRunReport,
  createHarnessRunCollector,
} from '@/modules/harness/public'

describe('harness run collector', () => {
  it('builds stable sorted coverage and per-tool counters', () => {
    const collector = createHarnessRunCollector(['registry.detail', 'registry.search', 'inquiry.submit'])

    collector.recordTool({ toolId: 'registry.search', status: 'ok', durationMs: 12.345 })
    collector.recordTool({ toolId: 'registry.detail', status: 'error', durationMs: 7, errorCode: 'invalid_output' })
    collector.recordTool({ toolId: 'registry.detail', status: 'blocked', durationMs: 2, errorCode: 'write_not_allowed' })
    collector.recordEvent({ phase: 'retrieve', status: 'ok', durationMs: 4 })
    collector.recordEvent({ phase: 'gate', status: 'error', durationMs: 3, errorCode: 'grounding_failed' })

    const report = collector.snapshot({ runId: 'run-1', startedAt: 100, endedAt: 135 })

    expect(report.summary.run).toEqual({
      runId: 'run-1',
      status: 'error',
      startedAt: 100,
      endedAt: 135,
      durationMs: 35,
    })
    expect(report.summary.tools).toMatchObject({
      total: 3,
      ok: 1,
      error: 1,
      blocked: 1,
      totalDurationMs: 21.35,
    })
    expect(Object.keys(report.summary.tools.byName)).toEqual(['registry.detail', 'registry.search'])
    expect(report.summary.tools.byName['registry.detail']).toMatchObject({
      total: 2,
      error: 1,
      blocked: 1,
      totalDurationMs: 9,
    })
    expect(Object.keys(report.summary.events.byPhase)).toEqual(['gate', 'retrieve'])
    expect(report.summary.errors).toEqual({
      count: 3,
      codes: ['grounding_failed', 'invalid_output', 'write_not_allowed'],
    })
    expect(report.coverage).toEqual({
      toolsAvailable: ['inquiry.submit', 'registry.detail', 'registry.search'],
      toolsInvoked: ['registry.detail', 'registry.search'],
      toolsUnused: ['inquiry.submit'],
      phases: ['gate', 'retrieve'],
      statuses: ['ok', 'error', 'blocked'],
      modelsUsed: [],
      providersUsed: [],
    })
    expect(report.summary.gates).toMatchObject({
      total: 1,
      error: 1,
      byName: {
        gate: {
          total: 1,
          error: 1,
          totalDurationMs: 3,
        },
      },
    })
  })

  it('records model requests with sorted model/provider coverage, usage totals, and unavailable cost reasons', () => {
    const collector = createHarnessRunCollector()

    collector.recordModelRequest({
      seq: 2,
      provider: 'openrouter',
      model: 'zeta-model',
      status: 'ok',
      startedAt: 200,
      durationMs: 10.555,
      stopReason: 'tool_calls',
      requestId: 'req-b',
      responseId: 'res-b',
      usage: {
        inputTokens: 10.4,
        outputTokens: 5.2,
        cachedInputTokens: 2,
        cacheWriteTokens: 1,
        reasoningOutputTokens: 3,
        totalTokens: 22,
      },
      costUsd: 0.0000123456,
    })
    collector.recordModelRequest({
      seq: 1,
      provider: 'anthropic',
      model: 'alpha-model',
      status: 'error',
      durationMs: 4,
      stopReason: 'error',
      requestId: 'req-a',
      errorCode: 'request_failed',
      usage: {
        inputTokens: 2,
        outputTokens: 1,
      },
      costUnavailableReason: 'price_table_missing',
    })
    collector.recordModelRequest({
      provider: 'openrouter',
      model: 'alpha-model',
      status: 'ok',
      durationMs: 1,
      usage: {
        totalTokens: 40,
      },
      costUnavailableReason: 'price_table_missing',
    })

    const report = collector.snapshot()

    expect(report.summary.run.status).toBe('error')
    expect(report.summary.models).toMatchObject({
      total: 3,
      ok: 2,
      error: 1,
      totalDurationMs: 15.56,
      byStopReason: {
        error: 1,
        tool_calls: 1,
      },
    })
    expect(Object.keys(report.summary.models?.byModel ?? {})).toEqual(['alpha-model', 'zeta-model'])
    expect(report.summary.models?.byModel['alpha-model']).toMatchObject({
      total: 2,
      ok: 1,
      error: 1,
    })
    expect(Object.keys(report.summary.models?.byProvider ?? {})).toEqual(['anthropic', 'openrouter'])
    expect(report.summary.usage).toEqual({
      inputTokens: 12,
      outputTokens: 6,
      cachedInputTokens: 2,
      cacheWriteTokens: 1,
      reasoningOutputTokens: 3,
      totalTokens: 65,
    })
    expect(report.summary.cost).toEqual({
      estimatedUsd: 0.00001235,
      unavailableReasons: ['price_table_missing'],
    })
    expect(report.coverage.modelsUsed).toEqual(['alpha-model', 'zeta-model'])
    expect(report.coverage.providersUsed).toEqual(['anthropic', 'openrouter'])
    expect(report.coverage.statuses).toEqual(['ok', 'error'])
    expect(report.privateTelemetry?.modelRequests.map((record) => record.requestId)).toEqual([
      'req-a',
      'req-b',
      undefined,
    ])
    expect(report.privateTelemetry?.modelRequests.map((record) => record.responseId)).toEqual([
      undefined,
      'res-b',
      undefined,
    ])
  })

  it('tracks gate counters separately from phase events', () => {
    const collector = createHarnessRunCollector()

    collector.recordGate({ gate: 'catalog_grounding', ok: false, durationMs: 3.456, errorCode: 'ungrounded' })
    collector.recordGate({ gate: 'answer_gate', ok: true, durationMs: 1 })

    const report = collector.snapshot()

    expect(report.summary.run.status).toBe('blocked')
    expect(report.summary.gates).toMatchObject({
      total: 2,
      ok: 1,
      blocked: 1,
      totalDurationMs: 4.46,
    })
    expect(Object.keys(report.summary.gates?.byName ?? {})).toEqual(['answer_gate', 'catalog_grounding'])
    expect(report.summary.gates?.byName.catalog_grounding).toMatchObject({
      total: 1,
      blocked: 1,
      totalDurationMs: 3.46,
    })
    expect(report.summary.errors).toEqual({
      count: 1,
      codes: ['ungrounded'],
    })
    expect(report.coverage.statuses).toEqual(['ok', 'blocked'])
  })

  it('applies status precedence across tools, models, and gates', () => {
    expect(buildHarnessRunReport({
      gates: [{ gate: 'answer_gate', ok: false }],
    }).summary.run.status).toBe('blocked')

    expect(buildHarnessRunReport({
      tools: [{ toolId: 'registry.search', status: 'refused', durationMs: 1 }],
      gates: [{ gate: 'answer_gate', ok: true }],
    }).summary.run.status).toBe('refused')

    expect(buildHarnessRunReport({
      models: [{ provider: 'openrouter', model: 'model-a', status: 'error', durationMs: 1 }],
      gates: [{ gate: 'answer_gate', ok: false }],
    }).summary.run.status).toBe('error')

    expect(buildHarnessRunReport({
      tools: [{ toolId: 'registry.search', status: 'timeout', durationMs: 50 }],
      models: [{ provider: 'openrouter', model: 'model-a', status: 'error', durationMs: 1 }],
    }).summary.run.status).toBe('timeout')

    expect(buildHarnessRunReport({
      tools: [{ toolId: 'registry.search', status: 'timeout', durationMs: 50 }],
      models: [{ provider: 'openrouter', model: 'model-a', status: 'aborted', durationMs: 1 }],
    }).summary.run.status).toBe('aborted')
  })

  it('accounts for timeout and aborted statuses before generic errors', () => {
    const report = buildHarnessRunReport({
      availableTools: ['registry.search'],
      tools: [
        { toolId: 'registry.search', status: 'error', durationMs: 1, errorCode: 'invalid_input' },
        { toolId: 'registry.search', status: 'timeout', durationMs: 50, errorCode: 'tool_timeout' },
      ],
    })

    expect(report.summary.run.status).toBe('timeout')
    expect(report.summary.tools.timeout).toBe(1)
    expect(report.summary.tools.error).toBe(1)
    expect(report.summary.errors.codes).toEqual(['invalid_input', 'tool_timeout'])

    const aborted = buildHarnessRunReport({
      tools: [{ toolId: 'registry.search', status: 'aborted', durationMs: 1 }],
    })
    expect(aborted.summary.run.status).toBe('aborted')
  })

  it('produces an empty OMP-style summary', () => {
    const report = buildHarnessRunReport({
      availableTools: ['registry.search', 'registry.detail'],
      snapshot: { runId: 'empty-run' },
    })

    expect(report.summary.run).toEqual({
      runId: 'empty-run',
      status: 'ok',
      durationMs: 0,
    })
    expect(report.summary.tools.total).toBe(0)
    expect(report.summary.events.total).toBe(0)
    expect(report.summary.models).toMatchObject({
      total: 0,
      byModel: {},
      byProvider: {},
      byStopReason: {},
    })
    expect(report.summary.gates).toMatchObject({
      total: 0,
      byName: {},
    })
    expect(report.summary.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    })
    expect(report.summary.cost).toEqual({ unavailableReasons: [] })
    expect(report.summary.errors).toEqual({ count: 0, codes: [] })
    expect(report.coverage.toolsUnused).toEqual(['registry.detail', 'registry.search'])
    expect(report.coverage.modelsUsed).toEqual([])
    expect(report.coverage.providersUsed).toEqual([])
    expect(report.privateTelemetry).toBeUndefined()
  })

  it('keeps old tool and event snapshot inputs compatible with the richer report', () => {
    const report = buildHarnessRunReport({
      tools: [
        { toolId: 'registry.search', status: 'ok', durationMs: 1 },
      ],
      events: [
        { phase: 'gate', name: 'answer_gate', status: 'blocked', durationMs: 2, errorCode: 'grounding_failed' },
      ],
    })

    expect(report.summary.run.status).toBe('blocked')
    expect(report.summary.tools.ok).toBe(1)
    expect(report.summary.events.blocked).toBe(1)
    expect(report.summary.gates?.byName.answer_gate).toMatchObject({
      total: 1,
      blocked: 1,
      totalDurationMs: 2,
    })
    expect(report.summary.usage?.totalTokens).toBe(0)
    expect(report.summary.cost?.unavailableReasons).toEqual([])
    expect(report.coverage).toMatchObject({
      toolsAvailable: [],
      toolsInvoked: ['registry.search'],
      toolsUnused: [],
      phases: ['gate'],
      statuses: ['ok', 'blocked'],
      modelsUsed: [],
      providersUsed: [],
    })
  })
})
