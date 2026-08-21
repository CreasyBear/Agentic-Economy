import {
  generateText,
  NoSuchToolError,
  Output,
  type LanguageModelUsage,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai'
import { convexKeylessExecutableSource } from '@/modules/capability-execution'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'
import { isRecord } from '@/modules/common/is-record'
import {
  openRouterCostUsd,
  openRouterGatewayConfig,
  openRouterModel,
  type OpenRouterGatewayConfig,
} from '@/modules/model-gateway/public'
import { buildUnsafeOperationOutputProse } from './answer-operation-prose'
import { safeToolResultJsonForPrompt } from './answer-tool-result-json'
import { answerNavigationBudgetExhausted } from './answer-navigation-policy'
import { AnswerProseSchema } from '../answer-prose'
import type {
  AnswerToolCallRecord,
  AnswerTurnTimingEntry,
} from '@/modules/answer-thread/tooling'
import type {
  HarnessModelRequestRecord,
  HarnessModelUsage,
} from '@/modules/harness/public'
import {
  answerAgentReadToolEntries,
  buildAnswerAgentTools,
  createAnswerToolExecutionSession,
  normalizeMaxToolCalls,
  timingEntry,
} from './answer-agent-tools'
import {
  buildAnswerToolUseAgentCheckpoint,
  finalizeAgentResult,
} from './answer-agent-result'
import {
  createAnswerToolLoopStopWhen,
  prepareAnswerToolLoopStep,
  resolveAnswerToolLoopStep,
} from './answer-tool-loop'
import {
  ANSWER_AGENT_MAX_TOOL_CALLS,
  ANSWER_OPERATION_EFFECT_DISPATCH_IDS,
  AnswerToolUseAgentError,
  isAnswerToolUseAgentError,
  OPERATION_EXECUTE_TOOL_ID,
  OPERATION_INVOKE_TOOL_ID,
  type AnswerToolUseAgentCheckpoint,
  type AnswerToolUseAgentInput,
  type AnswerToolUseAgentResult,
} from './answer-tool-use-agent-types'
import {
  buildToolUseAgentProseInstructions,
  buildToolUseAgentSystemPrompt,
  buildToolUseAgentUserPrompt,
} from './answer-llm-prompts'
import type { AnswerSource } from '../answer-synthesizer'

/**
 * The answer agent: a Vercel AI SDK tool-calling loop over the AE read
 * toolset, routed through the shared OpenRouter model gateway.
 *
 * The model is given the registered reads plus generic `operation.execute`.
 * The SDK owns transport, tool-call encoding, and the multi-step loop; AE owns
 * what matters here: `runAnswerToolCall` validates every read against the
 * action's Zod schema and records it as evidence, `runOperationToolCall`
 * handles execute/invoke, and the tool budget is enforced in the tool itself
 * so an over-budget call is a recorded refusal rather than a dropped one.
 * Tool rounds are one `generateText` with registered tools and no AnswerProse
 * schema. A later `generateText` projects `AnswerProse` from recorded evidence
 * after the model stops calling tools, the effect budget is spent, or the
 * navigation budget is exhausted. The server assembles `AnswerSource[]` and
 * `allowedSlugs` from the tool results - never from the model - and gates the
 * prose against them.
 * The registry stays literal. Misspelling recovery happens only when the model
 * chooses better `registry.search` arguments; the chosen input is persisted as
 * tool evidence. No hidden query-rewrite preprocessor runs.
 */

const ANSWER_MODEL_MAX_OUTPUT_TOKENS = 1024

export {
  ANSWER_AGENT_MAX_TOOL_CALLS,
  ANSWER_OPERATION_EFFECT_DISPATCH_IDS,
  AnswerToolUseAgentError,
  isAnswerToolUseAgentError,
  type AnswerToolUseAgentCheckpoint,
  type AnswerToolUseAgentInput,
  type AnswerToolUseAgentResult,
}
export { MAX_MODEL_TOOL_RESULT_BYTES } from './answer-tool-result-json'
export { buildAnswerAgentTools } from './answer-agent-tools'

type ModelCallAccountingState = {
  stepRecorded: boolean
}

export async function runAnswerToolUseAgent(
  input: AnswerToolUseAgentInput,
): Promise<AnswerToolUseAgentResult> {
  const config = input.config ?? openRouterGatewayConfig()
  if (config.apiKey === undefined) {
    throw new AnswerToolUseAgentError('unavailable')
  }

  return runRealToolUseAgent(input, config)
}

function appendPriorOperationInputContext(
  prompt: string,
  input: AnswerToolUseAgentInput,
): string {
  if (input.priorOperationInput === undefined) return prompt
  return [
    prompt,
    `Previously validated input for this same operation (repeat unchanged required fields and change only fields explicitly requested now): ${safeToolResultJsonForPrompt(safeJsonStringify(input.priorOperationInput))}`,
    'Fill only values explicitly present in the current query or the prior validated input for this same operation. Published input examples are illustrative teaching data, never defaults; do not copy an example value unless the current request supplies that value.',
  ].join('\n\n')
}

async function runRealToolUseAgent(
  input: AnswerToolUseAgentInput,
  config: OpenRouterGatewayConfig,
): Promise<AnswerToolUseAgentResult> {
  const invokeContext = input.operationInvokeContext
  if (
    invokeContext !== undefined &&
    (input.turnId === undefined ||
      typeof invokeContext.correlationId !== 'string' ||
      invokeContext.correlationId.trim().length === 0 ||
      typeof invokeContext.reservationKey !== 'string' ||
      invokeContext.reservationKey.trim().length === 0 ||
      typeof invokeContext.generation !== 'number' ||
      !Number.isInteger(invokeContext.generation) ||
      invokeContext.generation < 0 ||
      !isRecord(invokeContext.principal) ||
      typeof invokeContext.principal.principalId !== 'string' ||
      typeof invokeContext.principal.credentialId !== 'string' ||
      typeof invokeContext.service?.invokeOperation !== 'function')
  ) {
    throw new AnswerToolUseAgentError('unavailable')
  }
  const modelId = input.model ?? config.model
  const resumed = input.resumeCheckpoint
  const resumedIntermediate =
    resumed !== undefined &&
    resumed.operationOutcome === undefined &&
    (resumed.operationSelection !== undefined ||
      resumed.selectedOperationRef !== undefined ||
      resumed.selectedToolId === OPERATION_EXECUTE_TOOL_ID ||
      resumed.selectedToolId === OPERATION_INVOKE_TOOL_ID ||
      resumed.toolCalls.length > 0)
  const resumedPriorProviders = resumed?.priorProviders ?? []
  const resumedPriorAllowedSlugs = resumed?.priorAllowedSlugs ?? []
  // generateText calls, each of which resets the SDK's stepNumber to zero.
  let checkpointStepOrdinal = resumed?.stepOrdinal ?? 0
  let resumedReplayMessages: ModelMessage[] | undefined
  if (resumed !== undefined) {
    try {
      const parsed = JSON.parse(resumed.replayMessagesJson) as unknown
      if (
        !Array.isArray(parsed) ||
        !parsed.every((message) => isRecord(message))
      ) {
        throw new Error('answer_turn_checkpoint_messages_invalid')
      }
      resumedReplayMessages = parsed as ModelMessage[]
    } catch {
      throw new AnswerToolUseAgentError('prose_failed')
    }
  }
  if (resumed !== undefined && !resumedIntermediate) {
    const modelRequests = [...resumed.modelRequests]
    const timings: AnswerTurnTimingEntry[] = []
    const resumedProse = await runGuardedModelCall(
      input,
      modelId,
      modelRequests,
      () =>
        generateText({
          model: openRouterModel(config, modelId, { structuredOutputs: true }),
          instructions: buildToolUseAgentProseInstructions(),
          messages: resumedReplayMessages ?? [],
          maxOutputTokens: ANSWER_MODEL_MAX_OUTPUT_TOKENS,
          output: Output.object({
            schema: AnswerProseSchema,
            name: 'answer_prose',
          }),
          maxRetries: 0,
          ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
        }),
    )
    if (resumedProse.output === undefined) {
      throw new AnswerToolUseAgentError('prose_failed')
    }
    const resumedProviders = resumedPriorProviders
    const resumedAllowedSlugs = resumedPriorAllowedSlugs
    return finalizeAgentResult(
      {
        ...input,
        priorProviders: resumedProviders,
        priorAllowedSlugs: resumedAllowedSlugs,
      },
      resumedProse.output,
      [...resumed.toolCalls],
      resumedProviders,
      timings,
      modelRequests,
    )
  }
  const toolCalls: AnswerToolCallRecord[] = resumedIntermediate
    ? [...(resumed?.toolCalls ?? [])]
    : []
  const timings: AnswerTurnTimingEntry[] = []
  const modelRequests: HarnessModelRequestRecord[] = resumedIntermediate
    ? [...(resumed?.modelRequests ?? [])]
    : []
  const providers: AnswerSource[] = resumedIntermediate
    ? [...resumedPriorProviders]
    : []
  const maxToolCalls = normalizeMaxToolCalls(
    input.maxToolCalls ?? ANSWER_AGENT_MAX_TOOL_CALLS,
  )
  const keylessExecutableSource =
    input.keylessExecutableSource ?? convexKeylessExecutableSource
  const session = createAnswerToolExecutionSession({
    input,
    toolCalls,
    timings,
    providers,
    maxToolCalls,
    keylessExecutableSource,
  })
  const tools = buildAnswerAgentTools(session.runToolCall)
  const readToolEntries = answerAgentReadToolEntries()
  const readToolNames = readToolEntries.map(({ toolName }) => toolName)
  const persistToolCheckpoint = async (
    replayMessagesJson: string,
  ): Promise<void> => {
    if (input.onToolCheckpoint === undefined) return
    const checkpointStep = checkpointStepOrdinal + 1
    checkpointStepOrdinal = checkpointStep
    await input.onToolCheckpoint(
      buildAnswerToolUseAgentCheckpoint({
        stepOrdinal: checkpointStep,
        toolCalls,
        providers,
        modelRequests,
        replayMessagesJson,
      }),
    )
  }

  const recordStep =
    (
      accounting: ModelCallAccountingState,
      timingName: string,
      extraMetadata: Record<string, string | number | boolean | null>,
    ) =>
    async (step: StepResult<ToolSet>): Promise<void> => {
      const seq = modelRequests.length
      const resolvedModel = step.response.modelId ?? modelId
      const usage = harnessUsage(step.usage)
      const costUsd = openRouterCostUsd(step.providerMetadata)
      recordModelRequest(input, modelRequests, {
        seq,
        provider: 'openrouter',
        model: resolvedModel,
        status: 'ok',
        startedAt: step.response.timestamp.getTime(),
        endedAt:
          step.response.timestamp.getTime() + step.performance.responseTimeMs,
        durationMs: step.performance.responseTimeMs,
        stopReason: step.rawFinishReason ?? step.finishReason,
        ...(step.response.id === undefined
          ? {}
          : { responseId: step.response.id }),
        ...(usage === undefined ? {} : { usage }),
        ...(costUsd === undefined
          ? { costUnavailableReason: 'price_table_missing' }
          : { costUsd }),
      })
      accounting.stepRecorded = true
      timings.push(
        timingEntry(timingName, step.performance.responseTimeMs, {
          ...extraMetadata,
          provider: 'openrouter',
          model: resolvedModel,
        }),
      )
      if (step.toolCalls.length === 0) return
      const replayMessages = [
        ...(resumedReplayMessages ?? [
          { role: 'user', content: userPrompt },
        ]),
        ...step.response.messages,
      ]
      resumedReplayMessages = replayMessages
      await persistToolCheckpoint(safeJsonStringify(replayMessages))
    }

  let userPrompt = appendPriorOperationInputContext(
    buildToolUseAgentUserPrompt({
      query: input.query,
      ...(input.priorProviders === undefined
        ? {}
        : { priorProviders: input.priorProviders }),
      ...(input.searchContext === undefined
        ? {}
        : { searchContext: input.searchContext }),
    }),
    input,
  )
  const proseOutput = Output.object({
    schema: AnswerProseSchema,
    name: 'answer_prose',
  })
  if (requestsFabricatedLiveAnswerWithoutExecution(input.query)) {
    return finalizeAgentResult(
      input,
      {
        oneLine: 'I will not invent a live result.',
        summary:
          'A current value needs a live source, and you asked me not to run one.',
        whatToDoNow:
          'Ask me to run the lookup, or use a clearly labelled hypothetical value instead.',
      },
      toolCalls,
      providers,
      timings,
      modelRequests,
    )
  }

  const resolveLoopStep = () =>
    resolveAnswerToolLoopStep({
      route: input.effectiveRoute,
      toolCalls: session.toolCalls,
      navigationState: session.navigationState,
      tools,
      readToolEntries,
      navigationBudget: session.navigationBudget,
      unsafeOperationOutput: session.unsafeOperationOutput,
      toolExecutionError: session.toolExecutionError,
    })
  await runGuardedModelCall(
    input,
    modelId,
    modelRequests,
    (accounting) =>
      generateText({
        model: openRouterModel(config, modelId),
        instructions: buildToolUseAgentSystemPrompt(),
        ...(resumedReplayMessages === undefined
          ? { prompt: userPrompt }
          : { messages: resumedReplayMessages }),
        maxOutputTokens: ANSWER_MODEL_MAX_OUTPUT_TOKENS,
        tools,
        temperature: 0.2,
        maxRetries: 0,
        prepareStep: async () => {
          accounting.stepRecorded = false
          return prepareAnswerToolLoopStep({
            loopStep: resolveLoopStep(),
            readToolEntries,
            instructions: buildToolUseAgentSystemPrompt(),
          })
        },
        stopWhen: createAnswerToolLoopStopWhen(resolveLoopStep),
        onStepEnd: recordStep(
          accounting,
          'model.openrouter_round',
          {
            tools: readToolNames.length,
          },
        ),
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      }),
  ).catch((error: unknown) => {
    if (session.toolExecutionError) {
      throw new AnswerToolUseAgentError('tool_unavailable', { cause: error })
    }
    throw error
  })
  if (session.toolExecutionError) {
    throw new AnswerToolUseAgentError('tool_unavailable')
  }
  if (session.unsafeOperationOutput) {
    return finalizeAgentResult(
      input,
      buildUnsafeOperationOutputProse(),
      toolCalls,
      providers,
      timings,
      modelRequests,
    )
  }
  if (answerNavigationBudgetExhausted({
    state: session.navigationState,
    ...session.navigationBudget,
  })) {
    updateLastModelTiming(timings, { toolBudgetExhausted: true, maxToolCalls })
  }

  const proseMessages: ModelMessage[] = resumedReplayMessages ?? [
    { role: 'user', content: userPrompt },
  ]
  const proseResult = await runGuardedModelCall(
    input,
    modelId,
    modelRequests,
    (accounting) =>
      generateText({
        model: openRouterModel(config, modelId, { structuredOutputs: true }),
        instructions: buildToolUseAgentProseInstructions(),
        messages: proseMessages,
        maxOutputTokens: ANSWER_MODEL_MAX_OUTPUT_TOKENS,
        output: proseOutput,
        temperature: 0.2,
        maxRetries: 0,
        onStepEnd: recordStep(
          accounting,
          'model.openrouter_final_prose',
          { tools: 0 },
        ),
        ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
      }),
  )
  const prose = proseResult.output
  if (prose === undefined) {
    throw new AnswerToolUseAgentError('prose_failed')
  }

  return finalizeAgentResult(
    input,
    prose,
    toolCalls,
    providers,
    timings,
    modelRequests,
  )
}

/**
 * Runs one model interaction under the turn's harness guards and records a
 * failed request in the turn's model accounting when the interaction errors.
 */
async function runGuardedModelCall<T>(
  input: AnswerToolUseAgentInput,
  modelId: string,
  modelRequests: HarnessModelRequestRecord[],
  work: (accounting: ModelCallAccountingState) => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()
  const accounting: ModelCallAccountingState = { stepRecorded: false }
  try {
    const result =
      input.harnessLoop === undefined
        ? await work(accounting)
        : await input.harnessLoop.phase('model.provider_sequence', () =>
            work(accounting),
          )
    if (!accounting.stepRecorded) {
      const durationMs = Date.now() - startedAt
      recordModelRequest(input, modelRequests, {
        seq: modelRequests.length,
        provider: 'openrouter',
        model: modelId,
        status: 'ok',
        startedAt,
        endedAt: startedAt + durationMs,
        durationMs,
        costUnavailableReason: 'provider_metadata_missing',
      })
    }
    return result
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const agentError = toAgentError(error)
    if (!accounting.stepRecorded) {
      recordModelRequest(input, modelRequests, {
        seq: modelRequests.length,
        provider: 'openrouter',
        model: modelId,
        status: 'error',
        startedAt,
        endedAt: startedAt + durationMs,
        durationMs,
        errorCode: agentError.code,
        costUnavailableReason: 'request_failed',
      })
    }
    throw agentError
  }
}

/**
 * A model asking for a tool that is not on the turn's toolset is a boundary
 * refusal, not a transport failure, so it keeps its own code.
 */
function toAgentError(error: unknown): AnswerToolUseAgentError {
  if (isAnswerToolUseAgentError(error)) {
    return error
  }
  if (NoSuchToolError.isInstance(error)) {
    return new AnswerToolUseAgentError('tool_unavailable', { cause: error })
  }
  return new AnswerToolUseAgentError('request_failed', { cause: error })
}

function harnessUsage(
  usage: LanguageModelUsage,
): HarnessModelUsage | undefined {
  const mapped: HarnessModelUsage = {
    ...(usage.inputTokens === undefined
      ? {}
      : { inputTokens: usage.inputTokens }),
    ...(usage.outputTokens === undefined
      ? {}
      : { outputTokens: usage.outputTokens }),
    ...(usage.inputTokenDetails.cacheReadTokens === undefined
      ? {}
      : { cachedInputTokens: usage.inputTokenDetails.cacheReadTokens }),
    ...(usage.inputTokenDetails.cacheWriteTokens === undefined
      ? {}
      : { cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens }),
    ...(usage.outputTokenDetails.reasoningTokens === undefined
      ? {}
      : { reasoningOutputTokens: usage.outputTokenDetails.reasoningTokens }),
    ...(usage.totalTokens === undefined
      ? {}
      : { totalTokens: usage.totalTokens }),
  }
  return Object.keys(mapped).length === 0 ? undefined : mapped
}

function recordModelRequest(
  input: AnswerToolUseAgentInput,
  target: HarnessModelRequestRecord[],
  record: HarnessModelRequestRecord,
): void {
  target.push(record)
  input.onModelRequest?.(record)
}

function updateLastModelTiming(
  timings: AnswerTurnTimingEntry[],
  metadata: Record<string, string | number | boolean | null>,
): void {
  const last = timings.at(-1)
  if (last === undefined) {
    return
  }
  last.metadata = {
    ...(last.metadata ?? {}),
    ...metadata,
  }
}

function requestsFabricatedLiveAnswerWithoutExecution(query: string): boolean {
  const normalized = query.trim().toLowerCase()
  const requestsFabrication =
    /\b(?:fabricate|fabricated|fake|guess|invent|made[- ]?up|make up)\b/.test(
      normalized,
    )
  const suppressesExecution =
    /\bwithout\b[\s\S]*\b(?:api|capability|execution|lookup|operation|source|tool)\b/.test(
      normalized,
    ) ||
    /\b(?:do not|don't)\b[\s\S]*\b(?:call|execute|fetch|look up|run|use)\b/.test(
      normalized,
    )
  return requestsFabrication && suppressesExecution
}
