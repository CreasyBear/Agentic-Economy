import {
  type KeylessExecutableSourcePort,
  type OperationExecuteDeps,
} from '@/modules/capability-execution'
import {
  ANSWER_OPERATION_EFFECT_TOOL_IDS,
  type AnswerToolCallRecord,
  type AnswerTurnTimingEntry,
} from '@/modules/answer-thread/tooling'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import type {
  AnswerOperationInvokeContext,
  AnswerToolId,
  AnswerTurnCheckpoint,
} from '@/modules/answer-thread/answer-thread.schema'
import type { AnswerGateResult } from './answer-gate'
import type {
  AnswerOperationCandidate,
  AnswerOperationComparison,
  AnswerOperationOutcome,
  AnswerOperationPlan,
  AnswerOperationPresentation,
  AnswerOperationSelection,
  AnswerRequestInterpretation,
  EffectiveAnswerAgentRoute,
} from '../answer-schema'
import type { AnswerProse } from '../answer-prose'
import type { AeSearchContext } from '../search-context'
import type { AnswerSource, AnswerSnapshot } from '../answer-synthesizer'
import type {
  HarnessModelRequestRecord,
  HarnessRunLoop,
} from '@/modules/harness/public'
import type { OpenRouterGatewayConfig } from '@/modules/model-gateway/public'

export const ANSWER_AGENT_MAX_TOOL_CALLS = 4
export const MAX_EFFECT_CALLS = 1
export const DEFAULT_LIMIT = 3

/**
 * The execution record seam. Generic `operation.execute` / `operation.invoke`
 * report through these ids so the evidence stream and the prose guard key on
 * ONE id rather than a per-op set.
 */
export const ANSWER_OPERATION_EFFECT_DISPATCH_IDS = ANSWER_OPERATION_EFFECT_TOOL_IDS
export const [OPERATION_EXECUTE_TOOL_ID, OPERATION_INVOKE_TOOL_ID] =
  ANSWER_OPERATION_EFFECT_DISPATCH_IDS

export type AnswerToolUseAgentCheckpoint = Readonly<{
  stepOrdinal: number
  toolCalls: readonly AnswerToolCallRecord[]
  priorProviders: readonly AnswerSource[]
  priorAllowedSlugs: readonly string[]
  modelRequests: readonly HarnessModelRequestRecord[]
  replayMessagesJson: string
  selectedOperationRef?: string
  selectedToolId?: AnswerToolId
  descriptorDigest?: string
  resultDigest?: string
  operationCandidates?: readonly AnswerOperationCandidate[]
  operationCandidatesDigest?: string
  operationComparison?: AnswerOperationComparison
  operationOutcome?: AnswerOperationOutcome
  operationPlan?: AnswerOperationPlan
  operationSelection?: AnswerOperationSelection
}>

export type AnswerToolUseAgentInput = {
  query: string
  /** Reservation-bound turn identity used for durable tool records and idempotency. */
  turnId?: string
  operationInvokeContext?: AnswerOperationInvokeContext
  /** OpenRouter gateway config; defaults to the environment-backed config. */
  config?: OpenRouterGatewayConfig
  model?: string
  signal?: AbortSignal
  /** Prior-turn providers kept only as prompt context; this turn still enters the tool loop. */
  priorProviders?: readonly AnswerSource[]
  /** Prior-turn slugs used as the gate allow-list when this turn has no new search. */
  priorAllowedSlugs?: readonly string[]
  followUpIntent?: FollowUpIntent
  /**
   * Orchestrator-resolved route policy. Direct harness callers may omit it to
   * exercise the unrestricted tool surface.
   */
  effectiveRoute?: EffectiveAnswerAgentRoute
  searchContext?: AeSearchContext | undefined
  /** Ordered request items from the durable structured preflight. */
  requestedIntents?: AnswerRequestInterpretation['requestedIntents']
  priorOperationInput?: Readonly<Record<string, unknown>>
  priorOperationRef?: string
  priorOperationPresentation?: AnswerOperationPresentation
  keylessExecutableSource?: KeylessExecutableSourcePort
  operationExecuteDeps?: Partial<
    Pick<OperationExecuteDeps, 'isPublicTarget' | 'fetchImpl' | 'signal'>
  >
  onModelRequest?: (record: HarnessModelRequestRecord) => void
  onToolCheckpoint?: (checkpoint: AnswerToolUseAgentCheckpoint) => Promise<void>
  resumeCheckpoint?: AnswerTurnCheckpoint
  /** Optional live harness loop that owns model/tool runtime events for this turn. */
  harnessLoop?: HarnessRunLoop
  /** Hard cap for model-requested tool calls executed during this agent turn. */
  maxToolCalls?: number
  /** Hard cap for model-supplied registry.search limit values. */
  maxRegistrySearchLimit?: number
}

export type AnswerToolUseAgentResult = {
  prose: AnswerProse
  providers: readonly AnswerSource[]
  allowedSlugs: ReadonlySet<string>
  toolCalls: AnswerToolCallRecord[]
  modelRequests: readonly HarnessModelRequestRecord[]
  timings: readonly AnswerTurnTimingEntry[]
  snapshot: AnswerSnapshot
  gate: AnswerGateResult
}

export class AnswerToolUseAgentError extends Error {
  readonly code: string
  constructor(code: string, options?: ErrorOptions) {
    super(`answer_tool_use_${code}`, options)
    this.name = 'AnswerToolUseAgentError'
    this.code = code
  }
}

export function isAnswerToolUseAgentError(
  error: unknown,
): error is AnswerToolUseAgentError {
  return error instanceof AnswerToolUseAgentError
}
