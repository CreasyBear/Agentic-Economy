import type { AnswerTurnRecord } from '@/modules/answer-thread/answer-thread.schema'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'
import {
  buildPublicAnswerCheckSummary,
  type AnswerToolCallRecord,
  type FrozenTurnEvidence,
  type FrozenTurnProse,
} from '@/modules/answer-thread/harness'
import { buildPublicThreadProjection } from '@/modules/answer-thread/projection'
import { AeSearchContextSchema } from '@/modules/answer/search-context'
import {
  AnswerLayoutProfileValues,
  type AnswerLayoutProfile,
} from '@/modules/answer/public'
import { isRecord } from '@/modules/common/is-record'
import { parseBoundedJson } from '@/modules/common/bounded-json'
import { round2 } from '@/modules/common/round-2'
import { sumToolDurationMs } from '@/modules/common/tool-duration'
import { uniq } from 'es-toolkit/array'
import type {
  HarnessEventCounters,
  HarnessRunReport,
  HarnessRunStatus,
  HarnessToolCounters,
  HarnessToolStatus,
} from '@/modules/harness/public'
import type {
  HarnessRunViewerAccess,
  HarnessRunViewerDetail,
  HarnessRunViewerDetailAccessInput,
  HarnessRunViewerDetailAllowed,
  HarnessRunViewerDetailInput,
  HarnessRunViewerDetailNotFound,
  HarnessRunViewerDetailResult,
  HarnessRunViewerDeniedInput,
  HarnessRunViewerEvidenceFilter,
  HarnessRunViewerEvidenceSummary,
  HarnessRunViewerFilters,
  HarnessRunViewerListAccessInput,
  HarnessRunViewerListAllowed,
  HarnessRunViewerListInput,
  HarnessRunViewerListResult,
  HarnessRunViewerListRow,
  HarnessRunViewerPhaseRow,
  HarnessRunViewerPublicProjectionDiff,
  HarnessRunViewerRawJson,
  HarnessRunViewerRunOverview,
  HarnessRunViewerRunSource,
  HarnessRunViewerStatusFilter,
  HarnessRunViewerToolRow,
} from '../run-viewer.schema'

const forbiddenPublicProjectionMarkers = [
  'harnessRun',
  'answerRun',
  'toolCalls',
  'toolCallId',
  'inputJson',
  'outputJson',
  'resultHash',
  'privateTelemetry',
  'modelRequests',
  'requestId',
  'responseId',
  'registry.search',
  'registry.detail',
  'inquiry.submit',
  'provider request ids',
  'internal trace names',
] as const

const emptyPublicAnswerCheckSummary = {
  catalogSearches: 0,
  listingsRead: 0,
  listedBusinesses: 0,
  checksPassed: 0,
  checksFailed: 0,
  elapsedMs: 0,
} as const

export function buildHarnessRunViewerListResult(
  input: HarnessRunViewerListAccessInput,
): HarnessRunViewerListResult {
  if (input.access.kind === 'denied') {
    return buildHarnessRunViewerDeniedResult({
      reason: input.access.reason,
      publicMessage: input.access.publicMessage,
      generatedAt: input.generatedAt,
      filters: input.filters,
    })
  }

  return buildHarnessRunViewerListProjection({
    turns: input.turns,
    actorRef: input.access.actorRef,
    generatedAt: input.generatedAt,
    filters: input.filters,
    source: input.source,
  })
}

export function buildHarnessRunViewerDetailResult(
  input: HarnessRunViewerDetailAccessInput,
): HarnessRunViewerDetailResult {
  if (input.access.kind === 'denied') {
    return buildHarnessRunViewerDeniedResult({
      reason: input.access.reason,
      publicMessage: input.access.publicMessage,
      generatedAt: input.generatedAt,
      filters: input.filters,
    })
  }

  return buildHarnessRunViewerDetailProjection({
    turnId: input.turnId,
    turns: input.turns,
    actorRef: input.access.actorRef,
    generatedAt: input.generatedAt,
    filters: input.filters,
    source: input.source,
  })
}

function buildHarnessRunViewerDeniedResult(
  input: HarnessRunViewerDeniedInput,
): Extract<HarnessRunViewerListResult, { kind: 'denied' }> {
  return {
    kind: 'denied',
    httpStatus: input.reason === 'missing_membership' ? 401 : 403,
    reason: input.reason,
    generatedAt: input.generatedAt ?? Date.now(),
    publicMessage: input.publicMessage ?? defaultDeniedMessage(input.reason),
    filters: normalizeHarnessRunViewerFilters(input.filters),
    rows: [],
  }
}

function buildHarnessRunViewerListProjection(
  input: HarnessRunViewerListInput,
): HarnessRunViewerListAllowed {
  const filters = normalizeHarnessRunViewerFilters(input.filters)
  const sortedTurns = input.turns.toSorted((a, b) => b.createdAt - a.createdAt || b.seq - a.seq)
  const rows: HarnessRunViewerListRow[] = []
  for (const turn of sortedTurns) {
    const row = buildHarnessRunViewerListRow(turn)
    if (rowMatchesFilters(row, filters)) {
      rows.push(row)
    }
  }

  return {
    kind: 'allowed',
    httpStatus: 200,
    generatedAt: input.generatedAt ?? Date.now(),
    actorRef: input.actorRef,
    filters,
    ...(input.source === undefined ? {} : { source: input.source }),
    summary: summarizeRows(rows),
    rows,
  }
}

export function buildHarnessRunViewerDetailProjection(
  input: HarnessRunViewerDetailInput,
): HarnessRunViewerDetailAllowed | HarnessRunViewerDetailNotFound {
  const filters = normalizeHarnessRunViewerFilters(input.filters)
  const turn = input.turns.find((candidate) => candidate.turnId === input.turnId)
  if (turn === undefined) {
    return {
      kind: 'not_found',
      httpStatus: 404,
      generatedAt: input.generatedAt ?? Date.now(),
      filters,
      turnId: input.turnId,
      ...(input.source === undefined ? {} : { source: input.source }),
      publicMessage: 'No answer turn matched that run request.',
      rows: [],
    }
  }

  const evidence = readFrozenEvidence(turn.evidenceJson)
  if (evidence === undefined) {
    return {
      kind: 'not_found',
      httpStatus: 404,
      generatedAt: input.generatedAt ?? Date.now(),
      filters,
      turnId: input.turnId,
      ...(input.source === undefined ? {} : { source: input.source }),
      publicMessage: 'That answer turn has no current run report available.',
      rows: [],
    }
  }

  const rows = input.turns.map((candidate) => buildHarnessRunViewerListRow(candidate))
  return {
    kind: 'allowed',
    httpStatus: 200,
    generatedAt: input.generatedAt ?? Date.now(),
    actorRef: input.actorRef,
    filters,
    ...(input.source === undefined ? {} : { source: input.source }),
    rows,
    detail: buildHarnessRunViewerDetail(turn, evidence),
  }
}

function buildHarnessRunViewerListRow(turn: AnswerTurnRecord): HarnessRunViewerListRow {
  const evidence = readFrozenEvidence(turn.evidenceJson)
  const run = resolveRunOverview(evidence)
  const publicChecks = evidence === undefined
    ? emptyPublicAnswerCheckSummary
    : buildPublicAnswerCheckSummary(evidence.answerRun)

  return {
    rowId: `run:${turn.turnId}`,
    turnId: turn.turnId,
    threadId: turn.threadId,
    seq: turn.seq,
    queryPreview: previewText(turn.query),
    turnStatus: turn.status,
    runStatus: run.status,
    runSource: run.source,
    hasRunEvidence: run.source !== 'missing',
    hasAnswerRun: evidence !== undefined,
    providerCount: evidence?.providers.length ?? 0,
    toolCallCount: evidence?.toolCalls.length ?? 0,
    catalogSearches: publicChecks.catalogSearches,
    listingsRead: publicChecks.listingsRead,
    checksPassed: publicChecks.checksPassed,
    checksFailed: publicChecks.checksFailed,
    elapsedMs: publicChecks.elapsedMs,
    createdAt: turn.createdAt,
    ...(run.runId === undefined ? {} : { runId: run.runId }),
    ...(run.sessionId === undefined ? {} : { sessionId: run.sessionId }),
  }
}

function buildHarnessRunViewerDetail(turn: AnswerTurnRecord, evidence: FrozenTurnEvidence): HarnessRunViewerDetail {
  const prose = readFrozenProse(turn.proseJson)
  const artifactKinds = readStringArrayJson(turn.artifactKindsJson)
  const run = resolveRunOverview(evidence)

  return {
    turn: {
      turnId: turn.turnId,
      threadId: turn.threadId,
      seq: turn.seq,
      query: turn.query,
      intent: turn.intent,
      status: turn.status,
      snapshotHash: turn.snapshotHash,
      createdAt: turn.createdAt,
      ...(turn.errorCopyId === undefined ? {} : { errorCopyId: turn.errorCopyId }),
    },
    run,
    tools: buildToolRows(evidence, run.report),
    phases: buildPhaseRows(run.report),
    evidence: buildEvidenceSummary(evidence, artifactKinds),
    publicProjection: buildPublicProjectionDiff(turn, evidence, prose),
    rawJson: buildRawJson(turn),
  }
}

export function normalizeHarnessRunViewerFilters(
  filters: HarnessRunViewerFilters | undefined,
): HarnessRunViewerFilters {
  const status = normalizeStatusFilter(filters?.status)
  const hasRunEvidence = normalizeEvidenceFilter(filters?.hasRunEvidence)
  const turnId = normalizeFilterText(filters?.turnId)
  const threadId = normalizeFilterText(filters?.threadId)
  const date = normalizeFilterText(filters?.date)

  return {
    ...(status === undefined ? {} : { status }),
    ...(turnId === undefined ? {} : { turnId }),
    ...(threadId === undefined ? {} : { threadId }),
    ...(date === undefined ? {} : { date }),
    ...(hasRunEvidence === undefined ? {} : { hasRunEvidence }),
  }
}

function resolveRunOverview(
  evidence: FrozenTurnEvidence | undefined,
): HarnessRunViewerRunOverview {
  const harnessRun = evidence !== undefined && isHarnessRunReport(evidence.harnessRun)
    ? evidence.harnessRun
    : undefined
  const runSummary = harnessRun?.summary.run
  return {
    source: harnessRun === undefined ? 'missing' : 'harnessRun',
    status: runSummary?.status ?? 'missing',
    hasHarnessRun: harnessRun !== undefined,
    hasAnswerRun: evidence !== undefined,
    durationMs: runSummary?.durationMs ?? 0,
    ...(runSummary?.runId === undefined ? {} : { runId: runSummary.runId }),
    ...(runSummary?.sessionId === undefined ? {} : { sessionId: runSummary.sessionId }),
    ...(runSummary?.startedAt === undefined ? {} : { startedAt: runSummary.startedAt }),
    ...(runSummary?.endedAt === undefined ? {} : { endedAt: runSummary.endedAt }),
    ...(harnessRun === undefined ? {} : { report: harnessRun }),
  }
}

function buildToolRows(
  evidence: FrozenTurnEvidence | undefined,
  report: HarnessRunReport | undefined,
): HarnessRunViewerToolRow[] {
  const toolCalls = evidence?.toolCalls ?? []
  if (toolCalls.length > 0 && evidence !== undefined) {
    return toolCalls
      .toSorted((a, b) => a.seq - b.seq)
      .map((call) => {
        const errorCode = readToolErrorCode(call)
        return {
          id: call.toolCallId,
          toolId: call.toolId,
          status: call.status,
          count: 1,
          durationMs: round2(sumToolDurationMs(call, evidence.timings)),
          seq: call.seq,
          resultHash: call.resultHash,
          ...(errorCode === undefined ? {} : { errorCode }),
        }
      })
  }

  return Object.entries(report?.summary.tools.byName ?? {}).map(([toolId, counters]) => ({
    id: `summary:${toolId}`,
    toolId,
    status: dominantToolStatus(counters),
    count: counters.total,
    durationMs: counters.totalDurationMs,
  }))
}

function buildPhaseRows(report: HarnessRunReport | undefined): HarnessRunViewerPhaseRow[] {
  return Object.entries(report?.summary.events.byPhase ?? {}).map(([phase, counters]) => ({
    id: `phase:${phase}`,
    phase,
    status: dominantEventStatus(counters),
    count: counters.total,
    durationMs: counters.totalDurationMs,
  }))
}

function buildEvidenceSummary(
  evidence: FrozenTurnEvidence | undefined,
  artifactKinds: readonly string[],
): HarnessRunViewerEvidenceSummary {
  const resultHashes = (evidence?.toolCalls ?? []).map((call) => call.resultHash)
  return {
    providerCount: evidence?.providers.length ?? 0,
    allowedSlugCount: evidence?.allowedSlugs.length ?? 0,
    toolCallCount: evidence?.toolCalls.length ?? 0,
    timingCount: evidence?.timings.length ?? 0,
    workLogCount: evidence?.workLog.length ?? 0,
    resultHashes: uniq(resultHashes).sort((a, b) => a.localeCompare(b)),
    ...(evidence === undefined || evidence.agentJsonUrl.trim().length === 0 ? {} : { agentJsonUrl: evidence.agentJsonUrl }),
    artifactKinds,
  }
}

function buildPublicProjectionDiff(
  turn: AnswerTurnRecord,
  evidence: FrozenTurnEvidence,
  prose: FrozenTurnProse,
): HarnessRunViewerPublicProjectionDiff {
  const thread: AnswerThreadRecord = {
    threadId: turn.threadId,
    pseudonymousSessionId: 'admin-run-viewer-redacted',
    title: `Run ${turn.turnId}`,
    createdAt: turn.createdAt,
    updatedAt: turn.createdAt,
  }
  const publicProjection = buildPublicThreadProjection(thread, [
    {
      ...turn,
      evidenceJson: JSON.stringify(evidence),
      proseJson: JSON.stringify(prose),
    },
  ])
  const publicTurn = publicProjection.turns[0]
  if (publicTurn === undefined) {
    throw new Error('run_viewer_public_projection_empty')
  }
  const serializedPublicProjection = JSON.stringify(publicProjection)
  const privateSerialized = JSON.stringify({
    evidenceJson: turn.evidenceJson,
    proseJson: turn.proseJson,
    artifactKindsJson: turn.artifactKindsJson,
    snapshotHash: turn.snapshotHash,
    errorCopyId: turn.errorCopyId,
  })
  const leakedMarkers = forbiddenPublicProjectionMarkers.filter((marker) =>
    serializedPublicProjection.includes(marker)
  )
  const excludedPrivateMarkers = forbiddenPublicProjectionMarkers.filter((marker) =>
    privateSerialized.includes(marker) && !serializedPublicProjection.includes(marker)
  )

  return {
    publicTurn,
    serializedPublicProjection,
    forbiddenMarkers: [...forbiddenPublicProjectionMarkers],
    leakedMarkers,
    excludedPrivateMarkers,
  }
}

function buildRawJson(turn: AnswerTurnRecord): HarnessRunViewerRawJson {
  return {
    turnJson: JSON.stringify({
      turnId: turn.turnId,
      threadId: turn.threadId,
      seq: turn.seq,
      query: turn.query,
      intent: turn.intent,
      status: turn.status,
      snapshotHash: turn.snapshotHash,
      errorCopyId: turn.errorCopyId,
      createdAt: turn.createdAt,
    }),
    evidenceJson: formatJsonString(turn.evidenceJson),
    proseJson: formatJsonString(turn.proseJson),
    artifactKindsJson: formatJsonString(turn.artifactKindsJson),
  }
}

function rowMatchesFilters(row: HarnessRunViewerListRow, filters: HarnessRunViewerFilters): boolean {
  if (filters.status !== undefined && filters.status !== 'any') {
    if (filters.status === 'missing') {
      if (row.runStatus !== 'missing') {
        return false
      }
    } else if (row.turnStatus !== filters.status && row.runStatus !== filters.status) {
      return false
    }
  }

  if (filters.turnId !== undefined && !includesFolded(row.turnId, filters.turnId)) {
    return false
  }

  if (filters.threadId !== undefined && !includesFolded(row.threadId, filters.threadId)) {
    return false
  }

  if (filters.date !== undefined && !new Date(row.createdAt).toISOString().startsWith(filters.date)) {
    return false
  }

  if (filters.hasRunEvidence === 'yes' && !row.hasRunEvidence) {
    return false
  }

  if (filters.hasRunEvidence === 'no' && row.hasRunEvidence) {
    return false
  }

  return true
}

function summarizeRows(rows: readonly HarnessRunViewerListRow[]) {
  return {
    turns: rows.length,
    withHarnessRun: rows.filter((row) => row.runSource === 'harnessRun').length,
    missingRunEvidence: rows.filter((row) => row.runSource === 'missing').length,
    attention: rows.filter((row) =>
      row.runStatus === 'error' ||
      row.runStatus === 'blocked' ||
      row.runStatus === 'timeout' ||
      row.runStatus === 'aborted' ||
      row.turnStatus === 'error'
    ).length,
  }
}

function readFrozenEvidence(value: string): FrozenTurnEvidence | undefined {
  const parsed = parseBoundedJson(value)
  if (!isRecord(parsed) ||
    !Array.isArray(parsed.providers) ||
    !Array.isArray(parsed.allowedSlugs) ||
    !parsed.allowedSlugs.every((slug): slug is string => typeof slug === 'string') ||
    typeof parsed.agentJsonUrl !== 'string' ||
    !Array.isArray(parsed.toolCalls) ||
    !Array.isArray(parsed.timings) ||
    !Array.isArray(parsed.workLog) ||
    !isRecord(parsed.answerRun) ||
    !isRecord(parsed.answerRun.summary) ||
    !isRecord(parsed.answerRun.summary.tools) ||
    !isRecord(parsed.answerRun.summary.evidence) ||
    !isRecord(parsed.answerRun.summary.workLog) ||
    !isRecord(parsed.answerRun.summary.timings) ||
    !isRecord(parsed.answerRun.summary.gates) ||
    !isRecord(parsed.answerRun.coverage)
  ) {
    return undefined
  }
  const searchContext = AeSearchContextSchema.safeParse(parsed.searchContext)
  return {
    providers: parsed.providers as FrozenTurnEvidence['providers'],
    allowedSlugs: parsed.allowedSlugs,
    agentJsonUrl: parsed.agentJsonUrl,
    toolCalls: parsed.toolCalls as FrozenTurnEvidence['toolCalls'],
    timings: parsed.timings as FrozenTurnEvidence['timings'],
    workLog: parsed.workLog as FrozenTurnEvidence['workLog'],
    answerRun: parsed.answerRun as FrozenTurnEvidence['answerRun'],
    ...(searchContext.success ? { searchContext: searchContext.data } : {}),
    ...(parsed.harnessRun === undefined ? {} : { harnessRun: parsed.harnessRun as HarnessRunReport }),
  }
}

function readFrozenProse(value: string): FrozenTurnProse {
  const parsed = parseBoundedJson(value)
  const record: Record<string, unknown> = isRecord(parsed) ? parsed : {}
  const layoutProfile = readLayoutProfile(record.layoutProfile)
  return {
    oneLine: typeof record.oneLine === 'string' ? record.oneLine : '',
    summary: typeof record.summary === 'string' ? record.summary : '',
    nextStep: typeof record.nextStep === 'string' ? record.nextStep : '',
    ...(record.compactLayout === true ? { compactLayout: true } : {}),
    ...(layoutProfile === undefined ? {} : { layoutProfile }),
  }
}


function readLayoutProfile(value: unknown): AnswerLayoutProfile | undefined {
  for (const profile of AnswerLayoutProfileValues) {
    if (profile === value) {
      return profile
    }
  }
  return undefined
}

function readStringArrayJson(value: string): readonly string[] {
  const parsed = parseBoundedJson(value)
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
}


function isHarnessRunReport(value: unknown): value is HarnessRunReport {
  return isRecord(value) && isRecord(value.summary) && isRecord(value.coverage)
}


function readToolErrorCode(call: AnswerToolCallRecord): string | undefined {
  const summary = parseBoundedJson(call.resultSummaryJson)
  return isRecord(summary) && typeof summary.errorCode === 'string' ? summary.errorCode : undefined
}

function dominantToolStatus(counters: HarnessToolCounters): HarnessToolStatus {
  if (counters.aborted > 0) {
    return 'aborted'
  }
  if (counters.timeout > 0) {
    return 'timeout'
  }
  if (counters.error > 0) {
    return 'error'
  }
  if (counters.blocked > 0) {
    return 'blocked'
  }
  if (counters.refused > 0) {
    return 'refused'
  }
  if (counters.skipped > 0) {
    return 'skipped'
  }
  return 'ok'
}

function dominantEventStatus(counters: HarnessEventCounters): HarnessToolStatus {
  if (counters.aborted > 0) {
    return 'aborted'
  }
  if (counters.timeout > 0) {
    return 'timeout'
  }
  if (counters.error > 0) {
    return 'error'
  }
  if (counters.blocked > 0) {
    return 'blocked'
  }
  if (counters.refused > 0) {
    return 'refused'
  }
  if (counters.skipped > 0) {
    return 'skipped'
  }
  return 'ok'
}

function normalizeStatusFilter(value: HarnessRunViewerStatusFilter | undefined): HarnessRunViewerStatusFilter | undefined {
  if (value === undefined || value === 'any') {
    return undefined
  }
  return value
}

function normalizeEvidenceFilter(
  value: HarnessRunViewerEvidenceFilter | undefined,
): HarnessRunViewerEvidenceFilter | undefined {
  if (value === undefined || value === 'any') {
    return undefined
  }
  return value
}

function normalizeFilterText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

function defaultDeniedMessage(reason: string): string {
  if (reason === 'source_read_not_configured') {
    return 'Admin runs require a dedicated source read before raw evidence can be shown.'
  }

  return 'Admin runs require active source-owned membership.'
}

function previewText(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= 120) {
    return normalized
  }
  return `${normalized.slice(0, 117)}...`
}

function includesFolded(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.toLowerCase())
}


function formatJsonString(value: string): string {
  const parsed = parseBoundedJson(value)
  return parsed === undefined ? value : JSON.stringify(parsed, null, 2) ?? value
}



