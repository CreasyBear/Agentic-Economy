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
    })
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
    expect(report.summary.errors).toEqual({ count: 0, codes: [] })
    expect(report.coverage.toolsUnused).toEqual(['registry.detail', 'registry.search'])
  })
})
