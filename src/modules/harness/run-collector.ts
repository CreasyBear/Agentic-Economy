import {
  HarnessToolStatusValues,
  type HarnessEvent,
  type HarnessEventCounters,
  type HarnessRunReport,
  type HarnessRunStatus,
  type HarnessRunSummary,
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

type SnapshotInput = {
  runId?: string
  status?: HarnessRunStatus
  startedAt?: number
  endedAt?: number
}

export class HarnessRunCollector {
  private readonly availableTools = new Set<string>()
  private readonly toolRecords: ToolRecord[] = []
  private readonly eventRecords: EventRecord[] = []

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

  snapshot(input: SnapshotInput = {}): HarnessRunReport {
    const startedAt = input.startedAt
    const endedAt = input.endedAt
    const status = input.status ?? deriveRunStatus(this.toolRecords, this.eventRecords)
    const tools = summarizeTools(this.toolRecords)
    const events = summarizeEvents(this.eventRecords)
    const errors = summarizeErrors(this.toolRecords, this.eventRecords)
    const toolsAvailable = stableSort([...this.availableTools])
    const toolsInvoked = stableSort(stableUnique(this.toolRecords.map((record) => record.toolId)))
    const invokedSet = new Set(toolsInvoked)
    const phases = stableSort(stableUnique(this.eventRecords.map((event) => event.phase)))
    const statuses = HarnessToolStatusValues.filter((candidate) =>
      this.toolRecords.some((record) => record.status === candidate) ||
      this.eventRecords.some((event) => event.status === candidate),
    )

    const summary: HarnessRunSummary = {
      schemaVersion: 1,
      run: {
        ...(input.runId === undefined ? {} : { runId: input.runId }),
        status,
        ...(startedAt === undefined ? {} : { startedAt }),
        ...(endedAt === undefined ? {} : { endedAt }),
        durationMs: startedAt === undefined || endedAt === undefined
          ? roundDuration(Math.max(tools.totalDurationMs, events.totalDurationMs))
          : roundDuration(endedAt - startedAt),
      },
      tools,
      events,
      errors,
    }

    return {
      summary,
      coverage: {
        toolsAvailable,
        toolsInvoked,
        toolsUnused: toolsAvailable.filter((toolId) => !invokedSet.has(toolId)),
        phases,
        statuses,
      },
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
  snapshot?: SnapshotInput
} = {}): HarnessRunReport {
  const collector = createHarnessRunCollector(input.availableTools ?? [])
  for (const tool of input.tools ?? []) {
    collector.recordTool(tool)
  }
  for (const event of input.events ?? []) {
    collector.recordEvent(event)
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

function summarizeErrors(
  tools: readonly ToolRecord[],
  events: readonly EventRecord[],
): HarnessRunSummary['errors'] {
  const codes = stableSort(stableUnique([
    ...tools.flatMap((record) => record.errorCode === undefined ? [] : [record.errorCode]),
    ...events.flatMap((event) => event.errorCode === undefined ? [] : [event.errorCode]),
  ]))
  const count =
    tools.filter(isProblemRecord).length +
    events.filter(isProblemRecord).length
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
): HarnessRunStatus {
  const statuses = [...tools.map((record) => record.status), ...events.map((event) => event.status)]
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

function isProblemRecord(record: { status: HarnessToolStatus }): boolean {
  return record.status === 'error' ||
    record.status === 'refused' ||
    record.status === 'blocked' ||
    record.status === 'timeout' ||
    record.status === 'aborted'
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function stableSort(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function roundDuration(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100)
}
