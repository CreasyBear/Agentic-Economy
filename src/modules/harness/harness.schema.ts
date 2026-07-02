import type { JSONSchema } from '@tanstack/ai'
import type { z } from 'zod'

import type { ActionContext, ActionSurface } from '@/modules/common/action'

export const HarnessToolStatusValues = [
  'ok',
  'error',
  'refused',
  'blocked',
  'timeout',
  'aborted',
  'skipped',
] as const

export type HarnessToolStatus = (typeof HarnessToolStatusValues)[number]

export const HarnessRunStatusValues = HarnessToolStatusValues
export type HarnessRunStatus = HarnessToolStatus

export const HarnessRunPhaseValues = [
  'context',
  'intent',
  'route',
  'retrieval',
  'model',
  'gate',
  'assemble',
  'persist',
  'report',
] as const

export type HarnessRunPhase = (typeof HarnessRunPhaseValues)[number]

export const HarnessToolTierValues = ['read', 'write', 'exec'] as const
export type HarnessToolTier = (typeof HarnessToolTierValues)[number]

export const HarnessApprovalPolicyValues = ['allow', 'deny', 'prompt'] as const
export type HarnessApprovalPolicy = (typeof HarnessApprovalPolicyValues)[number]

export type HarnessApprovalDecision = {
  policy: HarnessApprovalPolicy
  reason: string
  tier: HarnessToolTier
}

export type HarnessToolCounters = {
  total: number
  ok: number
  error: number
  refused: number
  blocked: number
  timeout: number
  aborted: number
  skipped: number
  totalDurationMs: number
}

export type HarnessEventCounters = {
  total: number
  ok: number
  error: number
  refused: number
  blocked: number
  timeout: number
  aborted: number
  skipped: number
  totalDurationMs: number
}

export type HarnessUsageTotals = {
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  cacheWriteTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

export type HarnessModelUsage = Partial<HarnessUsageTotals>

export type HarnessCostSummary = {
  estimatedUsd?: number
  unavailableReasons: readonly string[]
}

export type HarnessModelRequestRecord = {
  seq?: number
  provider?: string
  model?: string
  status: HarnessToolStatus
  startedAt?: number
  endedAt?: number
  durationMs: number
  stopReason?: string
  requestId?: string
  responseId?: string
  errorCode?: string
  usage?: HarnessModelUsage
  costUsd?: number
  costUnavailableReason?: string
}

export type HarnessGateRecord = {
  gate: string
  ok: boolean
  durationMs?: number
  errorCode?: string
}

export type HarnessRunSummary = {
  schemaVersion: 1
  run: {
    runId?: string
    sessionId?: string
    status: HarnessRunStatus
    startedAt?: number
    endedAt?: number
    durationMs: number
  }
  tools: {
    total: number
    ok: number
    error: number
    refused: number
    blocked: number
    timeout: number
    aborted: number
    skipped: number
    totalDurationMs: number
    byName: Record<string, HarnessToolCounters>
  }
  events: {
    total: number
    ok: number
    error: number
    refused: number
    blocked: number
    timeout: number
    aborted: number
    skipped: number
    totalDurationMs: number
    byPhase: Record<string, HarnessEventCounters>
  }
  errors: {
    count: number
    codes: readonly string[]
  }
  models?: {
    total: number
    ok: number
    error: number
    refused: number
    blocked: number
    timeout: number
    aborted: number
    skipped: number
    totalDurationMs: number
    byModel: Record<string, HarnessEventCounters>
    byProvider: Record<string, HarnessEventCounters>
    byStopReason: Record<string, number>
  }
  gates?: {
    total: number
    ok: number
    error: number
    refused: number
    blocked: number
    timeout: number
    aborted: number
    skipped: number
    totalDurationMs: number
    byName: Record<string, HarnessEventCounters>
  }
  usage?: HarnessUsageTotals
  cost?: HarnessCostSummary
}

export type HarnessRunCoverage = {
  toolsAvailable: readonly string[]
  toolsInvoked: readonly string[]
  toolsUnused: readonly string[]
  phases: readonly string[]
  statuses: readonly HarnessToolStatus[]
  modelsUsed: readonly string[]
  providersUsed: readonly string[]
}

export type HarnessRunReport = {
  summary: HarnessRunSummary
  coverage: HarnessRunCoverage
  privateTelemetry?: {
    modelRequests: readonly HarnessModelRequestRecord[]
  }
}

export type HarnessRun = {
  runId: string
  sessionId: string
  status: HarnessRunStatus
  startedAt: number
  endedAt?: number
  durationMs?: number
  report?: HarnessRunReport
}

export type HarnessEvent = {
  id: string
  runId?: string
  phase: string
  name: string
  status: HarnessToolStatus
  startedAt: number
  durationMs: number
  errorCode?: string
  metadata?: Record<string, string | number | boolean | null>
}

export type HarnessRuntimeEvent =
  | { type: 'run.started'; runId: string; sessionId: string; startedAt: number }
  | {
    type: 'phase.started' | 'phase.completed' | 'phase.failed'
    runId: string
    phase: string
    at: number
    durationMs?: number
    errorCode?: string
  }
  | {
    type: 'tool.started' | 'tool.completed' | 'tool.failed'
    runId: string
    toolCallId: string
    toolId: string
    at: number
    status?: HarnessToolStatus
    durationMs?: number
    errorCode?: string
  }
  | {
    type: 'model.started' | 'model.completed' | 'model.failed'
    runId: string
    at: number
    provider?: string
    model?: string
    durationMs?: number
    errorCode?: string
  }
  | {
    type: 'gate.evaluated'
    runId: string
    gate: string
    ok: boolean
    at: number
    durationMs?: number
    errorCode?: string
  }
  | { type: 'operation.event'; runId: string; at: number; event: unknown }
  | {
    type: 'persist.started' | 'persist.completed' | 'persist.failed'
    runId: string
    at: number
    durationMs?: number
    errorCode?: string
  }
  | { type: 'run.completed'; runId: string; report: HarnessRunReport }

export type HarnessToolDefinition<Input = unknown, Output = unknown> = {
  id: string
  name: string
  summary: string
  boundaries: readonly string[]
  tier: HarnessToolTier
  surfaces: readonly ActionSurface[]
  inputSchema: z.ZodType<Input>
  outputSchema: z.ZodType<Output>
  inputJsonSchema?: JSONSchema
  outputJsonSchema?: JSONSchema
  approval?: HarnessApprovalPolicy
  run(args: { input: Input; context: ActionContext }): Promise<Output>
  summarizeOutput?: (output: Output) => unknown
}

export type HarnessToolResult<Output = unknown> = {
  toolCallId: string
  toolId: string
  status: HarnessToolStatus
  inputJson: string
  summaryJson: string
  resultHash: string
  durationMs: number
  createdAt: number
  errorCode?: string
  outputJson?: string
  output?: Output
}

export const HarnessSessionEntryKindValues = [
  'session.created',
  'session.resumed',
  'turn.started',
  'intent.routed',
  'context.loaded',
  'tool.started',
  'tool.completed',
  'tool.failed',
  'model.started',
  'model.completed',
  'model.failed',
  'gate.evaluated',
  'turn.persisted',
  'turn.completed',
  'turn.error',
  'run.reported',
  'projection.updated',
  'replay.started',
  'replay.completed',
  'replay.failed',
  'branch.created',
  'compaction.summarized',
] as const

export type HarnessSessionEntryKind = (typeof HarnessSessionEntryKindValues)[number]

export type HarnessSessionEntry = {
  entryId: string
  sessionId: string
  runId: string
  turnId?: string
  seq: number
  kind: HarnessSessionEntryKind
  status?: HarnessRunStatus
  idempotencyKey: string
  requestHash: string
  createdAt: number
  parentEntryId?: string
  payloadJson: string
  publicSummaryJson?: string
  privatePayloadJson?: string
  schemaVersion: number
  toolContractHash?: string
  sourceSnapshotHash?: string
}

export type HarnessSessionProjection = {
  sessionId: string
  entries: readonly HarnessSessionEntry[]
  runIds: readonly string[]
  latestByRunId: Record<string, HarnessSessionEntry>
  entriesById: Record<string, HarnessSessionEntry>
  rootEntryIds: readonly string[]
  childrenByParentEntryId: Record<string, readonly HarnessSessionEntry[]>
  replayPath: readonly HarnessSessionEntry[]
  activeLeafEntryId?: string
  activeLeafEntry?: HarnessSessionEntry
}
