import type {
  AnswerThreadRecord,
  AnswerTurnRecord,
} from '@/modules/answer-thread/public'
import {
  buildAnswerRunReport,
  buildHarnessRunReportForAnswer,
  buildPublicAnswerCheckSummary,
  type AnswerToolCallRecord,
  type FrozenTurnEvidence,
  type FrozenTurnProse,
} from '@/modules/answer-thread/harness'
import { buildPublicThreadProjection } from '@/modules/answer-thread/projection'
import type { AnswerWorkStep } from '@/modules/answer/answer-synthesizer'
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
  const sortedTurns = [...input.turns].sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq)
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
      publicMessage: 'No answer turn matched that run evidence request.',
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
    detail: buildHarnessRunViewerDetail(turn),
  }
}

function buildHarnessRunViewerListRow(turn: AnswerTurnRecord): HarnessRunViewerListRow {
  const evidence = readFrozenEvidence(turn.evidenceJson)
  const run = resolveRunOverview(turn, evidence)
  const answerRun = evidence.answerRun ?? buildAnswerRunReport({
    intent: turn.intent,
    status: turn.status,
    snapshotHash: turn.snapshotHash,
    evidence,
  })
  const publicChecks = buildPublicAnswerCheckSummary(answerRun)

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
    hasAnswerRun: evidence.answerRun !== undefined,
    providerCount: evidence.providers.length,
    toolCallCount: evidence.toolCalls?.length ?? 0,
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

function buildHarnessRunViewerDetail(turn: AnswerTurnRecord): HarnessRunViewerDetail {
  const evidence = readFrozenEvidence(turn.evidenceJson)
  const prose = readFrozenProse(turn.proseJson)
  const artifactKinds = readStringArrayJson(turn.artifactKindsJson)
  const run = resolveRunOverview(turn, evidence)

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
  turn: AnswerTurnRecord,
  evidence: FrozenTurnEvidence,
): HarnessRunViewerRunOverview {
  const harnessRun = isHarnessRunReport(evidence.harnessRun) ? evidence.harnessRun : undefined
  const report = harnessRun ?? (hasLegacyEvidence(evidence)
    ? buildHarnessRunReportForAnswer({
        runId: `legacy:${turn.turnId}`,
        intent: turn.intent,
        status: turn.status,
        snapshotHash: turn.snapshotHash,
        evidence,
      })
    : undefined)
  const source: HarnessRunViewerRunSource =
    harnessRun !== undefined ? 'harnessRun' : report !== undefined ? 'legacyAnswerRun' : 'missing'
  const runSummary = report?.summary.run

  return {
    source,
    status: runSummary?.status ?? 'missing',
    hasHarnessRun: harnessRun !== undefined,
    hasAnswerRun: evidence.answerRun !== undefined,
    durationMs: runSummary?.durationMs ?? 0,
    ...(runSummary?.runId === undefined ? {} : { runId: runSummary.runId }),
    ...(runSummary?.sessionId === undefined ? {} : { sessionId: runSummary.sessionId }),
    ...(runSummary?.startedAt === undefined ? {} : { startedAt: runSummary.startedAt }),
    ...(runSummary?.endedAt === undefined ? {} : { endedAt: runSummary.endedAt }),
    ...(report === undefined ? {} : { report }),
  }
}

function buildToolRows(
  evidence: FrozenTurnEvidence,
  report: HarnessRunReport | undefined,
): HarnessRunViewerToolRow[] {
  const toolCalls = evidence.toolCalls ?? []
  if (toolCalls.length > 0) {
    return toolCalls
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((call) => {
        const errorCode = readToolErrorCode(call)
        return {
          id: call.toolCallId,
          toolId: call.toolId,
          status: call.status,
          count: 1,
          durationMs: readToolDuration(call, evidence),
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
  evidence: FrozenTurnEvidence,
  artifactKinds: readonly string[],
): HarnessRunViewerEvidenceSummary {
  const resultHashes = (evidence.toolCalls ?? []).map((call) => call.resultHash)
  return {
    providerCount: evidence.providers.length,
    allowedSlugCount: evidence.allowedSlugs.length,
    toolCallCount: evidence.toolCalls?.length ?? 0,
    timingCount: evidence.timings?.length ?? 0,
    workLogCount: evidence.workLog?.length ?? 0,
    resultHashes: stableUnique(resultHashes),
    ...(evidence.agentJsonUrl.trim().length === 0 ? {} : { agentJsonUrl: evidence.agentJsonUrl }),
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
    sharePolicy: 'public',
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
    turnJson: stableStringify({
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
    legacyBackfilled: rows.filter((row) => row.runSource === 'legacyAnswerRun').length,
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

function readFrozenEvidence(value: string): FrozenTurnEvidence {
  const parsed = parseJson<Partial<FrozenTurnEvidence>>(value, {})
  return {
    providers: Array.isArray(parsed.providers) ? parsed.providers : [],
    allowedSlugs: Array.isArray(parsed.allowedSlugs)
      ? parsed.allowedSlugs.filter((slug): slug is string => typeof slug === 'string')
      : [],
    agentJsonUrl: typeof parsed.agentJsonUrl === 'string' ? parsed.agentJsonUrl : '',
    ...(parsed.searchContext === undefined ? {} : { searchContext: parsed.searchContext }),
    ...(Array.isArray(parsed.toolCalls) ? { toolCalls: parsed.toolCalls } : {}),
    ...(Array.isArray(parsed.timings) ? { timings: parsed.timings } : {}),
    ...(Array.isArray(parsed.workLog) ? { workLog: parsed.workLog as readonly AnswerWorkStep[] } : {}),
    ...(parsed.answerRun === undefined ? {} : { answerRun: parsed.answerRun }),
    ...(parsed.harnessRun === undefined ? {} : { harnessRun: parsed.harnessRun }),
  }
}

function readFrozenProse(value: string): FrozenTurnProse {
  const parsed = parseJson<Partial<FrozenTurnProse>>(value, {})
  return {
    oneLine: typeof parsed.oneLine === 'string' ? parsed.oneLine : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    nextStep: typeof parsed.nextStep === 'string' ? parsed.nextStep : '',
    ...(parsed.compactLayout === true ? { compactLayout: true } : {}),
    ...(parsed.layoutProfile === undefined ? {} : { layoutProfile: parsed.layoutProfile }),
  }
}

function readStringArrayJson(value: string): readonly string[] {
  const parsed = parseJson<unknown>(value, [])
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
}

function hasLegacyEvidence(evidence: FrozenTurnEvidence): boolean {
  return evidence.answerRun !== undefined ||
    (evidence.toolCalls?.length ?? 0) > 0 ||
    (evidence.timings?.length ?? 0) > 0 ||
    (evidence.workLog?.length ?? 0) > 0
}

function isHarnessRunReport(value: unknown): value is HarnessRunReport {
  return isRecord(value) && isRecord(value.summary) && isRecord(value.coverage)
}

function readToolDuration(call: AnswerToolCallRecord, evidence: FrozenTurnEvidence): number {
  let total = 0
  for (const timing of evidence.timings ?? []) {
    if (
      timing.metadata?.toolId === call.toolId &&
      (timing.metadata.toolSeq === undefined || timing.metadata.toolSeq === call.seq)
    ) {
      total += timing.durationMs
    }
  }
  return roundDuration(total)
}

function readToolErrorCode(call: AnswerToolCallRecord): string | undefined {
  const summary = parseJson<{ errorCode?: unknown }>(call.resultSummaryJson, {})
  return typeof summary.errorCode === 'string' ? summary.errorCode : undefined
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
    return 'Admin run evidence requires a dedicated source read before raw evidence can be shown.'
  }

  return 'Admin run evidence requires active source-owned membership.'
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

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function formatJsonString(value: string): string {
  try {
    return stableStringify(JSON.parse(value) as unknown)
  } catch {
    return value
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function roundDuration(value: number): number {
  return Math.round(value * 100) / 100
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
