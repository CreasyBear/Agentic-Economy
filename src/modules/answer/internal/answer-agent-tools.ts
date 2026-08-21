import {
  jsonSchema,
  tool,
  type JSONSchema7,
  type Tool,
  type ToolSet,
} from 'ai'
import type {
  KeylessExecutableSourcePort,
} from '@/modules/capability-execution'
import { isRecord } from '@/modules/common/is-record'
import type { AnyAction } from '@/modules/common/action'
import {
  actionToOpenRouterTool,
  openRouterToolName,
} from './action-to-tool-spec'
import {
  runOperationToolCall,
  type OperationToolCallResult,
} from './answer-operation-tool-call'
import {
  modelFacingToolResultJson,
  safeToolResultJsonForPrompt,
} from './answer-tool-result-json'
import {
  answerNavigationBudgetExceeded,
  answerRouteForbidsTool,
  initialAnswerOperationNavigationState,
  oneNativeBatchCoversRequestedIntents,
  reduceAnswerOperationNavigation,
  type AnswerOperationNavigationState,
} from './answer-navigation-policy'
import {
  ANSWER_READ_TOOL_IDS,
  findAnswerReadToolAction,
  refuseAnswerToolCall,
  runAnswerToolCall,
  type AnswerToolCallRecord,
  type AnswerTurnTimingEntry,
} from '@/modules/answer-thread/tooling'
import type { AnswerSource } from '../answer-synthesizer'
import {
  AnswerToolUseAgentError,
  DEFAULT_LIMIT,
  MAX_EFFECT_CALLS,
  OPERATION_EXECUTE_TOOL_ID,
  OPERATION_INVOKE_TOOL_ID,
  type AnswerToolUseAgentInput,
} from './answer-tool-use-agent-types'

const OPERATION_EXECUTE_MODEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['operationRef', 'input'],
  properties: {
    operationRef: {
      type: 'string',
      description:
        'Current opaque operation reference returned by a prior operations.detail result for the selected operation. Do not take an operationRef from search alone.',
    },
    input: {
      type: 'object',
      description:
        'Inputs keyed exactly as the current operation contract publishes them.',
    },
  },
} as const satisfies JSONSchema7

export type AnswerAgentReadToolEntry = Readonly<{
  toolId: string
  toolName: string
}>

export type AnswerToolExecutionSession = {
  runToolCall: (
    toolId: string,
    rawInput: unknown,
    toolCallId: string,
  ) => Promise<string>
  toolCalls: AnswerToolCallRecord[]
  timings: AnswerTurnTimingEntry[]
  providers: AnswerSource[]
  navigationState: AnswerOperationNavigationState
  unsafeOperationOutput: boolean
  toolExecutionError: boolean
  navigationBudget: {
    maxNavigationCalls: number
    maxEffectCalls: number
  }
}

/**
 * The AE read toolset plus generic `operation.execute`, projected onto AI SDK
 * tools. Validation for registered reads always succeeds here: `runAnswerToolCall`
 * is the single validator for those evidence records. Execute/invoke still go
 * through `runOperationToolCall`. Generic execute uses a host envelope
 * (operationRef + input) rather than a per-operation schema.
 */
export function buildAnswerAgentTools(
  runToolCall: (
    toolId: string,
    rawInput: unknown,
    toolCallId: string,
  ) => Promise<string>,
): ToolSet {
  const tools: Record<string, Tool> = {}
  const toolNames = new Set<string>()
  for (const action of listAnswerModelToolActions()) {
    const toolName = openRouterToolName(action.id)
    if (toolNames.has(toolName)) {
      throw new AnswerToolUseAgentError('tool_unavailable')
    }
    toolNames.add(toolName)
    if (action.id === OPERATION_EXECUTE_TOOL_ID) {
      tools[toolName] = tool({
        description: [
          action.summary,
          'Pass operationRef from a prior operations.detail result for the selected operation, then the published input object. Do not invent an operationRef or live numbers, and do not take an operationRef from search alone.',
        ].join(' '),
        inputSchema: jsonSchema<unknown>(OPERATION_EXECUTE_MODEL_SCHEMA, {
          validate: (value: unknown) => ({ success: true, value }),
        }),
        execute: (rawInput: unknown, options: { toolCallId: string }) =>
          runToolCall(action.id, rawInput, options.toolCallId),
      })
      continue
    }
    const spec = actionToOpenRouterTool(action)
    tools[toolName] = tool({
      description: spec.function.description,
      strict: true,
      inputSchema: jsonSchema<unknown>(
        spec.function.parameters as JSONSchema7,
        { validate: (value: unknown) => ({ success: true, value }) },
      ),
      execute: (rawInput: unknown, options: { toolCallId: string }) =>
        runToolCall(action.id, rawInput, options.toolCallId),
    })
  }
  return tools
}

export function answerAgentReadToolEntries(): AnswerAgentReadToolEntry[] {
  return ANSWER_READ_TOOL_IDS.map((toolId) => ({
    toolId,
    toolName: openRouterToolName(toolId),
  }))
}

export function createAnswerToolExecutionSession(args: {
  input: AnswerToolUseAgentInput
  toolCalls: AnswerToolCallRecord[]
  timings: AnswerTurnTimingEntry[]
  providers: AnswerSource[]
  maxToolCalls: number
  keylessExecutableSource: KeylessExecutableSourcePort
}): AnswerToolExecutionSession {
  const { input, toolCalls, timings, providers, maxToolCalls } = args
  const invokeContext = input.operationInvokeContext
  const slugSeen = new Set(providers.map((provider) => provider.slug))
  const session: AnswerToolExecutionSession = {
    toolCalls,
    timings,
    providers,
    navigationState: initialAnswerOperationNavigationState({
      toolCalls,
      effectUnlocked: true,
    }),
    unsafeOperationOutput: false,
    toolExecutionError: false,
    navigationBudget: {
      maxNavigationCalls: maxToolCalls,
      maxEffectCalls: MAX_EFFECT_CALLS,
    },
    runToolCall: () => {
      throw new AnswerToolUseAgentError('tool_unavailable')
    },
  }
  let toolSeq = toolCalls.reduce(
    (nextSeq, call) => Math.max(nextSeq, call.seq + 1),
    0,
  )
  let toolQueue: Promise<void> = Promise.resolve()

  const runToolCall = (
    toolId: string,
    rawInput: unknown,
    toolCallId: string,
  ): Promise<string> => {
    const run = toolQueue.then(async () => {
      const toolStartedAt = Date.now()
      const routedToolId =
        toolId === OPERATION_EXECUTE_TOOL_ID && invokeContext !== undefined
          ? OPERATION_INVOKE_TOOL_ID
          : toolId
      const appliedRawInput = applyToolSearchDefaults(
        input,
        routedToolId,
        rawInput,
      )
      const effectOrdinal = toolSeq
      toolSeq += 1
      const callInput = {
        toolId: routedToolId,
        input: appliedRawInput,
        turnId: input.turnId ?? 'pending',
        seq: effectOrdinal,
        ...(input.harnessLoop === undefined
          ? {}
          : { harnessLoop: input.harnessLoop }),
      }
      const isOperationTool =
        callInput.toolId === OPERATION_EXECUTE_TOOL_ID ||
        callInput.toolId === OPERATION_INVOKE_TOOL_ID
      if (isOperationTool && input.harnessLoop !== undefined) {
        input.harnessLoop.recordRuntimeEvent({
          type: 'tool.started',
          runId: input.harnessLoop.runId,
          toolCallId,
          toolId: callInput.toolId,
          at: toolStartedAt,
        })
      }
      const routeToolForbidden = answerRouteForbidsTool(
        input.effectiveRoute,
        callInput.toolId,
      )
      const budgetExceeded = answerNavigationBudgetExceeded({
        state: session.navigationState,
        effect: isOperationTool,
        ...session.navigationBudget,
      })
      const coversEveryRequestedIntent =
        !isOperationTool
        || oneNativeBatchCoversRequestedIntents(
          callInput.input,
          undefined,
          input.requestedIntents,
        )
      const result: OperationToolCallResult =
        isOperationTool && input.signal?.aborted === true
          ? refuseAnswerToolCall(
              callInput,
              'aborted_before_dispatch',
              toolCallId,
            )
          : routeToolForbidden
            ? refuseAnswerToolCall(
                callInput,
                'route_tool_forbidden',
                toolCallId,
              )
            : budgetExceeded
              ? refuseAnswerToolCall(callInput, 'budget_exceeded', toolCallId)
              : !coversEveryRequestedIntent
                ? refuseAnswerToolCall(
                    callInput,
                    'multiple_operation_intents_require_narrowing',
                    toolCallId,
                  )
                : isOperationTool
                ? await runOperationToolCall(
                    callInput,
                    toolCallId,
                    args.keylessExecutableSource,
                    input.operationExecuteDeps,
                    undefined,
                    effectOrdinal,
                    invokeContext,
                    input.signal,
                  )
                : await runAnswerToolCall(callInput)
      const observedResult =
        (result.record.toolId === OPERATION_EXECUTE_TOOL_ID ||
          result.record.toolId === OPERATION_INVOKE_TOOL_ID) &&
        result.timings.length === 0
          ? {
              ...result,
              timings: [
                timingEntry('tool.run', Date.now() - toolStartedAt, {
                  toolId: result.record.toolId,
                  toolSeq: result.record.seq,
                  harnessStatus: result.record.status,
                }),
              ],
            }
          : result
      if (isOperationTool && input.harnessLoop !== undefined) {
        const toolCompletedAt = Date.now()
        const complete = observedResult.record.status === 'complete'
        input.harnessLoop.recordRuntimeEvent({
          type: complete ? 'tool.completed' : 'tool.failed',
          runId: input.harnessLoop.runId,
          toolCallId,
          toolId: observedResult.record.toolId,
          at: toolCompletedAt,
          status: complete
            ? 'ok'
            : observedResult.record.status === 'refused'
              ? 'refused'
              : 'error',
          durationMs: roundNonNegative2(toolCompletedAt - toolStartedAt),
          ...(complete
            ? {}
            : {
                errorCode: observedResult.record.status === 'refused'
                  ? 'tool_refused'
                  : 'tool_error',
                })
        })
      }
      session.navigationState = reduceAnswerOperationNavigation(
        session.navigationState,
        { kind: 'tool_attempted', effect: isOperationTool },
      )
      const records = observedResult.records ?? [observedResult.record]
      toolCalls.push(...records)
      if (isOperationTool) {
        try {
          const parsed: unknown = JSON.parse(observedResult.record.resultJson)
          session.unsafeOperationOutput =
            isRecord(parsed) && parsed.kind === 'unsafe_output'
        } catch {
          session.unsafeOperationOutput = false
        }
      }
      appendTimings(timings, observedResult.timings, {
        phase: 'agent_tool',
        toolId: observedResult.record.toolId,
        toolSeq: observedResult.record.seq,
      })
      appendProvidersFromToolResult(
        providers,
        slugSeen,
        observedResult.providers,
      )
      const modelResultJson = modelFacingToolResultJson(observedResult)
      return safeToolResultJsonForPrompt(modelResultJson)
    }).catch((error: unknown) => {
      session.toolExecutionError = true
      throw error
    })
    toolQueue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  session.runToolCall = runToolCall
  return session
}

export function timingEntry(
  name: string,
  durationMs: number,
  metadata?: Record<string, string | number | boolean | null>,
): AnswerTurnTimingEntry {
  return {
    name,
    durationMs: roundNonNegative2(durationMs),
    atMs: Date.now(),
    ...(metadata === undefined ? {} : { metadata }),
  }
}

export function normalizeMaxToolCalls(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1
  }
  return Math.max(0, Math.floor(value))
}

function listAnswerModelToolActions(): AnyAction[] {
  return ANSWER_READ_TOOL_IDS.map((toolId) => {
    const action = findAnswerReadToolAction(toolId)
    if (action === undefined) {
      throw new AnswerToolUseAgentError('tool_unavailable')
    }
    return action
  })
}

function appendProvidersFromToolResult(
  providers: AnswerSource[],
  slugSeen: Set<string>,
  toolProviders: readonly AnswerSource[],
): void {
  for (const provider of toolProviders) {
    if (!slugSeen.has(provider.slug)) {
      slugSeen.add(provider.slug)
      providers.push({ ...provider, citationIndex: providers.length + 1 })
    }
  }
}

function applyToolSearchDefaults(
  input: AnswerToolUseAgentInput,
  toolId: string,
  raw: unknown,
): unknown {
  if (toolId === 'registry.operations.search' && isRecord(raw)) {
    const filters = isRecord(raw.filters) ? { ...raw.filters } : {}
    filters.availability ??= ['routeable']
    return { ...raw, filters }
  }

  if (toolId !== 'registry.search' || !isRecord(raw)) return raw

  const record = { ...(raw as Record<string, unknown>) }
  record.limit = normalizeRegistrySearchLimit(
    record.limit,
    input.maxRegistrySearchLimit,
  )

  if (
    record.mode === undefined &&
    input.searchContext?.mode === 'whole_catalogue'
  ) {
    record.mode = 'whole_catalogue'
  }

  return record
}

function normalizeRegistrySearchLimit(
  value: unknown,
  maxLimit: number | undefined,
): number {
  const max = normalizeMaxRegistrySearchLimit(maxLimit)
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return max
  }
  return Math.min(max, Math.max(1, Math.floor(value)))
}

function normalizeMaxRegistrySearchLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_LIMIT
  }
  return Math.max(1, Math.floor(value))
}

function appendTimings(
  target: AnswerTurnTimingEntry[],
  incoming: readonly AnswerTurnTimingEntry[],
  metadata: Record<string, string | number | boolean | null>,
): void {
  for (const entry of incoming) {
    target.push({
      ...entry,
      metadata: {
        ...(entry.metadata ?? {}),
        ...metadata,
      },
    })
  }
}

function roundNonNegative2(value: number): number {
  return Number.isFinite(value) ? Math.round(Math.max(0, value) * 100) / 100 : 0
}
