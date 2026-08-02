import {
  generateText,
  jsonSchema,
  NoSuchToolError,
  Output,
  isStepCount,
  type StepResult,
  tool,
  type LanguageModelUsage,
  type Tool,
  type ToolSet,
} from 'ai'

import type { AnyAction } from '@/modules/actions'
import { roundNonNegative2 } from '@/modules/common/round-nonnegative-2'
import {
  openRouterCostUsd,
  openRouterGatewayConfig,
  openRouterModel,
  type OpenRouterGatewayConfig,
} from '@/modules/model-gateway/public'
import { runAnswerGate, type AnswerGateResult } from './answer-gate'
import { collectAllowedSlugsFromToolResults } from './catalog-grounding'
import { actionToOpenRouterTool } from './action-to-tool-spec'
import { buildToolUseAgentSystemPrompt, buildToolUseAgentUserPrompt } from './answer-llm-prompts'
import {
  extractRequestedLocation,
  filterProvidersForRequestedLocation,
} from './provider-location-filter'
import { AnswerProseSchema, snapshotProseFromAnswer, type AnswerProse } from '../answer-prose'
import {
  aeSearchContextLocationQuery,
  type AeSearchContext,
} from '../search-context'
import {
  buildAgentJsonUrl,
  type AnswerSource,
  type AnswerSnapshot,
} from '../answer-synthesizer'
import {
  ANSWER_READ_TOOL_IDS,
  findAnswerReadToolAction,
  refuseAnswerToolCall,
  runAnswerToolCall,
  toolCallRecordsToGateInput,
  type AnswerToolCallRecord,
  type AnswerTurnTimingEntry,
} from '@/modules/answer-thread/tooling'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import type { HarnessModelRequestRecord, HarnessModelUsage, HarnessRunLoop } from '@/modules/harness/public'

/**
 * The answer agent: a Vercel AI SDK tool-calling loop over the AE read
 * toolset, routed through the shared OpenRouter model gateway.
 *
 * The model is given `registry.search` / `registry.detail` as tools. The SDK
 * owns transport, tool-call encoding, and the multi-step loop; AE owns what
 * matters here: `runAnswerToolCall` validates every call against the action's
 * Zod schema and records it as evidence, and the tool budget is enforced in
 * the tool itself so an over-budget call is a recorded refusal rather than a
 * dropped one. After at most `MAX_ROUNDS` tool rounds the model returns
 * `AnswerProse` (oneLine / summary / whatToDoNow). The server assembles
 * `AnswerSource[]` and `allowedSlugs` from the tool results - never from the
 * model - and gates the prose against them.
 * The registry stays literal. Misspelling recovery happens only when the model
 * chooses better `registry.search` arguments; the chosen input is persisted as
 * tool evidence. No hidden query-rewrite preprocessor runs.
 */

const MAX_ROUNDS = 4
const DEFAULT_LIMIT = 3

export type AnswerToolUseAgentInput = {
  query: string
  /** OpenRouter gateway config; defaults to the environment-backed config. */
  config?: OpenRouterGatewayConfig
  model?: string
  signal?: AbortSignal
  /** Frozen prior-turn providers, for filter_known / compare_known intents. */
  priorProviders?: readonly AnswerSource[]
  /** Frozen prior-turn slugs, used as the gate allow-list for non-search intents. */
  priorAllowedSlugs?: readonly string[]
  followUpIntent?: FollowUpIntent
  searchContext?: AeSearchContext | undefined
  /** Optional live accounting sink for callers that own a harness collector. */
  onModelRequest?: (record: HarnessModelRequestRecord) => void
  /** Optional live harness loop that owns model/tool runtime events for this turn. */
  harnessLoop?: HarnessRunLoop
  /**
   * When true, the agent requests prose directly without exposing registry
   * tools. Used for filter_known / compare_known intents, which must reuse
   * frozen prior evidence and never start a fresh catalog search.
   */
  disableTools?: boolean
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

export async function runAnswerToolUseAgent(
  input: AnswerToolUseAgentInput,
): Promise<AnswerToolUseAgentResult> {
  const config = input.config ?? openRouterGatewayConfig()
  if (config.apiKey === undefined) {
    throw new AnswerToolUseAgentError('unavailable')
  }

  return runRealToolUseAgent(input, config)
}

function buildAgentResult(
  input: AnswerToolUseAgentInput,
  prose: AnswerProse,
  toolCalls: readonly AnswerToolCallRecord[],
  providers: readonly AnswerSource[],
  timings: readonly AnswerTurnTimingEntry[] = [],
  modelRequests: readonly HarnessModelRequestRecord[] = [],
): AnswerToolUseAgentResult {
  const toolAllowedSlugs = collectAllowedSlugsFromToolResults(
    toolCallRecordsToGateInput(toolCalls),
  )
  const priorAllowed = new Set(input.priorAllowedSlugs ?? [])
  const allowedSlugs = new Set<string>([...toolAllowedSlugs, ...priorAllowed])

  const agentQueryFromTools = resolveAgentQuery(toolCalls, input.query)
  const locationFiltered = filterProvidersForRequestedLocation({
    providers,
    userQuery: input.query,
    toolQuery: agentQueryFromTools,
    searchContext: input.searchContext,
  })

  // For non-search intents the providers come from frozen prior evidence.
  const finalProviders: readonly AnswerSource[] =
    providers.length > 0 ? (locationFiltered?.providers ?? providers) : (input.priorProviders ?? [])

  const mapped = snapshotProseFromAnswer(prose)
  const snapshotProse =
    locationFiltered.filtered === true || (locationFiltered.location !== undefined && finalProviders.length === 0)
      ? buildLocationScopedProse({
          query: input.query,
          location: locationFiltered.location,
          providers: finalProviders,
        })
      : mapped
  // The agent JSON URL points at the search that actually grounded the answer.
  // When the model chose a corrected `registry.search` argument (e.g.
  // "parramatta" for a misspelled "paramata"), the URL reflects that chosen
  // query while the frozen snapshot query stays honest to what the person typed.
  const agentQuery =
    locationFiltered.locationSource === 'context'
      ? buildAgentJsonQueryForSearchContext(input.query, input.searchContext)
      : locationFiltered.filtered === true && locationFiltered.locationSource === 'user'
      ? input.query
      : agentQueryFromTools
  const snapshot: AnswerSnapshot = {
    query: input.query,
    oneLine: snapshotProse.oneLine,
    providers: finalProviders,
    summary: snapshotProse.summary,
    nextStep: snapshotProse.nextStep,
    agentJsonUrl: buildAgentJsonUrl(
      agentQuery,
      DEFAULT_LIMIT,
      resolveAgentJsonScope(toolCalls, input.searchContext),
    ),
  }

  const gate = runAnswerGate({ snapshot, allowedSlugs })
  const effectiveProse: AnswerProse =
    snapshotProse === mapped
      ? prose
      : {
          oneLine: snapshotProse.oneLine,
          summary: snapshotProse.summary,
          whatToDoNow: snapshotProse.nextStep,
        }
  return {
    prose: effectiveProse,
    providers: finalProviders,
    allowedSlugs,
    toolCalls: [...toolCalls],
    modelRequests: [...modelRequests],
    timings: [...timings],
    snapshot,
    gate,
  }
}

async function runRealToolUseAgent(
  input: AnswerToolUseAgentInput,
  config: OpenRouterGatewayConfig,
): Promise<AnswerToolUseAgentResult> {
  const modelId = input.model ?? config.model
  const toolCalls: AnswerToolCallRecord[] = []
  const timings: AnswerTurnTimingEntry[] = []
  const modelRequests: HarnessModelRequestRecord[] = []
  const providers: AnswerSource[] = []
  const slugSeen = new Set<string>()
  const maxToolCalls = normalizeMaxToolCalls(input.maxToolCalls)
  let toolCallAttempts = 0
  let toolSeq = 0
  let toolBudgetExhausted = false

  // The SDK dispatches an assistant message's tool calls concurrently. AE's
  // budget, evidence order, and `seq` are all positional, so calls are drained
  // one at a time in the order the model emitted them.
  let toolQueue: Promise<void> = Promise.resolve()
  const runToolCall = (toolId: string, rawInput: unknown, toolCallId: string): Promise<string> => {
    const run = toolQueue.then(async () => {
      const callInput = {
        toolId,
        input: applySearchContextToRegistrySearchInput(input, toolId, rawInput),
        turnId: 'pending',
        seq: toolSeq,
        ...(input.harnessLoop === undefined ? {} : { harnessLoop: input.harnessLoop }),
      }
      const result = toolCallAttempts >= maxToolCalls
        ? refuseAnswerToolCall(callInput, 'budget_exceeded', toolCallId)
        : await runAnswerToolCall(callInput)
      toolCallAttempts += 1
      toolBudgetExhausted = toolCallAttempts >= maxToolCalls
      toolCalls.push(result.record)
      appendTimings(timings, result.timings, {
        phase: 'agent_tool',
        toolId: result.record.toolId,
        toolSeq: result.record.seq,
      })
      appendProvidersFromToolResult(providers, slugSeen, result.providers)
      toolSeq += 1
      return safeToolResultJsonForPrompt(result.resultJson)
    })
    toolQueue = run.then(() => undefined, () => undefined)
    return run
  }

  const tools = buildAnswerAgentTools(runToolCall)

  const recordStep = (timingName: string, extraMetadata: Record<string, string | number | boolean | null>) =>
    (step: StepResult<ToolSet>): void => {
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
        endedAt: step.response.timestamp.getTime() + step.performance.responseTimeMs,
        durationMs: step.performance.responseTimeMs,
        stopReason: step.rawFinishReason ?? step.finishReason,
        ...(step.response.id === undefined ? {} : { responseId: step.response.id }),
        ...(usage === undefined ? {} : { usage }),
        ...(costUsd === undefined ? { costUnavailableReason: 'price_table_missing' } : { costUsd }),
      })
      timings.push(timingEntry(timingName, step.performance.responseTimeMs, {
        ...extraMetadata,
        provider: 'openrouter',
        model: resolvedModel,
      }))
    }

  const userPrompt = buildToolUseAgentUserPrompt({
    query: input.query,
    ...(input.priorProviders === undefined ? {} : { priorProviders: input.priorProviders }),
    ...(input.followUpIntent === undefined ? {} : { followUpIntent: input.followUpIntent }),
    ...(input.searchContext === undefined ? {} : { searchContext: input.searchContext }),
  })

  const proseOutput = Output.object({ schema: AnswerProseSchema, name: 'answer_prose' })

  /**
   * The prose request withholds the toolset entirely and pins a strict
   * `AnswerProse` schema, so the model cannot reach the catalogue again and
   * cannot answer in free text.
   */
  const requestProse = (
    prompt: string,
    timingName: string,
  ) => runGuardedModelCall(input, modelId, modelRequests, () => generateText({
    model: openRouterModel(config, modelId, { structuredOutputs: true }),
    instructions: buildToolUseAgentSystemPrompt(),
    prompt,
    output: proseOutput,
    temperature: 0.2,
    maxRetries: 0,
    onStepEnd: recordStep(timingName, { tools: 0 }),
    ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
  }))

  // filter_known / compare_known reuse frozen prior evidence, so the turn is a
  // single prose request that never exposes the catalogue toolset at all.
  if (input.disableTools === true) {
    const frozen = await requestProse(userPrompt, 'model.openrouter_round')
    if (frozen.toolCalls.length > 0) {
      throw new AnswerToolUseAgentError('tool_unavailable')
    }
    const frozenProse = frozen.output
    if (frozenProse === undefined) {
      throw new AnswerToolUseAgentError('prose_failed')
    }
    return buildAgentResult(input, frozenProse, toolCalls, providers, timings, modelRequests)
  }

  let finalStepRequested = false
  const stopAtMaxRounds = isStepCount(MAX_ROUNDS)
  const toolStopCondition = async ({ steps }: { steps: Array<StepResult<ToolSet>> }): Promise<boolean> => {
    const reachedStop = (await stopAtMaxRounds({ steps })) || toolBudgetExhausted
    if (!reachedStop) {
      return false
    }
    if (!finalStepRequested) {
      finalStepRequested = true
      return false
    }
    return true
  }
  const result = await runGuardedModelCall(input, modelId, modelRequests, () => generateText({
    model: openRouterModel(config, modelId, { structuredOutputs: true }),
    instructions: buildToolUseAgentSystemPrompt(),
    prompt: userPrompt,
    tools,
    output: proseOutput,
    temperature: 0.2,
    maxRetries: 0,
    prepareStep: () => (finalStepRequested ? { activeTools: [] } : undefined),
    // Defer the existing round/budget stop once so the same SDK call can make
    // one structured, tool-less prose step after the final tool result.
    stopWhen: [toolStopCondition],
    onStepEnd: recordStep('model.openrouter_round', { tools: Object.keys(tools).length }),
    ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
  }))
  if (toolBudgetExhausted) {
    updateLastModelTiming(timings, { toolBudgetExhausted: true, maxToolCalls })
  }

  const prose = result.output
  if (prose === undefined) {
    throw new AnswerToolUseAgentError('prose_failed')
  }
  return buildAgentResult(input, prose, toolCalls, providers, timings, modelRequests)
}


/**
 * The AE read toolset, projected onto AI SDK tools.
 *
 * Input validation deliberately always succeeds here: `runAnswerToolCall` is
 * the single validator, and it records a refusal or error as tool evidence
 * rather than throwing. Letting the SDK reject a malformed call would abort
 * the turn and lose that record.
 */
function buildAnswerAgentTools(
  runToolCall: (toolId: string, rawInput: unknown, toolCallId: string) => Promise<string>,
): ToolSet {
  const tools: Record<string, Tool> = {}
  const toolNames = new Set<string>()
  for (const action of listAnswerModelToolActions()) {
    const spec = actionToOpenRouterTool(action)
    const toolName = spec.function.name
    if (toolNames.has(toolName)) {
      throw new AnswerToolUseAgentError('tool_unavailable')
    }
    toolNames.add(toolName)
    tools[toolName] = tool({
      description: spec.function.description,
      inputSchema: jsonSchema<unknown>(
        {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(spec.function.parameters.properties).map(([name, property]) => [
              name,
              {
                type: property.type,
                description: property.description,
                ...(property.enum === undefined ? {} : { enum: [...property.enum] }),
              },
            ]),
          ),
          required: [...spec.function.parameters.required],
        },
        { validate: (value: unknown) => ({ success: true, value }) },
      ),
      execute: (rawInput: unknown, options: { toolCallId: string }) =>
        runToolCall(action.id, rawInput, options.toolCallId),
    })
  }
  return tools
}

/**
 * Runs one model interaction under the turn's harness guards and records a
 * failed request in the turn's model accounting when the interaction errors.
 */
async function runGuardedModelCall<T>(
  input: AnswerToolUseAgentInput,
  modelId: string,
  modelRequests: HarnessModelRequestRecord[],
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now()
  const seq = modelRequests.length
  try {
    return input.harnessLoop === undefined
      ? await work()
      : await input.harnessLoop.runModel<T>({ seq, provider: 'openrouter', model: modelId }, work)
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const agentError = toAgentError(error)
    recordModelRequest(input, modelRequests, {
      seq,
      provider: 'openrouter',
      model: modelId,
      status: 'error',
      startedAt,
      endedAt: startedAt + durationMs,
      durationMs,
      errorCode: agentError.code,
      costUnavailableReason: 'request_failed',
    })
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

function harnessUsage(usage: LanguageModelUsage): HarnessModelUsage | undefined {
  const mapped: HarnessModelUsage = {
    ...(usage.inputTokens === undefined ? {} : { inputTokens: usage.inputTokens }),
    ...(usage.outputTokens === undefined ? {} : { outputTokens: usage.outputTokens }),
    ...(usage.inputTokenDetails.cacheReadTokens === undefined
      ? {}
      : { cachedInputTokens: usage.inputTokenDetails.cacheReadTokens }),
    ...(usage.inputTokenDetails.cacheWriteTokens === undefined
      ? {}
      : { cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens }),
    ...(usage.outputTokenDetails.reasoningTokens === undefined
      ? {}
      : { reasoningOutputTokens: usage.outputTokenDetails.reasoningTokens }),
    ...(usage.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens }),
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

function updateLastModelStopReason(
  modelRequests: HarnessModelRequestRecord[],
  stopReason: string,
): void {
  const last = modelRequests.at(-1)
  if (last === undefined || last.stopReason !== undefined) {
    return
  }
  last.stopReason = stopReason
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

function timingEntry(
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

function buildLocationScopedProse(input: {
  query: string
  location: string | undefined
  providers: readonly AnswerSource[]
}): { oneLine: string; summary: string; nextStep: string } {
  const location = input.location?.trim()
  const place = location === undefined || location.length === 0 ? 'that place' : location
  const count = input.providers.length

  if (count === 0) {
    return {
      oneLine: `No listed businesses match "${input.query}" yet.`,
      summary: `No listed businesses publish coverage for ${place} yet.`,
      nextStep: 'Try a nearby suburb, browse services, or list a business that should appear here.',
    }
  }

  return {
    oneLine: count === 1 ? `1 listed business matches ${place}.` : `${count} listed businesses match ${place}.`,
    summary:
      count === 1
        ? `This listing publishes service coverage for ${place}. The business handles timing, price, and availability.`
        : `These listings publish service coverage for ${place}. The business handles timing, price, and availability.`,
    nextStep: 'Open a listed business page and send an inquiry when that option is published.',
  }
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


function resolveAgentQuery(
  toolCalls: readonly AnswerToolCallRecord[],
  fallback: string,
): string {
  for (const call of toolCalls) {
    if (call.toolId !== 'registry.search') {
      continue
    }
    try {
      const input = JSON.parse(call.inputJson) as { query?: unknown }
      if (typeof input.query === 'string' && input.query.trim().length > 0) {
        return input.query.trim()
      }
    } catch {
      // Fall through to the next call or the fallback.
    }
  }
  return fallback
}

function resolveAgentJsonScope(
  toolCalls: readonly AnswerToolCallRecord[],
  searchContext: AeSearchContext | undefined,
): { mode?: 'near_me' | 'whole_catalogue'; location?: string } | undefined {
  for (const call of toolCalls) {
    if (call.toolId !== 'registry.search') {
      continue
    }
    try {
      const input = JSON.parse(call.inputJson) as {
        mode?: unknown
        location?: unknown
      }
      const mode =
        input.mode === 'near_me' || input.mode === 'whole_catalogue'
          ? input.mode
          : undefined
      const location =
        typeof input.location === 'string' && input.location.trim().length > 0
          ? input.location.trim()
          : undefined
      if (mode !== undefined || location !== undefined) {
        return {
          ...(mode === undefined ? {} : { mode }),
          ...(location === undefined ? {} : { location }),
        }
      }
    } catch {
      // Fall through to the active search context.
    }
  }

  if (searchContext?.mode === 'whole_catalogue') {
    return { mode: 'whole_catalogue' }
  }

  const location = aeSearchContextLocationQuery(searchContext)
  return location === undefined ? undefined : { mode: 'near_me', location }
}

function applySearchContextToRegistrySearchInput(
  input: AnswerToolUseAgentInput,
  toolId: string,
  raw: unknown,
): unknown {
  if (toolId !== 'registry.search' || typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw
  }

  const record = { ...(raw as Record<string, unknown>) }
  record.limit = normalizeRegistrySearchLimit(record.limit, input.maxRegistrySearchLimit)
  const query = typeof record.query === 'string' ? record.query : input.query
  const userNamedLocation = extractRequestedLocation(input.query)
  const toolNamedLocation = extractRequestedLocation(query)

  if (record.mode === undefined && input.searchContext?.mode === 'whole_catalogue') {
    record.mode = 'whole_catalogue'
    return record
  }

  const contextLocation = aeSearchContextLocationQuery(input.searchContext)
  if (
    contextLocation !== undefined &&
    userNamedLocation === undefined &&
    toolNamedLocation === undefined
  ) {
    record.mode = record.mode ?? 'near_me'
    record.location = typeof record.location === 'string' && record.location.trim().length > 0
      ? record.location
      : contextLocation
  }

  return record
}

function normalizeMaxToolCalls(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1
  }
  return Math.max(0, Math.floor(value))
}

function normalizeRegistrySearchLimit(value: unknown, maxLimit: number | undefined): number {
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

function safeToolResultJsonForPrompt(resultJson: string): string {
  try {
    return JSON.stringify(
      JSON.parse(resultJson),
      (_key, value) => typeof value === 'string' ? sanitizePromptString(value) : value,
    ) ?? sanitizePromptString(resultJson)
  } catch {
    return sanitizePromptString(resultJson)
  }
}

function sanitizePromptString(value: string): string {
  return value
    .replace(/<\s*\/?\s*(?:catalog_data|system|assistant|user|tool)\b/gi, '[data-tag]')
    .replace(/[<>]/g, (character) => character === '<' ? '‹' : '›')
}

function buildAgentJsonQueryForSearchContext(
  query: string,
  searchContext: AeSearchContext | undefined,
): string {
  if (extractRequestedLocation(query) !== undefined) {
    return query
  }

  const location = aeSearchContextLocationQuery(searchContext)
  if (location === undefined) {
    return query
  }

  return `${query} near ${location}`
}

export class AnswerToolUseAgentError extends Error {
  readonly code: string
  constructor(code: string, options?: ErrorOptions) {
    super(`answer_tool_use_${code}`, options)
    this.name = 'AnswerToolUseAgentError'
    this.code = code
  }
}

export function isAnswerToolUseAgentError(error: unknown): error is AnswerToolUseAgentError {
  return error instanceof AnswerToolUseAgentError
}

