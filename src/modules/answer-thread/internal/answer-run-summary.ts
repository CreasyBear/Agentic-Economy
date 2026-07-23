import {
  AnswerToolIdValues,
  type AnswerRunCoverage,
  type AnswerRunGateSummary,
  type AnswerRunReport,
  type AnswerRunSummary,
  type AnswerRunTimingCounters,
  type AnswerRunToolCounters,
  type AnswerToolCallRecord,
  type AnswerToolCallStatus,
  type AnswerToolId,
  type AnswerTurnStatus,
  type FollowUpIntent,
  type FrozenTurnEvidence,
  type PublicAnswerCheckSummary,
} from '../answer-thread.schema'
import {
  createHarnessRunCollector,
  type HarnessRunReport,
  type HarnessRunStatus,
  type HarnessToolStatus,
} from '@/modules/harness/public'

export function buildAnswerRunReport(input: {
  intent: FollowUpIntent
  status: AnswerTurnStatus
  snapshotHash: string
  evidence: FrozenTurnEvidence
  gate?: AnswerRunGateSummary
}): AnswerRunReport {
  const toolCalls = input.evidence.toolCalls ?? []
  const timings = input.evidence.timings ?? []
  const workLog = input.evidence.workLog ?? []
  const summary: AnswerRunSummary = {
    schemaVersion: 1,
    turn: {
      intent: input.intent,
      status: input.status,
    },
    tools: summarizeTools(toolCalls, timings),
    evidence: {
      providerCount: input.evidence.providers.length + (input.evidence.offeringSources?.length ?? 0),
      allowedSlugCount: input.evidence.allowedSlugs.length,
      resultHashes: stableUnique(toolCalls.map((call) => call.resultHash)),
      snapshotHash: input.snapshotHash,
    },
    workLog: summarizeWorkLog(workLog),
    timings: summarizeTimings(timings),
    gates: input.gate ?? gateFromTurnStatus(input.status),
  }

  return {
    summary,
    coverage: buildCoverage(summary, workLog),
  }
}

export function buildHarnessRunReportForAnswer(input: {
  runId?: string
  intent: FollowUpIntent
  status: AnswerTurnStatus
  snapshotHash: string
  evidence: FrozenTurnEvidence
  gate?: AnswerRunGateSummary
}): HarnessRunReport {
  const toolCalls = input.evidence.toolCalls ?? []
  const timings = input.evidence.timings ?? []
  const workLog = input.evidence.workLog ?? []
  const collector = createHarnessRunCollector(AnswerToolIdValues)

  collector.recordEvent({
    phase: 'intent',
    name: input.intent,
    status: 'ok',
    durationMs: 0,
  })

  for (const call of toolCalls) {
    const status = answerToolStatusToHarnessStatus(call.status)
    collector.recordTool({
      toolId: call.toolId,
      status,
      durationMs: toolDurationMs(call, timings),
      ...(status === 'ok' ? {} : { errorCode: toolErrorCode(call) ?? call.status }),
    })
  }

  for (const step of workLog) {
    const status = workLogStatusToHarnessStatus(step.status)
    collector.recordEvent({
      phase: step.phase,
      name: step.id,
      status,
      durationMs: 0,
      ...(status === 'ok' || status === 'skipped' ? {} : { errorCode: step.status }),
    })
  }

  const gate = input.gate ?? gateFromTurnStatus(input.status)
  collector.recordEvent({
    phase: 'gate',
    name: gate.source,
    status: gate.ok ? 'ok' : 'blocked',
    durationMs: 0,
    ...(gate.ok || gate.code === undefined ? {} : { errorCode: gate.code }),
  })

  for (const timing of timings) {
    if (timing.name === 'tool.run') {
      continue
    }
    collector.recordEvent({
      phase: timingPhase(timing.name),
      name: timing.name,
      status: 'ok',
      durationMs: timing.durationMs,
    })
  }

  return collector.snapshot({
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    status: answerTurnStatusToHarnessRunStatus(input.status, gate),
  })
}

export function buildPublicAnswerCheckSummary(report: AnswerRunReport): PublicAnswerCheckSummary {
  const searchCalls = report.summary.tools.byName['registry.search']?.total ?? 0
  const detailCalls = report.summary.tools.byName['registry.detail']?.total ?? 0
  const passedToolChecks = report.summary.tools.complete
  const failedToolChecks = report.summary.tools.error + report.summary.tools.refused
  const passedGateChecks = report.summary.gates.ok ? 1 : 0
  const failedGateChecks = report.summary.gates.ok ? 0 : 1

  return {
    catalogSearches: searchCalls,
    listingsRead: Math.max(detailCalls, report.summary.evidence.providerCount),
    listedBusinesses: report.summary.evidence.providerCount,
    checksPassed: passedToolChecks + report.summary.workLog.complete + passedGateChecks,
    checksFailed: failedToolChecks + report.summary.workLog.error + failedGateChecks,
    elapsedMs: Math.max(0, Math.round(report.summary.timings.totalDurationMs)),
  }
}

function summarizeTools(
  toolCalls: readonly AnswerToolCallRecord[],
  timings: NonNullable<FrozenTurnEvidence['timings']>,
): AnswerRunSummary['tools'] {
  const totals = emptyToolCounters()
  const byName: Partial<Record<AnswerToolId, AnswerRunToolCounters>> = {}

  for (const call of toolCalls) {
    const durationMs = toolDurationMs(call, timings)
    addToolCounters(totals, call.status, durationMs)
    const existing = byName[call.toolId] ?? emptyToolCounters()
    addToolCounters(existing, call.status, durationMs)
    byName[call.toolId] = existing
  }

  return {
    ...totals,
    byName: sortToolCounterRecord(byName),
  }
}

function summarizeWorkLog(workLog: NonNullable<FrozenTurnEvidence['workLog']>): AnswerRunSummary['workLog'] {
  const counters: AnswerRunSummary['workLog'] = {
    total: workLog.length,
    complete: 0,
    running: 0,
    skipped: 0,
    error: 0,
    stopped: 0,
  }

  for (const step of workLog) {
    switch (step.status) {
      case 'complete':
        counters.complete += 1
        break
      case 'running':
        counters.running += 1
        break
      case 'skipped':
        counters.skipped += 1
        break
      case 'error':
        counters.error += 1
        break
      case 'stopped':
        counters.stopped += 1
        break
    }
  }

  return counters
}

function summarizeTimings(timings: NonNullable<FrozenTurnEvidence['timings']>): AnswerRunSummary['timings'] {
  const byName: Record<string, AnswerRunTimingCounters> = {}
  let totalDurationMs = 0

  for (const timing of timings) {
    totalDurationMs += timing.durationMs
    const existing = byName[timing.name] ?? { count: 0, totalDurationMs: 0 }
    byName[timing.name] = {
      count: existing.count + 1,
      totalDurationMs: roundDuration(existing.totalDurationMs + timing.durationMs),
    }
  }

  return {
    totalEntries: timings.length,
    totalDurationMs: roundDuration(totalDurationMs),
    byName: sortTimingRecord(byName),
  }
}

function buildCoverage(
  summary: AnswerRunSummary,
  workLog: NonNullable<FrozenTurnEvidence['workLog']>,
): AnswerRunCoverage {
  const toolsAvailable = [...AnswerToolIdValues]
  const toolsInvoked = stableUnique(Object.keys(summary.tools.byName)).filter(isAnswerToolId)
  const invoked = new Set(toolsInvoked)
  return {
    toolsAvailable,
    toolsInvoked,
    toolsUnused: toolsAvailable.filter((toolId) => !invoked.has(toolId)),
    workLogPhases: stableUnique(workLog.map((step) => step.phase)),
    hasProviders: summary.evidence.providerCount > 0,
    hasAllowedSlugs: summary.evidence.allowedSlugCount > 0,
    hasSnapshotHash: summary.evidence.snapshotHash.length > 0,
  }
}

function emptyToolCounters(): AnswerRunToolCounters {
  return {
    total: 0,
    complete: 0,
    error: 0,
    refused: 0,
    totalDurationMs: 0,
  }
}

function addToolCounters(
  counters: AnswerRunToolCounters,
  status: AnswerToolCallStatus,
  durationMs: number,
): void {
  counters.total += 1
  counters[status] += 1
  counters.totalDurationMs = roundDuration(counters.totalDurationMs + durationMs)
}

function toolDurationMs(
  call: AnswerToolCallRecord,
  timings: NonNullable<FrozenTurnEvidence['timings']>,
): number {
  let total = 0
  for (const timing of timings) {
    if (
      timing.metadata?.toolId === call.toolId &&
      (timing.metadata.toolSeq === undefined || timing.metadata.toolSeq === call.seq)
    ) {
      total += timing.durationMs
    }
  }
  return roundDuration(total)
}

function answerToolStatusToHarnessStatus(status: AnswerToolCallStatus): HarnessToolStatus {
  switch (status) {
    case 'complete':
      return 'ok'
    case 'error':
      return 'error'
    case 'refused':
      return 'refused'
  }
}

function workLogStatusToHarnessStatus(status: NonNullable<FrozenTurnEvidence['workLog']>[number]['status']): HarnessToolStatus {
  switch (status) {
    case 'complete':
      return 'ok'
    case 'running':
      return 'skipped'
    case 'skipped':
      return 'skipped'
    case 'error':
      return 'error'
    case 'stopped':
      return 'aborted'
    default:
      return 'skipped'
  }
}

function answerTurnStatusToHarnessRunStatus(
  status: AnswerTurnStatus,
  gate: AnswerRunGateSummary,
): HarnessRunStatus {
  if (status === 'error') {
    return 'error'
  }
  return gate.ok ? 'ok' : 'blocked'
}

function toolErrorCode(call: AnswerToolCallRecord): string | undefined {
  const summary = parseToolSummary(call.resultSummaryJson)
  return summary.errorCode
}

function parseToolSummary(value: string): { errorCode?: string } {
  try {
    const parsed = JSON.parse(value) as { errorCode?: unknown }
    return typeof parsed.errorCode === 'string' ? { errorCode: parsed.errorCode } : {}
  } catch {
    return {}
  }
}

function timingPhase(name: string): string {
  return name.includes('.') ? name.slice(0, name.indexOf('.')) : name
}

function sortToolCounterRecord(
  value: Partial<Record<AnswerToolId, AnswerRunToolCounters>>,
): Partial<Record<AnswerToolId, AnswerRunToolCounters>> {
  const sorted: Partial<Record<AnswerToolId, AnswerRunToolCounters>> = {}
  for (const key of AnswerToolIdValues) {
    const counters = value[key]
    if (counters !== undefined) {
      sorted[key] = counters
    }
  }
  return sorted
}

function sortTimingRecord(value: Record<string, AnswerRunTimingCounters>): Record<string, AnswerRunTimingCounters> {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
}

function stableUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function roundDuration(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100)
}

function isAnswerToolId(value: string): value is AnswerToolId {
  return (AnswerToolIdValues as readonly string[]).includes(value)
}

function gateFromTurnStatus(status: AnswerTurnStatus): AnswerRunGateSummary {
  return {
    ok: status === 'complete',
    source: 'turn_status',
  }
}
