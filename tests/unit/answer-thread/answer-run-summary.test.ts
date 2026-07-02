import { describe, expect, it } from 'vitest'

import {
  buildAnswerRunReport,
  buildHarnessRunReportForAnswer,
  buildPublicAnswerCheckSummary,
} from '@/modules/answer-thread/internal/answer-run-summary'
import type {
  AnswerToolCallRecord,
  AnswerTurnTimingEntry,
  FrozenTurnEvidence,
} from '@/modules/answer-thread/tooling'

describe('answer run summary', () => {
  it('summarizes complete, error, refused, timings, evidence, and coverage', () => {
    const evidence: FrozenTurnEvidence = {
      providers: [
        provider('alpha-plumbing'),
        provider('beta-plumbing'),
      ],
      allowedSlugs: ['alpha-plumbing'],
      agentJsonUrl: '/api/businesses/search?q=plumber',
      toolCalls: [
        toolCall('tc-1', 1, 'registry.search', 'complete', 'hash:search'),
        toolCall('tc-2', 2, 'registry.detail', 'error', 'hash:detail-error'),
        toolCall('tc-3', 3, 'registry.detail', 'refused', 'hash:detail-refused'),
      ],
      timings: [
        timing('tool.run', 12, { toolId: 'registry.search', toolSeq: 1 }),
        timing('tool.run', 7, { toolId: 'registry.detail', toolSeq: 2 }),
        timing('turn.context_parse', 3),
      ],
      workLog: [
        { id: 'interpret.request', phase: 'interpret', status: 'complete', title: 'Reading your request' },
        { id: 'search.registry.initial', phase: 'search', status: 'error', title: 'Searching listed businesses' },
        { id: 'assemble.answer', phase: 'assemble', status: 'skipped', title: 'Preparing the answer' },
      ],
    }

    const report = buildAnswerRunReport({
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'hash:snapshot',
      evidence,
      gate: { ok: false, source: 'answer_gate', code: 'grounding_failed' },
    })

    expect(report.summary.tools).toMatchObject({
      total: 3,
      complete: 1,
      error: 1,
      refused: 1,
      totalDurationMs: 19,
    })
    expect(report.summary.tools.byName['registry.detail']).toMatchObject({
      total: 2,
      error: 1,
      refused: 1,
      totalDurationMs: 7,
    })
    expect(report.summary.evidence).toEqual({
      providerCount: 2,
      allowedSlugCount: 1,
      resultHashes: ['hash:detail-error', 'hash:detail-refused', 'hash:search'],
      snapshotHash: 'hash:snapshot',
    })
    expect(report.summary.workLog).toMatchObject({
      total: 3,
      complete: 1,
      error: 1,
      skipped: 1,
    })
    expect(report.summary.timings).toMatchObject({
      totalEntries: 3,
      totalDurationMs: 22,
    })
    expect(report.summary.gates).toEqual({
      ok: false,
      source: 'answer_gate',
      code: 'grounding_failed',
    })
    expect(report.coverage).toEqual({
      toolsAvailable: ['registry.search', 'registry.detail'],
      toolsInvoked: ['registry.detail', 'registry.search'],
      toolsUnused: [],
      workLogPhases: ['assemble', 'interpret', 'search'],
      hasProviders: true,
      hasAllowedSlugs: true,
      hasSnapshotHash: true,
    })

    expect(buildPublicAnswerCheckSummary(report)).toEqual({
      catalogSearches: 1,
      listingsRead: 2,
      listedBusinesses: 2,
      checksPassed: 2,
      checksFailed: 4,
      elapsedMs: 22,
    })

    const harnessReport = buildHarnessRunReportForAnswer({
      runId: 'turn-1',
      intent: 'refine_search',
      status: 'complete',
      snapshotHash: 'hash:snapshot',
      evidence,
      gate: { ok: false, source: 'answer_gate', code: 'grounding_failed' },
    })
    expect(harnessReport.summary.run).toMatchObject({
      runId: 'turn-1',
      status: 'blocked',
    })
    expect(harnessReport.summary.tools.byName['registry.search']).toMatchObject({
      total: 1,
      ok: 1,
      totalDurationMs: 12,
    })
    expect(harnessReport.summary.tools.byName['registry.detail']).toMatchObject({
      total: 2,
      error: 1,
      refused: 1,
      totalDurationMs: 7,
    })
    expect(harnessReport.coverage.toolsUnused).toEqual([])
    expect(harnessReport.summary.errors.codes).toContain('grounding_failed')
  })

  it('produces a stable empty summary for failed turns with no evidence', () => {
    const report = buildAnswerRunReport({
      intent: 'unsupported',
      status: 'error',
      snapshotHash: '',
      evidence: {
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '',
      },
    })

    expect(report.summary.tools.total).toBe(0)
    expect(report.summary.evidence.providerCount).toBe(0)
    expect(report.summary.gates).toEqual({
      ok: false,
      source: 'turn_status',
    })
    expect(report.coverage.toolsUnused).toEqual(['registry.search', 'registry.detail'])
    expect(buildPublicAnswerCheckSummary(report)).toEqual({
      catalogSearches: 0,
      listingsRead: 0,
      listedBusinesses: 0,
      checksPassed: 0,
      checksFailed: 1,
      elapsedMs: 0,
    })

    const harnessReport = buildHarnessRunReportForAnswer({
      intent: 'unsupported',
      status: 'error',
      snapshotHash: '',
      evidence: {
        providers: [],
        allowedSlugs: [],
        agentJsonUrl: '',
      },
    })
    expect(harnessReport.summary.run.status).toBe('error')
    expect(harnessReport.coverage.toolsUnused).toEqual(['registry.detail', 'registry.search'])
  })
})

function provider(slug: string) {
  return {
    citationIndex: 1,
    slug,
    name: slug,
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
    detailUrl: `/${slug}`,
    services: [],
  }
}

function toolCall(
  toolCallId: string,
  seq: number,
  toolId: AnswerToolCallRecord['toolId'],
  status: AnswerToolCallRecord['status'],
  resultHash: string,
): AnswerToolCallRecord {
  return {
    toolCallId,
    turnId: 'turn-1',
    seq,
    toolId,
    inputJson: '{}',
    resultSummaryJson: '{"slugs":[],"count":0}',
    resultHash,
    status,
    createdAt: 1_000,
  }
}

function timing(
  name: string,
  durationMs: number,
  metadata?: AnswerTurnTimingEntry['metadata'],
): AnswerTurnTimingEntry {
  return {
    name,
    durationMs,
    atMs: 1_000,
    ...(metadata === undefined ? {} : { metadata }),
  }
}
