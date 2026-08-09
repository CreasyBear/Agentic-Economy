import { isJSONValue } from '@ai-sdk/provider'
import type {
  AssistantModelMessage,
  TextPart,
  ToolApprovalRequest,
  ToolApprovalResponse,
  ToolCallPart,
  ToolModelMessage,
  ToolResultPart,
} from 'ai'
import { z } from 'zod'
type ResponseMessage = AssistantModelMessage | ToolModelMessage

import { parseAnswerTurnProblemStrict, type AnswerTurnProblem } from '@/lib/errors'

import {
  AnswerLayoutProfileValues,
  AnswerWorkStepSchema,
  type AnswerLayoutProfile,
} from '@/modules/answer/answer-event-schema'
import { AnswerArtifactSchema, type AnswerArtifact } from '@/modules/answer/answer-schema'
import type {
  AnswerSource,
  AnswerWorkStep,
} from '@/modules/answer/answer-synthesizer'
import type { HarnessModelRequestRecord, HarnessRunReport } from '@/modules/harness/public'
import { isRecord } from '@/modules/common/is-record'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import {
  AeSearchContextSchema,
  NeedTimingValues,
  type AeSearchContext,
} from '@/modules/answer/search-context'

export const FollowUpIntentValues = [
  'refine_search',
  'filter_known',
  'compare_known',
  'inquiry_handoff',
  'explain_boundary',
  'unsupported',
] as const

export type FollowUpIntent = (typeof FollowUpIntentValues)[number]

export const AnswerTurnStatusValues = ['pending', 'complete', 'stopped', 'error'] as const
export type AnswerTurnStatus = (typeof AnswerTurnStatusValues)[number]

export const AnswerTurnReservationStateValues = [
  'reserved',
  'checkpointed',
  'answer_persisted',
  'finalized',
  'stopped',
] as const
export type AnswerTurnReservationState = (typeof AnswerTurnReservationStateValues)[number]


export const AnswerToolCallStatusValues = ['complete', 'error', 'refused'] as const
export type AnswerToolCallStatus = (typeof AnswerToolCallStatusValues)[number]
export const AnswerToolIdValues = [
  'registry.search',
  'registry.detail',
  'sandbox.checkup_quote',
  'web.discover',
  'registry.operations.search',
  // Execute a DB-described (keyless) capability selected via registry navigation.
  'operation.execute',
] as const
export type AnswerToolId = (typeof AnswerToolIdValues)[number]

// Read-only model tools. `operation.execute` stays out: dynamic capability tools
// bind one strict operation schema instead of exposing a free-form record tool.
export const ANSWER_READ_TOOL_IDS = [
  'registry.search',
  'registry.detail',
  'sandbox.checkup_quote',
  'web.discover',
  'registry.operations.search',
] as const satisfies readonly AnswerToolId[]

const ThinkingStepValues = ['search', 'read', 'write'] as const
export type ThinkingStep = (typeof ThinkingStepValues)[number]

export type AnswerThreadRecord = {
  threadId: string
  pseudonymousSessionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export type AnswerTurnRecord = {
  turnId: string
  threadId: string
  seq: number
  query: string
  intent: FollowUpIntent
  evidenceJson: string
  snapshotHash: string
  proseJson: string
  artifactKindsJson: string
  status: AnswerTurnStatus
  errorCopyId?: string
  errorProblemJson?: string
  createdAt: number
}

export type AnswerTurnReservationRecord = {
  reservationKey: string
  sessionId: string
  requestedThreadScope: string
  requestDigest: string
  threadId: string
  turnId: string
  seq: number
  query: string
  searchContextJson?: string
  state: AnswerTurnReservationState
  finalStatus?: Extract<AnswerTurnStatus, 'complete' | 'error'>
  answerDigest?: string
  harnessFinalizationDigest?: string
  /**
   * Private resume control state. These fields are intentionally omitted by
   * `toReservationRecord` and every public projection.
   */
  runGeneration?: number
  leaseOwner?: string
  leaseExpiresAt?: number
  checkpointDigest?: string
  checkpointStep?: number
  checkpoint?: AnswerTurnCheckpoint
  createdAt: number
  updatedAt: number
}

export type AnswerToolCallResultSummary = {
  slugs: readonly string[]
  count: number
  /** Present only on error/refused records. */
  errorCode?: string
}

export type AnswerToolCallRecord = {
  toolCallId: string
  turnId: string
  seq: number
  toolId: AnswerToolId
  inputJson: string
  resultSummaryJson: string
  resultJson: string
  resultHash: string
  status: AnswerToolCallStatus
  createdAt: number
}

/**
 * The only resumable answer checkpoint. It contains the completed selected
 * capability step and the exact AI SDK response messages needed by the
 * tool-less grounded prose request. It is private reservation state.
 */
export type AnswerTurnCheckpoint = {
  schemaVersion: 1
  phase: 'selected_capability'
  stepIndex: number
  responseMessages: readonly ResponseMessage[]
  toolCalls: readonly AnswerToolCallRecord[]
  modelRequests: readonly HarnessModelRequestRecord[]
  timings: readonly AnswerTurnTimingEntry[]
  providers: readonly AnswerSource[]
  capabilityToolNames: readonly string[]
  modelId: string
  userPrompt: string
}

export const ANSWER_TURN_CHECKPOINT_MAX_BYTES = 512 * 1024
const ANSWER_TURN_CHECKPOINT_MAX_MESSAGES = 16
const ANSWER_TURN_CHECKPOINT_MAX_TOOL_CALLS = 32
const ANSWER_TURN_CHECKPOINT_MAX_MODEL_REQUESTS = 32
const ANSWER_TURN_CHECKPOINT_MAX_TIMINGS = 128

/**
 * Parse only the private checkpoint shape accepted by the answer resume seam.
 * Provider options, files, headers, credentials, and arbitrary metadata are
 * deliberately excluded even though the installed AI SDK message types allow
 * them.
 */
export function parseAnswerTurnCheckpoint(value: unknown): AnswerTurnCheckpoint | null {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.phase !== 'selected_capability'
    || typeof value.stepIndex !== 'number'
    || !Number.isInteger(value.stepIndex)
    || value.stepIndex < 0
    || typeof value.modelId !== 'string'
    || value.modelId.length === 0
    || value.modelId.length > 160
    || typeof value.userPrompt !== 'string'
    || value.userPrompt.length === 0
    || value.userPrompt.length > 64 * 1024
    || !Array.isArray(value.responseMessages)
    || value.responseMessages.length > ANSWER_TURN_CHECKPOINT_MAX_MESSAGES
    || !value.responseMessages.every(isAnswerCheckpointResponseMessage)
    || !Array.isArray(value.toolCalls)
    || value.toolCalls.length > ANSWER_TURN_CHECKPOINT_MAX_TOOL_CALLS
    || !value.toolCalls.every(isAnswerCheckpointToolCall)
    || !Array.isArray(value.modelRequests)
    || value.modelRequests.length > ANSWER_TURN_CHECKPOINT_MAX_MODEL_REQUESTS
    || !value.modelRequests.every(isAnswerCheckpointModelRequest)
    || !Array.isArray(value.timings)
    || value.timings.length > ANSWER_TURN_CHECKPOINT_MAX_TIMINGS
    || !value.timings.every(isAnswerCheckpointTiming)
    || !Array.isArray(value.providers)
    || !value.providers.every((provider) => isBoundedJsonValue(provider) && !containsPrivateCheckpointKey(provider))
    || !Array.isArray(value.capabilityToolNames)
    || value.capabilityToolNames.length > 32
    || !value.capabilityToolNames.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 160)
    || containsPrivateCheckpointKey(value)) {
    return null
  }
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    return null
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > ANSWER_TURN_CHECKPOINT_MAX_BYTES) {
    return null
  }
  return value as AnswerTurnCheckpoint
}
/**
 * Projects AI SDK response messages into the bounded resume grammar. The
 * installed provider adapters may attach providerOptions to message parts;
 * those diagnostics are not part of the answer continuation contract.
 */
export function projectAnswerTurnCheckpointResponseMessages(
  messages: readonly ResponseMessage[],
): ResponseMessage[] {
  const projected: ResponseMessage[] = []
  for (const message of messages) {
    if (message.role === 'assistant') {
      if (typeof message.content === 'string') {
        if (message.content.length <= 64 * 1024) {
          projected.push({ role: 'assistant', content: message.content })
        }
        continue
      }
      const content: Array<TextPart | ToolCallPart | ToolApprovalRequest> = []
      for (const part of message.content) {
        const projectedPart = projectAnswerTurnCheckpointAssistantPart(part)
        if (projectedPart !== null) content.push(projectedPart)
      }
      if (content.length > 0) projected.push({ role: 'assistant', content })
      continue
    }

    const content: Array<ToolResultPart | ToolApprovalResponse> = []
    for (const part of message.content) {
      const projectedPart = projectAnswerTurnCheckpointToolPart(part)
      if (projectedPart !== null) content.push(projectedPart)
    }
    if (content.length > 0) projected.push({ role: 'tool', content })
  }
  return projected
}

function projectAnswerTurnCheckpointAssistantPart(
  value: unknown,
): TextPart | ToolCallPart | ToolApprovalRequest | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  switch (value.type) {
    case 'text':
      return typeof value.text === 'string' && value.text.length <= 64 * 1024
        ? { type: 'text', text: value.text }
        : null
    case 'tool-call':
      return typeof value.toolCallId === 'string'
        && typeof value.toolName === 'string'
        && isBoundedJsonValue(value.input)
        && !containsPrivateCheckpointKey(value.input)
        ? {
            type: 'tool-call',
            toolCallId: value.toolCallId,
            toolName: value.toolName,
            input: value.input,
          }
        : null
    case 'tool-approval-request':
      return typeof value.approvalId === 'string'
        && typeof value.toolCallId === 'string'
        && (value.isAutomatic === undefined || typeof value.isAutomatic === 'boolean')
        ? {
            type: 'tool-approval-request',
            approvalId: value.approvalId,
            toolCallId: value.toolCallId,
            ...(value.isAutomatic === undefined ? {} : { isAutomatic: value.isAutomatic }),
          }
        : null
    default:
      return null
  }
}

function projectAnswerTurnCheckpointToolPart(
  value: unknown,
): ToolResultPart | ToolApprovalResponse | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  if (value.type === 'tool-approval-response') {
    return typeof value.approvalId === 'string'
      && typeof value.approved === 'boolean'
      && (value.reason === undefined || typeof value.reason === 'string')
      && (value.providerExecuted === undefined || typeof value.providerExecuted === 'boolean')
      ? {
          type: 'tool-approval-response',
          approvalId: value.approvalId,
          approved: value.approved,
          ...(value.reason === undefined ? {} : { reason: value.reason }),
          ...(value.providerExecuted === undefined ? {} : { providerExecuted: value.providerExecuted }),
        }
      : null
  }
  if (value.type !== 'tool-result') return null
  if (typeof value.toolCallId !== 'string' || typeof value.toolName !== 'string') return null
  const output = projectAnswerTurnCheckpointToolOutput(value.output)
  return output === null
    ? null
    : {
        type: 'tool-result',
        toolCallId: value.toolCallId,
        toolName: value.toolName,
        output,
      }
}

function projectAnswerTurnCheckpointToolOutput(
  value: unknown,
): ToolResultPart['output'] | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null
  switch (value.type) {
    case 'execution-denied':
      return typeof value.reason === 'string'
        ? { type: 'execution-denied', reason: value.reason }
        : { type: 'execution-denied' }
    case 'text':
    case 'error-text':
      return typeof value.value === 'string' && value.value.length <= 64 * 1024
        ? { type: value.type, value: value.value }
        : null
    case 'json':
    case 'error-json':
      return isBoundedJsonValue(value.value)
        && isJSONValue(value.value)
        && !containsPrivateCheckpointKey(value.value)
        ? { type: value.type, value: value.value }
        : null
    default:
      return null
  }
}


function isAnswerCheckpointResponseMessage(value: unknown): value is ResponseMessage {
  if (!isRecord(value) || (value.role !== 'assistant' && value.role !== 'tool')) return false
  if (Object.keys(value).some((key) => key !== 'role' && key !== 'content')) return false
  if (!Array.isArray(value.content) && value.role === 'assistant') {
    return typeof value.content === 'string' && value.content.length <= 64 * 1024
  }
  if (!Array.isArray(value.content)) return false
  return value.content.length <= 32 && value.content.every((part) =>
    value.role === 'assistant' ? isAnswerCheckpointAssistantPart(part) : isAnswerCheckpointToolPart(part),
  )
}

function isAnswerCheckpointAssistantPart(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'text') {
    return Object.keys(value).every((key) => key === 'type' || key === 'text')
      && typeof value.text === 'string'
      && value.text.length <= 64 * 1024
  }
  if (value.type === 'tool-call') {
    return Object.keys(value).every((key) => key === 'type' || key === 'toolCallId' || key === 'toolName' || key === 'input')
      && typeof value.toolCallId === 'string'
      && typeof value.toolName === 'string'
      && isBoundedJsonValue(value.input)
      && !containsPrivateCheckpointKey(value.input)
  }
  if (value.type === 'tool-approval-request') {
    return Object.keys(value).every((key) => key === 'type' || key === 'approvalId' || key === 'toolCallId' || key === 'isAutomatic')
      && typeof value.approvalId === 'string'
      && typeof value.toolCallId === 'string'
      && (value.isAutomatic === undefined || typeof value.isAutomatic === 'boolean')
  }
  return false
}

function isAnswerCheckpointToolPart(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== 'string') return false
  if (value.type === 'tool-approval-response') {
    return Object.keys(value).every((key) =>
      key === 'type' || key === 'approvalId' || key === 'approved' || key === 'reason' || key === 'providerExecuted')
      && typeof value.approvalId === 'string'
      && typeof value.approved === 'boolean'
      && (value.reason === undefined || typeof value.reason === 'string')
      && (value.providerExecuted === undefined || typeof value.providerExecuted === 'boolean')
  }
  if (value.type !== 'tool-result'
    || Object.keys(value).some((key) => !['type', 'toolCallId', 'toolName', 'output'].includes(key))
    || typeof value.toolCallId !== 'string'
    || typeof value.toolName !== 'string'
    || !isRecord(value.output)
    || typeof value.output.type !== 'string'
    || !['text', 'json', 'execution-denied', 'error-text', 'error-json'].includes(value.output.type)) {
    return false
  }
  if (Object.keys(value.output).some((key) => !['type', 'value', 'reason'].includes(key))) return false
  if (value.output.type === 'execution-denied') {
    return value.output.reason === undefined || typeof value.output.reason === 'string'
  }
  const outputValue = value.output.value
  return value.output.type === 'text' || value.output.type === 'error-text'
    ? typeof outputValue === 'string' && outputValue.length <= 64 * 1024
    : isBoundedJsonValue(outputValue) && !containsPrivateCheckpointKey(outputValue)
}

function isAnswerCheckpointToolCall(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.toolCallId !== 'string'
    || typeof value.turnId !== 'string'
    || !Number.isInteger(value.seq)
    || typeof value.toolId !== 'string'
    || !AnswerToolIdValues.includes(value.toolId as AnswerToolId)
    || typeof value.inputJson !== 'string'
    || typeof value.resultSummaryJson !== 'string'
    || typeof value.resultJson !== 'string'
    || typeof value.resultHash !== 'string'
    || !AnswerToolCallStatusValues.includes(value.status as AnswerToolCallStatus)
    || typeof value.createdAt !== 'number'
    || !Number.isFinite(value.createdAt)) {
    return false
  }
  return [value.inputJson, value.resultSummaryJson, value.resultJson].every((json) => {
    if (json.length > 128 * 1024) return false
    try {
      const parsed = JSON.parse(json)
      return isBoundedJsonValue(parsed) && !containsPrivateCheckpointKey(parsed)
    } catch {
      return false
    }
  }) && !containsPrivateCheckpointKey(value)
}
const ANSWER_CHECKPOINT_MODEL_REQUEST_KEYS = new Set([
  'seq',
  'provider',
  'model',
  'status',
  'startedAt',
  'endedAt',
  'durationMs',
  'stopReason',
  'requestId',
  'responseId',
  'errorCode',
  'usage',
  'costUsd',
  'costUnavailableReason',
])

const ANSWER_CHECKPOINT_MODEL_USAGE_KEYS = new Set([
  'inputTokens',
  'outputTokens',
  'cachedInputTokens',
  'cacheWriteTokens',
  'reasoningOutputTokens',
  'totalTokens',
])

function isAnswerCheckpointModelRequest(value: unknown): boolean {
  if (!isRecord(value)
    || !Object.keys(value).every((key) => ANSWER_CHECKPOINT_MODEL_REQUEST_KEYS.has(key))
    || !['ok', 'error', 'refused', 'running', 'complete', 'stopped'].includes(String(value.status))
    || (value.durationMs !== undefined && (typeof value.durationMs !== 'number' || !Number.isFinite(value.durationMs)))) {
    return false
  }
  if (value.usage !== undefined && (
    !isRecord(value.usage)
    || !Object.keys(value.usage).every((key) => ANSWER_CHECKPOINT_MODEL_USAGE_KEYS.has(key))
    || !Object.values(value.usage).every((item) => typeof item === 'number' && Number.isFinite(item))
  )) {
    return false
  }
  return isBoundedJsonValue(value)
}

function isAnswerCheckpointTiming(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.durationMs !== 'number'
    || !Number.isFinite(value.durationMs)
    || typeof value.atMs !== 'number'
    || !Number.isFinite(value.atMs)
    || containsPrivateCheckpointKey(value)) {
    return false
  }
  return value.metadata === undefined
    || (isRecord(value.metadata)
      && Object.values(value.metadata).every((item) =>
        item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'))
}

function containsPrivateCheckpointKey(value: unknown, depth = 0): boolean {
  if (depth > 8 || value === null || typeof value !== 'object') return false
  return Object.entries(value).some(([key, child]) =>
    (!ANSWER_CHECKPOINT_MODEL_USAGE_KEYS.has(key)
      && /(?:authorization|cookie|header|token|secret|credential|api[_-]?key|privateTelemetry)/i.test(key))
      || containsPrivateCheckpointKey(child, depth + 1),
  )
}

export type AnswerTurnTimingEntry = {
  name: string
  durationMs: number
  atMs: number
  metadata?: Record<string, string | number | boolean | null>
}

export type AnswerRunToolCounters = {
  total: number
  complete: number
  error: number
  refused: number
  totalDurationMs: number
}

export type AnswerRunWorkLogCounters = {
  total: number
  complete: number
  running: number
  skipped: number
  error: number
  stopped: number
}

export type AnswerRunTimingCounters = {
  count: number
  totalDurationMs: number
}

export type AnswerRunGateSummary = {
  ok: boolean
  source: 'answer_gate' | 'turn_status'
  code?: string
}

export type AnswerRunSummary = {
  schemaVersion: 1
  turn: {
    intent: FollowUpIntent
    status: AnswerTurnStatus
  }
  tools: {
    total: number
    complete: number
    error: number
    refused: number
    totalDurationMs: number
    byName: Partial<Record<AnswerToolId, AnswerRunToolCounters>>
  }
  evidence: {
    providerCount: number
    allowedSlugCount: number
    resultHashes: readonly string[]
    snapshotHash: string
  }
  workLog: AnswerRunWorkLogCounters
  timings: {
    totalEntries: number
    totalDurationMs: number
    byName: Record<string, AnswerRunTimingCounters>
  }
  gates: AnswerRunGateSummary
}

export type AnswerRunCoverage = {
  toolsAvailable: readonly AnswerToolId[]
  toolsInvoked: readonly AnswerToolId[]
  toolsUnused: readonly AnswerToolId[]
  workLogPhases: readonly string[]
  hasProviders: boolean
  hasAllowedSlugs: boolean
  hasSnapshotHash: boolean
}

export type AnswerRunReport = {
  summary: AnswerRunSummary
  coverage: AnswerRunCoverage
}

export type PublicAnswerCheckSummary = {
  catalogSearches: number
  listingsRead: number
  listedBusinesses: number
  checksPassed: number
  checksFailed: number
  elapsedMs: number
}

export type PublicThreadTurn = {
  turnId: string
  seq: number
  query: string
  intent: FollowUpIntent
  status: AnswerTurnStatus
  problem?: AnswerTurnProblem
  workLog: readonly AnswerWorkStep[]
  artifacts: readonly AnswerArtifact[]
  oneLine: string
  layoutProfile?: AnswerLayoutProfile
  answerCheckSummary?: PublicAnswerCheckSummary
  timing?: AeSearchContext['timing']
  timingDate?: string
  createdAt?: number
}

export type PublicThreadProjection = {
  threadId: string
  title: string
  turns: readonly PublicThreadTurn[]
}

const publicFiniteNumber = z.number().finite()
const publicNonnegativeInteger = publicFiniteNumber.int().nonnegative()
const publicAnswerTurnProblemSchema = z
  .unknown()
  .transform((value, context) => {
    const problem = parseAnswerTurnProblemStrict(value)
    if (problem === undefined) {
      context.addIssue({ code: 'custom', message: 'Invalid answer turn problem.' })
      return z.NEVER
    }
    return problem
  })

export const PublicAnswerCheckSummarySchema = z.strictObject({
  catalogSearches: publicNonnegativeInteger,
  listingsRead: publicNonnegativeInteger,
  listedBusinesses: publicNonnegativeInteger,
  checksPassed: publicNonnegativeInteger,
  checksFailed: publicNonnegativeInteger,
  elapsedMs: publicNonnegativeInteger,
})

export const PublicThreadTurnSchema = z.strictObject({
  turnId: z.string().min(1),
  seq: publicNonnegativeInteger,
  query: z.string(),
  intent: z.enum(FollowUpIntentValues),
  status: z.enum(AnswerTurnStatusValues),
  problem: publicAnswerTurnProblemSchema.optional(),
  workLog: z.array(AnswerWorkStepSchema),
  artifacts: z.array(AnswerArtifactSchema),
  oneLine: z.string(),
  layoutProfile: z.enum(AnswerLayoutProfileValues).optional(),
  answerCheckSummary: PublicAnswerCheckSummarySchema.optional(),
  timing: z.enum(NeedTimingValues).optional(),
  timingDate: z.iso.date().optional(),
  createdAt: publicFiniteNumber.optional(),
}).superRefine((turn, context) => {
  if (turn.status === 'error' && turn.problem === undefined) {
    context.addIssue({ code: 'custom', path: ['problem'], message: 'Error turns require a problem.' })
  }
  if (turn.status !== 'error' && turn.problem !== undefined) {
    context.addIssue({ code: 'custom', path: ['problem'], message: 'Only error turns may carry a problem.' })
  }
  if (
    (turn.status === 'pending' || turn.status === 'stopped')
    && (turn.workLog.length > 0 || turn.artifacts.length > 0 || turn.oneLine !== '')
  ) {
    context.addIssue({ code: 'custom', message: 'Pending and stopped turns cannot carry answer content.' })
  }
})

export const PublicThreadProjectionSchema = z.strictObject({
  threadId: z.string().min(1),
  title: z.string(),
  turns: z.array(PublicThreadTurnSchema),
}).superRefine((projection, context) => {
  for (let index = 1; index < projection.turns.length; index += 1) {
    const previous = projection.turns[index - 1]
    const current = projection.turns[index]
    if (previous !== undefined && current !== undefined && current.seq <= previous.seq) {
      context.addIssue({ code: 'custom', path: ['turns', index, 'seq'], message: 'Turn sequence must increase.' })
    }
  }
})

export function parsePublicThreadProjection(
  value: unknown,
  expectedThreadId?: string,
): PublicThreadProjection | null {
  const parsed = PublicThreadProjectionSchema.safeParse(value)
  if (!parsed.success || expectedThreadId !== undefined && parsed.data.threadId !== expectedThreadId) {
    return null
  }
  return {
    threadId: parsed.data.threadId,
    title: parsed.data.title,
    turns: parsed.data.turns.map((turn) => ({
      turnId: turn.turnId,
      seq: turn.seq,
      query: turn.query,
      intent: turn.intent,
      status: turn.status,
      ...(turn.problem === undefined ? {} : { problem: turn.problem }),
      workLog: turn.workLog,
      artifacts: turn.artifacts,
      oneLine: turn.oneLine,
      ...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile }),
      ...(turn.answerCheckSummary === undefined ? {} : { answerCheckSummary: turn.answerCheckSummary }),
      ...(turn.timing === undefined ? {} : { timing: turn.timing }),
      ...(turn.timingDate === undefined ? {} : { timingDate: turn.timingDate }),
      ...(turn.createdAt === undefined ? {} : { createdAt: turn.createdAt }),
    })),
  }
}

export type AnswerTurnRequest = {
  threadId?: string
  query: string
  searchContext?: AeSearchContext
}

export const answerTurnRequestSchema = z.object({
  threadId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).max(200),
  searchContext: AeSearchContextSchema.optional(),
})

export type FrozenTurnEvidence = {
  providers: readonly AnswerSource[]
  importedClaims?: readonly WebDiscoveryClaim[]
  allowedSlugs: readonly string[]
  agentJsonUrl: string
  searchContext?: AeSearchContext
  toolCalls: readonly AnswerToolCallRecord[]
  /** Internal timing trace for answer quality/performance audits. */
  timings: readonly AnswerTurnTimingEntry[]
  /** Public work log persisted so replay shows the same visible process as the live stream. */
  workLog: readonly AnswerWorkStep[]
  /** Private OMP-style rollup used for debugging/evals; public projection exposes only sanitized counts. */
  answerRun: AnswerRunReport
  /** Durable pointer to the replayed harness run (runId === turnId), which lives in `harnessSessionEntries`. */
  harnessRunRef?: string
  /**
   * Internal reusable harness rollup; never exposed through public thread projection.
   * READ-SIDE REHYDRATION ONLY: the answer turn no longer persists this inline. The admin
   * run-viewer re-injects it from `harnessSessionEntries` (by `harnessRunRef`) before projecting.
   */
  harnessRun?: HarnessRunReport
  /** Private source-write receipt proving the final harness report and replay journal landed together. */
  harnessFinalization?: {
    schemaVersion: 1
    status: 'accepted' | 'replayed'
    finalizationHash: string
    journalEntryCount: number
    finalizedAt: number
  }
}

/** Evidence assembled before the persisted answer-run report is attached. */
export type FrozenTurnEvidenceDraft = Omit<FrozenTurnEvidence, 'answerRun'>

export type FrozenTurnProse = {
  oneLine: string
  summary: string
  nextStep: string
  compactLayout?: boolean
  layoutProfile?: AnswerLayoutProfile
}
