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

export type HarnessRunSummary = {
  schemaVersion: 1
  run: {
    runId?: string
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
}

export type HarnessRunCoverage = {
  toolsAvailable: readonly string[]
  toolsInvoked: readonly string[]
  toolsUnused: readonly string[]
  phases: readonly string[]
  statuses: readonly HarnessToolStatus[]
}

export type HarnessRunReport = {
  summary: HarnessRunSummary
  coverage: HarnessRunCoverage
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

export type HarnessSessionEntryKind =
  | 'turn.started'
  | 'tool.completed'
  | 'turn.completed'
  | 'turn.error'
  | 'run.reported'

export type HarnessSessionEntry = {
  entryId: string
  sessionId: string
  runId: string
  seq: number
  kind: HarnessSessionEntryKind
  createdAt: number
  parentEntryId?: string
  payload: Record<string, unknown>
}

export type HarnessSessionProjection = {
  sessionId: string
  entries: readonly HarnessSessionEntry[]
  runIds: readonly string[]
  latestByRunId: Record<string, HarnessSessionEntry>
}
