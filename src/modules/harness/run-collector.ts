import {
  HarnessToolStatusValues,
  type HarnessEvent,
  type HarnessEventCounters,
  type HarnessGateRecord,
  type HarnessModelRequestRecord,
  type HarnessModelUsage,
  type HarnessRuntimeEvent,
  type HarnessRunReport,
  type HarnessRunStatus,
  type HarnessRunSummary,
  type HarnessUsageTotals,
  type HarnessToolCounters,
  type HarnessToolStatus,
} from './harness.schema'

type ToolRecord = {
  toolId: string
  status: HarnessToolStatus
  durationMs: number
  errorCode?: string
}

type EventRecord = {
  phase: string
  status: HarnessToolStatus
  durationMs?: number
  name?: string
  errorCode?: string
}

type NormalizedGateRecord = {
  gate: string
  status: HarnessToolStatus
  durationMs: number
  errorCode?: string
}

type SnapshotInput = {
  runId?: string
  sessionId?: string
  status?: HarnessRunStatus
  startedAt?: number
  endedAt?: number
}

export class HarnessRunCollector {
  private readonly availableTools = new Set<string>()
  private readonly toolRecords: ToolRecord[] = []
  private readonly eventRecords: EventRecord[] = []
  private readonly modelRecords: HarnessModelRequestRecord[] = []
  private readonly gateRecords: NormalizedGateRecord[] = []
  private readonly phaseStarts = new Map<string, number>()
  private readonly toolStarts = new Map<string, { toolId: string; at: number }>()
  private readonly modelStarts: {
    at: number
    seq?: number
    provider?: string
    model?: string
    requestId?: string
    costUnavailableReason?: string
  }[] = []
  private persistStartedAt: number | undefined

  noteAvailableTools(tools: readonly (string | { id: string })[]): void {
    for (const tool of tools) {
      this.availableTools.add(typeof tool === 'string' ? tool : tool.id)
    }
  }

  recordTool(record: ToolRecord): void {
    this.toolRecords.push({
      ...record,
      durationMs: roundDuration(record.durationMs),
    })
  }

  recordToolResult(result: { toolId: string; status: HarnessToolStatus; durationMs: number; errorCode?: string }): void {
    this.recordTool(result)
  }

  recordEvent(event: EventRecord): void {
    this.eventRecords.push({
      ...event,
      durationMs: roundDuration(event.durationMs ?? 0),
    })
  }

  recordHarnessEvent(event: HarnessEvent): void {
    this.recordEvent({
      phase: event.phase,
      name: event.name,
      status: event.status,
      durationMs: event.durationMs,
      ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
    })
  }

  recordModelRequest(record: HarnessModelRequestRecord): void {
    this.modelRecords.push(normalizeModelRecord(record))
  }

  recordModelResult(record: HarnessModelRequestRecord): void {
    this.recordModelRequest(record)
  }

  recordGate(record: HarnessGateRecord): void {
    this.gateRecords.push(normalizeGateRecord(record))
  }

  recordRuntimeEvent(event: HarnessRuntimeEvent): void {
    switch (event.type) {
      case 'run.started':
      case 'run.completed':
        return
      case 'phase.started':
        this.phaseStarts.set(event.phase, event.at)
        return
      case 'phase.completed':
      case 'phase.failed': {
        const startedAt = this.phaseStarts.get(event.phase)
        this.phaseStarts.delete(event.phase)
        this.recordEvent({
          phase: event.phase,
          name: event.type,
          status: event.type === 'phase.completed' ? 'ok' : statusFromRuntimeFailure(event.errorCode),
          durationMs: runtimeDuration(event, startedAt),
          ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
        })
        return
      }
      case 'tool.started':
        this.toolStarts.set(event.toolCallId, { toolId: event.toolId, at: event.at })
        return
      case 'tool.completed':
      case 'tool.failed': {
        const started = this.toolStarts.get(event.toolCallId)
        this.toolStarts.delete(event.toolCallId)
        this.recordTool({
          toolId: event.toolId,
          status: event.status ?? (event.type === 'tool.completed' ? 'ok' : statusFromRuntimeFailure(event.errorCode)),
          durationMs: runtimeDuration(event, started?.at),
          ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
        })
        return
      }
      case 'model.started':
        this.modelStarts.push({
          at: event.at,
          ...(event.seq === undefined ? {} : { seq: event.seq }),
          ...(event.provider === undefined ? {} : { provider: event.provider }),
          ...(event.model === undefined ? {} : { model: event.model }),
          ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
          ...(event.costUnavailableReason === undefined ? {} : { costUnavailableReason: event.costUnavailableReason }),
        })
        return
      case 'model.completed':
      case 'model.failed': {
        const started = this.modelStarts.pop()
        const seq = event.seq ?? started?.seq
        const provider = event.provider ?? started?.provider
        const model = event.model ?? started?.model
        const requestId = event.requestId ?? started?.requestId
        const costUnavailableReason = event.costUnavailableReason ?? started?.costUnavailableReason
        const startedAt = started?.at
        const durationMs = runtimeDuration(event, startedAt)
        const endedAt = startedAt === undefined ? undefined : startedAt + durationMs
        this.recordModelRequest({
          ...(seq === undefined ? {} : { seq }),
          status: event.type === 'model.completed' ? 'ok' : statusFromRuntimeFailure(event.errorCode),
          durationMs,
          ...(startedAt === undefined ? {} : { startedAt }),
          ...(endedAt === undefined ? {} : { endedAt }),
          ...(provider === undefined ? {} : { provider }),
          ...(model === undefined ? {} : { model }),
          ...(event.stopReason === undefined ? {} : { stopReason: event.stopReason }),
          ...(requestId === undefined ? {} : { requestId }),
          ...(event.responseId === undefined ? {} : { responseId: event.responseId }),
          ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
          ...(event.usage === undefined ? {} : { usage: event.usage }),
          ...(event.costUsd === undefined ? {} : { costUsd: event.costUsd }),
          ...(costUnavailableReason === undefined ? {} : { costUnavailableReason }),
        })
        return
      }
      case 'gate.evaluated':
        this.recordGate({
          gate: event.gate,
          ok: event.ok,
          ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
          ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
        })
        return
      case 'operation.event':
        this.recordEvent({
          phase: 'operation',
          name: event.type,
          status: 'ok',
          durationMs: 0,
        })
        return
      case 'persist.started':
        this.persistStartedAt = event.at
        return
      case 'persist.completed':
      case 'persist.failed': {
        const startedAt = this.persistStartedAt
        this.persistStartedAt = undefined
        this.recordEvent({
          phase: 'persist',
          name: event.type,
          status: event.type === 'persist.completed' ? 'ok' : statusFromRuntimeFailure(event.errorCode),
          durationMs: runtimeDuration(event, startedAt),
          ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
        })
      }
    }
  }

  snapshot(input: SnapshotInput = {}): HarnessRunReport {
    const startedAt = input.startedAt
    const endedAt = input.endedAt
    const gateRecords = this.gateRecords.length > 0
      ? this.gateRecords
      : gatesFromEvents(this.eventRecords)
    const status = input.status ?? deriveRunStatus(
      this.toolRecords,
      this.eventRecords,
      this.modelRecords,
      gateRecords,
    )
    const tools = summarizeTools(this.toolRecords)
    const events = summarizeEvents(this.eventRecords)
    const models = summarizeModels(this.modelRecords)
    const gates = summarizeGates(gateRecords)
    const usage = summarizeUsage(this.modelRecords)
    const cost = summarizeCost(this.modelRecords)
    const errors = summarizeErrors(
      this.toolRecords,
      this.eventRecords,
      this.modelRecords,
      this.gateRecords,
    )
    const toolsAvailable = stableSort([...this.availableTools])
    const toolsInvoked = stableSort(stableUnique(this.toolRecords.map((record) => record.toolId)))
    const invokedSet = new Set(toolsInvoked)
    const phases = stableSort(stableUnique(this.eventRecords.map((event) => event.phase)))
    const modelsUsed = stableSort(stableUnique(this.modelRecords.flatMap((record) => record.model === undefined ? [] : [record.model])))
    const providersUsed = stableSort(stableUnique(this.modelRecords.flatMap((record) => record.provider === undefined ? [] : [record.provider])))
    const recordedStatuses = [
      ...this.toolRecords.map((record) => record.status),
      ...this.eventRecords.map((event) => event.status),
      ...this.modelRecords.map((record) => record.status),
      ...gateRecords.map((record) => record.status),
    ]
    const statuses = HarnessToolStatusValues.filter((candidate) => recordedStatuses.includes(candidate))

    const summary: HarnessRunSummary = {
      schemaVersion: 1,
      run: {
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        status,
        ...(startedAt === undefined ? {} : { startedAt }),
        ...(endedAt === undefined ? {} : { endedAt }),
        durationMs: startedAt === undefined || endedAt === undefined
          ? roundDuration(Math.max(
              tools.totalDurationMs,
              events.totalDurationMs,
              models.totalDurationMs,
              gates.totalDurationMs,
            ))
          : roundDuration(endedAt - startedAt),
      },
      tools,
      events,
      errors,
      models,
      gates,
      usage,
      cost,
    }

    return {
      summary,
      coverage: {
        toolsAvailable,
        toolsInvoked,
        toolsUnused: toolsAvailable.filter((toolId) => !invokedSet.has(toolId)),
        phases,
        statuses,
        modelsUsed,
        providersUsed,
      },
      ...(this.modelRecords.length === 0
        ? {}
        : { privateTelemetry: { modelRequests: sortedModelRecords(this.modelRecords) } }),
    }
  }
}

export function createHarnessRunCollector(
  availableTools: readonly (string | { id: string })[] = [],
): HarnessRunCollector {
  const collector = new HarnessRunCollector()
  collector.noteAvailableTools(availableTools)
  return collector
}

export function buildHarnessRunReport(input: {
  availableTools?: readonly (string | { id: string })[]
  tools?: readonly ToolRecord[]
  events?: readonly EventRecord[]
  models?: readonly HarnessModelRequestRecord[]
  gates?: readonly HarnessGateRecord[]
  runtimeEvents?: readonly HarnessRuntimeEvent[]
  snapshot?: SnapshotInput
} = {}): HarnessRunReport {
  const collector = createHarnessRunCollector(input.availableTools ?? [])
  for (const tool of input.tools ?? []) {
    collector.recordTool(tool)
  }
  for (const event of input.events ?? []) {
    collector.recordEvent(event)
  }
  for (const model of input.models ?? []) {
    collector.recordModelRequest(model)
  }
  for (const gate of input.gates ?? []) {
    collector.recordGate(gate)
  }
  for (const event of input.runtimeEvents ?? []) {
    collector.recordRuntimeEvent(event)
  }
  return collector.snapshot(input.snapshot ?? {})
}

function summarizeTools(records: readonly ToolRecord[]): HarnessRunSummary['tools'] {
  const totals = emptyCounters()
  const byName = new Map<string, HarnessToolCounters>()

  for (const record of records) {
    addCounter(totals, record.status, record.durationMs)
    const existing = byName.get(record.toolId) ?? emptyCounters()
    addCounter(existing, record.status, record.durationMs)
    byName.set(record.toolId, existing)
  }

  return {
    ...totals,
    byName: Object.fromEntries([...byName.entries()].sort(([a], [b]) => a.localeCompare(b))),
  }
}

function summarizeEvents(records: readonly EventRecord[]): HarnessRunSummary['events'] {
  const totals = emptyCounters()
  const byPhase = new Map<string, HarnessEventCounters>()

  for (const record of records) {
    addCounter(totals, record.status, record.durationMs ?? 0)
    const existing = byPhase.get(record.phase) ?? emptyCounters()
    addCounter(existing, record.status, record.durationMs ?? 0)
    byPhase.set(record.phase, existing)
  }

  return {
    ...totals,
    byPhase: Object.fromEntries([...byPhase.entries()].sort(([a], [b]) => a.localeCompare(b))),
  }
}

function summarizeModels(records: readonly HarnessModelRequestRecord[]): NonNullable<HarnessRunSummary['models']> {
  const totals = emptyCounters()
  const byModel = new Map<string, HarnessEventCounters>()
  const byProvider = new Map<string, HarnessEventCounters>()
  const byStopReason: Record<string, number> = {}

  for (const record of records) {
    addCounter(totals, record.status, record.durationMs)
    if (record.model !== undefined) {
      const existing = byModel.get(record.model) ?? emptyCounters()
      addCounter(existing, record.status, record.durationMs)
      byModel.set(record.model, existing)
    }
    if (record.provider !== undefined) {
      const existing = byProvider.get(record.provider) ?? emptyCounters()
      addCounter(existing, record.status, record.durationMs)
      byProvider.set(record.provider, existing)
    }
    if (record.stopReason !== undefined) {
      byStopReason[record.stopReason] = (byStopReason[record.stopReason] ?? 0) + 1
    }
  }

  return {
    ...totals,
    byModel: sortCounterMap(byModel),
    byProvider: sortCounterMap(byProvider),
    byStopReason: sortNumberRecord(byStopReason),
  }
}

function summarizeGates(records: readonly NormalizedGateRecord[]): NonNullable<HarnessRunSummary['gates']> {
  const totals = emptyCounters()
  const byName = new Map<string, HarnessEventCounters>()

  for (const record of records) {
    addCounter(totals, record.status, record.durationMs)
    const existing = byName.get(record.gate) ?? emptyCounters()
    addCounter(existing, record.status, record.durationMs)
    byName.set(record.gate, existing)
  }

  return {
    ...totals,
    byName: sortCounterMap(byName),
  }
}

function summarizeUsage(records: readonly HarnessModelRequestRecord[]): HarnessUsageTotals {
  const totals: HarnessUsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    reasoningOutputTokens: 0,
    totalTokens: 0,
  }

  for (const record of records) {
    const usage = record.usage
    if (usage === undefined) {
      continue
    }
    const inputTokens = usage.inputTokens ?? 0
    const outputTokens = usage.outputTokens ?? 0
    totals.inputTokens += inputTokens
    totals.outputTokens += outputTokens
    totals.cachedInputTokens += usage.cachedInputTokens ?? 0
    totals.cacheWriteTokens += usage.cacheWriteTokens ?? 0
    totals.reasoningOutputTokens += usage.reasoningOutputTokens ?? 0
    totals.totalTokens += usage.totalTokens ?? inputTokens + outputTokens
  }

  return totals
}

function summarizeCost(records: readonly HarnessModelRequestRecord[]): NonNullable<HarnessRunSummary['cost']> {
  let estimatedUsd: number | undefined
  const unavailableReasons = new Set<string>()

  for (const record of records) {
    if (record.costUsd !== undefined) {
      estimatedUsd = roundCost((estimatedUsd ?? 0) + record.costUsd)
    }
    if (record.costUnavailableReason !== undefined) {
      unavailableReasons.add(record.costUnavailableReason)
    }
  }

  return {
    ...(estimatedUsd === undefined ? {} : { estimatedUsd }),
    unavailableReasons: stableSort([...unavailableReasons]),
  }
}

function summarizeErrors(
  tools: readonly ToolRecord[],
  events: readonly EventRecord[],
  models: readonly HarnessModelRequestRecord[],
  gates: readonly NormalizedGateRecord[],
): HarnessRunSummary['errors'] {
  const codes = stableSort(stableUnique([
    ...tools.flatMap((record) => record.errorCode === undefined ? [] : [record.errorCode]),
    ...events.flatMap((event) => event.errorCode === undefined ? [] : [event.errorCode]),
    ...models.flatMap((record) => record.errorCode === undefined ? [] : [record.errorCode]),
    ...gates.flatMap((record) => record.errorCode === undefined ? [] : [record.errorCode]),
  ]))
  const count =
    tools.filter(isProblemRecord).length +
    events.filter(isProblemRecord).length +
    models.filter(isProblemRecord).length +
    gates.filter(isProblemRecord).length
  return { count, codes }
}

function emptyCounters(): HarnessToolCounters {
  return {
    total: 0,
    ok: 0,
    error: 0,
    refused: 0,
    blocked: 0,
    timeout: 0,
    aborted: 0,
    skipped: 0,
    totalDurationMs: 0,
  }
}

function addCounter(
  counters: HarnessToolCounters,
  status: HarnessToolStatus,
  durationMs: number,
): void {
  counters.total += 1
  counters[status] += 1
  counters.totalDurationMs = roundDuration(counters.totalDurationMs + durationMs)
}

function deriveRunStatus(
  tools: readonly ToolRecord[],
  events: readonly EventRecord[],
  models: readonly HarnessModelRequestRecord[],
  gates: readonly NormalizedGateRecord[],
): HarnessRunStatus {
  const statuses = [
    ...tools.map((record) => record.status),
    ...events.map((event) => event.status),
    ...models.map((record) => record.status),
    ...gates.map((record) => record.status),
  ]
  if (statuses.includes('aborted')) {
    return 'aborted'
  }
  if (statuses.includes('timeout')) {
    return 'timeout'
  }
  if (statuses.includes('error')) {
    return 'error'
  }
  if (statuses.includes('blocked')) {
    return 'blocked'
  }
  if (statuses.includes('refused')) {
    return 'refused'
  }
  if (statuses.length > 0 && statuses.every((status) => status === 'skipped')) {
    return 'skipped'
  }
  return 'ok'
}

function statusFromRuntimeFailure(errorCode: string | undefined): HarnessToolStatus {
  const normalized = errorCode?.toLowerCase()
  if (normalized?.includes('abort') === true) {
    return 'aborted'
  }
  if (normalized?.includes('timeout') === true || normalized?.includes('deadline') === true) {
    return 'timeout'
  }
  if (normalized?.includes('blocked') === true) {
    return 'blocked'
  }
  if (normalized?.includes('refused') === true || normalized?.includes('denied') === true) {
    return 'refused'
  }
  return 'error'
}

function runtimeDuration(
  event: { at: number; durationMs?: number },
  startedAt: number | undefined,
): number {
  if (event.durationMs !== undefined) {
    return event.durationMs
  }
  if (startedAt === undefined) {
    return 0
  }
  return event.at - startedAt
}

function isProblemRecord(record: { status: HarnessToolStatus }): boolean {
  return record.status === 'error' ||
    record.status === 'refused' ||
    record.status === 'blocked' ||
    record.status === 'timeout' ||
    record.status === 'aborted'
}

function normalizeModelRecord(record: HarnessModelRequestRecord): HarnessModelRequestRecord {
  const usage = normalizeUsage(record.usage)
  const normalized: HarnessModelRequestRecord = {
    status: record.status,
    durationMs: roundDuration(record.durationMs),
  }
  const seq = normalizeWholeNumber(record.seq)
  const provider = normalizeString(record.provider)
  const model = normalizeString(record.model)
  const stopReason = normalizeString(record.stopReason)
  const requestId = normalizeString(record.requestId)
  const responseId = normalizeString(record.responseId)
  const errorCode = normalizeString(record.errorCode)
  const costUnavailableReason = normalizeString(record.costUnavailableReason)

  if (seq !== undefined) {
    normalized.seq = seq
  }
  if (provider !== undefined) {
    normalized.provider = provider
  }
  if (model !== undefined) {
    normalized.model = model
  }
  if (record.startedAt !== undefined) {
    normalized.startedAt = record.startedAt
  }
  if (record.endedAt !== undefined) {
    normalized.endedAt = record.endedAt
  }
  if (stopReason !== undefined) {
    normalized.stopReason = stopReason
  }
  if (requestId !== undefined) {
    normalized.requestId = requestId
  }
  if (responseId !== undefined) {
    normalized.responseId = responseId
  }
  if (errorCode !== undefined) {
    normalized.errorCode = errorCode
  }
  if (usage !== undefined) {
    normalized.usage = usage
  }
  if (record.costUsd !== undefined) {
    normalized.costUsd = roundCost(record.costUsd)
  }
  if (costUnavailableReason !== undefined) {
    normalized.costUnavailableReason = costUnavailableReason
  }

  return normalized
}

function normalizeUsage(usage: HarnessModelUsage | undefined): HarnessModelUsage | undefined {
  if (usage === undefined) {
    return undefined
  }
  const normalized: HarnessModelUsage = {
    ...(usage.inputTokens === undefined ? {} : { inputTokens: normalizeTokenCount(usage.inputTokens) }),
    ...(usage.outputTokens === undefined ? {} : { outputTokens: normalizeTokenCount(usage.outputTokens) }),
    ...(usage.cachedInputTokens === undefined ? {} : { cachedInputTokens: normalizeTokenCount(usage.cachedInputTokens) }),
    ...(usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: normalizeTokenCount(usage.cacheWriteTokens) }),
    ...(usage.reasoningOutputTokens === undefined ? {} : { reasoningOutputTokens: normalizeTokenCount(usage.reasoningOutputTokens) }),
    ...(usage.totalTokens === undefined ? {} : { totalTokens: normalizeTokenCount(usage.totalTokens) }),
  }
  return Object.keys(normalized).length === 0 ? undefined : normalized
}

function normalizeGateRecord(record: HarnessGateRecord): NormalizedGateRecord {
  const normalized: NormalizedGateRecord = {
    gate: normalizeString(record.gate) ?? 'gate',
    status: record.ok ? 'ok' : 'blocked',
    durationMs: roundDuration(record.durationMs ?? 0),
  }
  const errorCode = normalizeString(record.errorCode)
  if (errorCode !== undefined) {
    normalized.errorCode = errorCode
  }
  return normalized
}

function gatesFromEvents(records: readonly EventRecord[]): NormalizedGateRecord[] {
  const gates: NormalizedGateRecord[] = []
  for (const record of records) {
    if (record.phase !== 'gate') {
      continue
    }
    const normalized: NormalizedGateRecord = {
      gate: normalizeString(record.name) ?? record.phase,
      status: record.status,
      durationMs: roundDuration(record.durationMs ?? 0),
    }
    const errorCode = normalizeString(record.errorCode)
    if (errorCode !== undefined) {
      normalized.errorCode = errorCode
    }
    gates.push(normalized)
  }
  return gates
}

function sortedModelRecords(records: readonly HarnessModelRequestRecord[]): HarnessModelRequestRecord[] {
  return [...records].sort((a, b) =>
    compareOptionalNumber(a.seq, b.seq) ||
    compareOptionalNumber(a.startedAt, b.startedAt) ||
    compareOptionalString(a.provider, b.provider) ||
    compareOptionalString(a.model, b.model) ||
    compareOptionalString(a.requestId, b.requestId) ||
    compareOptionalString(a.responseId, b.responseId),
  )
}

function sortCounterMap<T extends HarnessEventCounters>(map: ReadonlyMap<string, T>): Record<string, T> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function sortNumberRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)))
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function stableSort(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function roundDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0
}

function roundCost(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 100_000_000) / 100_000_000) : 0
}

function normalizeTokenCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function normalizeWholeNumber(value: number | undefined): number | undefined {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(0, Math.round(value))
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}

function compareOptionalNumber(a: number | undefined, b: number | undefined): number {
  if (a === b) {
    return 0
  }
  if (a === undefined) {
    return 1
  }
  if (b === undefined) {
    return -1
  }
  return a - b
}

function compareOptionalString(a: string | undefined, b: string | undefined): number {
  if (a === b) {
    return 0
  }
  if (a === undefined) {
    return 1
  }
  if (b === undefined) {
    return -1
  }
  return a.localeCompare(b)
}
