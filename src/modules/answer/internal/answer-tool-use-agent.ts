import { z } from 'zod'

import type { AnyAction } from '@/modules/actions'
import type { AnswerLlmConfig } from './llm-config'
import { readAnswerLlmConfig } from './llm-config'
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
  type OfferingAnswerSource,
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
 * The Phase 7 answer agent: an OpenRouter tool-calling loop over the AE read
 * toolset. This is the first tool-calling integration in the repo.
 *
 * The model is given `registry.search` / `registry.detail` as tools. It emits
 * `tool_calls`; the server validates each call against the action's Zod schema,
 * runs it through `runAnswerToolCall` (which records the evidence), and feeds
 * the public-catalog result back as a `tool`-role message. After at most
 * `MAX_ROUNDS` rounds the model returns `AnswerProse` (oneLine / summary /
 * whatToDoNow). The server assembles `AnswerSource[]` and `allowedSlugs` from
 * the tool results - never from the model - and gates the prose against them.
 *
 * The registry stays literal. Misspelling recovery happens only when the model
 * chooses better `registry.search` arguments; the chosen input is persisted as
 * tool evidence. No hidden query-rewrite preprocessor runs.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MAX_ROUNDS = 4
const DEFAULT_LIMIT = 3
const DEFAULT_MODEL_REQUEST_TIMEOUT_MS = 15_000
const ANSWER_PROSE_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'answer_prose',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        oneLine: {
          type: 'string',
          description: 'Short answer headline grounded only in supplied catalog facts.',
        },
        summary: {
          type: 'string',
          description: 'Concise explanation that stays inside Agentic Economy boundaries.',
        },
        whatToDoNow: {
          type: 'string',
          description: 'Bounded next action. Never imply booking, payment, dispatch, or live availability.',
        },
      },
      required: ['oneLine', 'summary', 'whatToDoNow'],
    },
  },
} as const

export type AnswerToolUseAgentInput = {
  query: string
  /** OpenRouter config; required when env-backed config is unavailable. */
  config?: AnswerLlmConfig
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
  /** Internal/test override for the per-request model deadline. */
  modelRequestTimeoutMs?: number
}

export type AnswerToolUseAgentResult = {
  prose: AnswerProse
  providers: readonly AnswerSource[]
  offeringSources: readonly OfferingAnswerSource[]
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
  const config = input.config ?? readAnswerLlmConfig()
  if (config === undefined) {
    throw new AnswerToolUseAgentError('unavailable')
  }

  return runRealToolUseAgent(input, config)
}

function buildAgentResult(
  input: AnswerToolUseAgentInput,
  prose: AnswerProse,
  toolCalls: readonly AnswerToolCallRecord[],
  providers: readonly AnswerSource[],
  offeringSources: readonly OfferingAnswerSource[],
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
    offeringSources.length === 0
      && (locationFiltered.filtered === true || (locationFiltered.location !== undefined && finalProviders.length === 0))
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
    ...(offeringSources.length === 0 ? {} : { offeringSources }),
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
    offeringSources,
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
  config: AnswerLlmConfig,
): Promise<AnswerToolUseAgentResult> {
  const readTools = input.disableTools ? [] : listAnswerModelToolActions()
  const tools = readTools.map(actionToOpenRouterTool)

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: buildToolUseAgentSystemPrompt() },
    {
      role: 'user',
      content: buildToolUseAgentUserPrompt({
        query: input.query,
        ...(input.priorProviders === undefined ? {} : { priorProviders: input.priorProviders }),
        ...(input.followUpIntent === undefined ? {} : { followUpIntent: input.followUpIntent }),
        ...(input.searchContext === undefined ? {} : { searchContext: input.searchContext }),
      }),
    },
  ]

  const toolCalls: AnswerToolCallRecord[] = []
  const timings: AnswerTurnTimingEntry[] = []
  const modelRequests: HarnessModelRequestRecord[] = []
  const providers: AnswerSource[] = []
  const slugSeen = new Set<string>()
  const offeringSources: OfferingAnswerSource[] = []
  const offeringSlugSeen = new Set<string>()
  const maxToolCalls = normalizeMaxToolCalls(input.maxToolCalls)
  let toolCallAttempts = 0
  let seq = 0
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const payload = await runOpenRouterModelRequest({
      input,
      config,
      modelRequests,
      timings,
      timingName: 'model.openrouter_round',
      timingMetadata: {
        round,
        tools: tools.length,
      },
      tools,
      messages,
    })
    const assistantToolCalls = payload.choices?.[0]?.message?.tool_calls ?? []
    updateLastModelStopReason(modelRequests, assistantToolCalls.length > 0 ? 'tool_calls' : 'stop')
    updateLastModelTiming(timings, {
      round,
      tools: tools.length,
    })

    const assistantMessage = payload.choices?.[0]?.message
    if (assistantMessage === undefined) {
      throw new AnswerToolUseAgentError('no_response')
    }

    if (input.disableTools === true && assistantToolCalls.length > 0) {
      throw new AnswerToolUseAgentError('tool_unavailable')
    }
    if (assistantToolCalls.length === 0) {
      const prose = parseProse(assistantMessage.content)
      if (prose === undefined) {
        throw new AnswerToolUseAgentError('prose_failed')
      }
      return buildAgentResult(input, prose, toolCalls, providers, offeringSources, timings, modelRequests)
    }

    messages.push({ role: 'assistant', content: assistantMessage.content ?? '', tool_calls: assistantToolCalls })

    for (const call of assistantToolCalls) {
      const toolId = call.function?.name ?? ''
      const parsedInput = applySearchContextToRegistrySearchInput(
        input,
        toolId,
        parseToolInput(call.function?.arguments),
      )
      const toolInput = {
        toolId,
        input: parsedInput,
        turnId: 'pending',
        seq,
        ...(input.harnessLoop === undefined ? {} : { harnessLoop: input.harnessLoop }),
      }
      const result = toolCallAttempts >= maxToolCalls
        ? refuseAnswerToolCall(toolInput, 'budget_exceeded', call.id)
        : await runAnswerToolCall(toolInput)
      toolCallAttempts += 1
      toolCalls.push(result.record)
      appendTimings(timings, result.timings, {
        phase: 'agent_tool',
        toolId: result.record.toolId,
        toolSeq: result.record.seq,
      })
      appendProvidersFromToolResult(providers, slugSeen, result.providers)
      appendOfferingSourcesFromToolResult(offeringSources, offeringSlugSeen, result.offeringSources)
      seq += 1
      messages.push({
        role: 'tool',
        tool_call_id: call.id ?? result.record.toolCallId,
        content: safeToolResultJsonForPrompt(result.resultJson),
      })
    }
    if (toolCallAttempts >= maxToolCalls) {
      updateLastModelTiming(timings, { toolBudgetExhausted: true, maxToolCalls })
      break
    }
  }

  // Exhausted rounds: request a final prose-only completion.
  let finalPayload: OpenRouterResponse
  try {
    finalPayload = await runOpenRouterModelRequest({
      input,
      config,
      modelRequests,
      timings,
      timingName: 'model.openrouter_final_prose',
      timingMetadata: {
        tools: 0,
      },
      tools: [],
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Stop calling tools. Return AnswerProse JSON now: {"oneLine","summary","whatToDoNow"}.',
        },
      ],
    })
  } catch (error) {
    if (toolCalls.length === 0) {
      throw error
    }
    return buildAgentResult(
      input,
      buildGroundedToolFallbackProse(input.query, providers, offeringSources),
      toolCalls,
      providers,
      offeringSources,
      timings,
      modelRequests,
    )
  }
  updateLastModelStopReason(modelRequests, 'final_prose')
  const prose = parseProse(finalPayload.choices?.[0]?.message?.content)
  if (prose === undefined) {
    throw new AnswerToolUseAgentError('prose_failed')
  }
  return buildAgentResult(input, prose, toolCalls, providers, offeringSources, timings, modelRequests)
}

async function runOpenRouterModelRequest(input: {
  input: AnswerToolUseAgentInput
  config: AnswerLlmConfig
  modelRequests: HarnessModelRequestRecord[]
  timings: AnswerTurnTimingEntry[]
  timingName: string
  timingMetadata: Record<string, string | number | boolean | null>
  tools: readonly ReturnType<typeof actionToOpenRouterTool>[]
  messages: readonly OpenRouterMessage[]
}): Promise<OpenRouterResponse> {
  const startedAt = Date.now()
  const model = input.input.model ?? input.config.model
  const seq = input.modelRequests.length

  try {
    const request = () => postChatCompletion({
      config: input.config,
      model,
      tools: input.tools,
      messages: input.messages,
      timeoutMs: input.input.modelRequestTimeoutMs ?? DEFAULT_MODEL_REQUEST_TIMEOUT_MS,
      ...(input.input.signal === undefined ? {} : { signal: input.input.signal }),
    })
    const payload = input.input.harnessLoop === undefined
      ? await request()
      : await input.input.harnessLoop.runModel<OpenRouterResponse>({
          seq,
          provider: 'openrouter',
          model,
          summarize: (response) => {
            const usage = usageFromOpenRouterResponse(response)
            const stopReason = response.choices?.[0]?.finish_reason
            return {
              seq,
              ...(stopReason === undefined ? {} : { stopReason }),
              ...(response.id === undefined ? {} : { responseId: response.id }),
              ...(usage === undefined ? {} : { usage }),
              ...costAccountingFromOpenRouterResponse(response),
            }
          },
          summarizeError: (error) => ({
            seq,
            costUnavailableReason: 'request_failed',
            ...(isAnswerToolUseAgentError(error) ? { stopReason: error.code } : {}),
          }),
        }, request)
    const durationMs = Date.now() - startedAt
    const usage = usageFromOpenRouterResponse(payload)
    recordModelRequest(input.input, input.modelRequests, {
      seq,
      provider: 'openrouter',
      model: payload.model ?? model,
      status: 'ok',
      startedAt,
      endedAt: startedAt + durationMs,
      durationMs,
      ...(payload.choices?.[0]?.finish_reason === undefined ? {} : { stopReason: payload.choices[0].finish_reason }),
      ...(payload.id === undefined ? {} : { responseId: payload.id }),
      ...(usage === undefined ? {} : { usage }),
      ...costAccountingFromOpenRouterResponse(payload),
    })
    input.timings.push(timingEntry(input.timingName, durationMs, {
      ...input.timingMetadata,
      provider: 'openrouter',
      model: payload.model ?? model,
    }))
    return payload
  } catch (error) {
    const durationMs = Date.now() - startedAt
    recordModelRequest(input.input, input.modelRequests, {
      seq,
      provider: 'openrouter',
      model,
      status: 'error',
      startedAt,
      endedAt: startedAt + durationMs,
      durationMs,
      errorCode: isAnswerToolUseAgentError(error) ? error.code : 'request_failed',
      costUnavailableReason: 'request_failed',
    })
    throw error
  }
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
    durationMs: Math.max(0, Math.round(durationMs * 100) / 100),
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

function buildGroundedToolFallbackProse(
  query: string,
  providers: readonly AnswerSource[],
  offeringSources: readonly OfferingAnswerSource[],
): AnswerProse {
  const names = offeringSources.length > 0
    ? offeringSources.map((source) => source.business.name)
    : providers.map((provider) => provider.name)
  const uniqueNames = [...new Set(names)]
  const count = uniqueNames.length

  if (count === 0) {
    return {
      oneLine: `I couldn't find a listed match for "${query}" yet.`,
      summary: 'The live catalogue search returned no published options for this need.',
      whatToDoNow: 'Browse registered supply or try a broader description, nearby place, or different priority.',
    }
  }

  return {
    oneLine: count === 1 ? 'I found 1 published option to inspect.' : `I found ${count} published options to inspect.`,
    summary: count === 1
      ? 'The live catalogue returned one published option relevant to this search. Agentic Economy does not book or take payment from this answer.'
      : `The live catalogue returned ${count} published options relevant to this search. Agentic Economy does not book or take payment from this answer.`,
    whatToDoNow: 'Review the published details and compare the facts that matter most to you.',
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

function appendOfferingSourcesFromToolResult(
  sources: OfferingAnswerSource[],
  slugSeen: Set<string>,
  toolSources: readonly OfferingAnswerSource[],
): void {
  for (const source of toolSources) {
    if (slugSeen.has(source.business.slug)) {
      continue
    }
    slugSeen.add(source.business.slug)
    sources.push({ ...source, citationIndex: sources.length + 1 })
  }
}

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: readonly OpenRouterToolCall[]
  tool_call_id?: string
}

type OpenRouterToolCall = {
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

type OpenRouterChoice = {
  finish_reason?: string
  message?: {
    content?: string
    tool_calls?: readonly OpenRouterToolCall[]
  }
}

type OpenRouterResponse = {
  id?: string
  model?: string
  choices?: readonly OpenRouterChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
    prompt_tokens_details?: {
      cached_tokens?: number
    }
    completion_tokens_details?: {
      reasoning_tokens?: number
    }
  }
}

async function postChatCompletion(input: {
  config: AnswerLlmConfig
  model?: string
  tools: readonly ReturnType<typeof actionToOpenRouterTool>[]
  messages: readonly OpenRouterMessage[]
  timeoutMs: number
  signal?: AbortSignal
}): Promise<OpenRouterResponse> {
  const timeoutSignal = AbortSignal.timeout(Math.max(1, Math.round(input.timeoutMs)))
  const signal = input.signal === undefined
    ? timeoutSignal
    : AbortSignal.any([input.signal, timeoutSignal])
  const response = await fetch(`${input.config.apiBaseUrl ?? OPENROUTER_URL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.AE_SITE_URL ?? process.env.SITE_URL ?? 'http://127.0.0.1:3000',
      'X-Title': 'Agentic Economy',
    },
    body: JSON.stringify({
      model: input.model ?? input.config.model,
      messages: input.messages,
      ...(input.tools.length === 0
        ? { tool_choice: 'none', response_format: ANSWER_PROSE_RESPONSE_FORMAT }
        : { tools: input.tools, tool_choice: 'auto', parallel_tool_calls: false }),
      temperature: 0.2,
    }),
    signal,
  })

  if (!response.ok) {
    throw new AnswerToolUseAgentError('request_failed')
  }
  return (await response.json()) as OpenRouterResponse
}

function usageFromOpenRouterResponse(payload: OpenRouterResponse): HarnessModelUsage | undefined {
  const usage = payload.usage
  if (usage === undefined) {
    return undefined
  }
  return {
    ...(usage.prompt_tokens === undefined ? {} : { inputTokens: usage.prompt_tokens }),
    ...(usage.completion_tokens === undefined ? {} : { outputTokens: usage.completion_tokens }),
    ...(usage.prompt_tokens_details?.cached_tokens === undefined ? {} : { cachedInputTokens: usage.prompt_tokens_details.cached_tokens }),
    ...(usage.completion_tokens_details?.reasoning_tokens === undefined ? {} : { reasoningOutputTokens: usage.completion_tokens_details.reasoning_tokens }),
    ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
  }
}

function costAccountingFromOpenRouterResponse(payload: OpenRouterResponse): Pick<
  HarnessModelRequestRecord,
  'costUsd' | 'costUnavailableReason'
> {
  const cost = payload.usage?.cost
  if (typeof cost === 'number' && Number.isFinite(cost)) {
    return { costUsd: cost }
  }
  return { costUnavailableReason: 'price_table_missing' }
}

function parseProse(content: string | undefined): AnswerProse | undefined {
  if (content === undefined || content.trim().length === 0) {
    return undefined
  }
  try {
    const parsed = AnswerProseSchema.safeParse(JSON.parse(extractJsonObject(content)))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

function parseToolInput(argumentsJson: string | undefined): unknown {
  if (argumentsJson === undefined || argumentsJson.length === 0) {
    return {}
  }
  try {
    return JSON.parse(argumentsJson)
  } catch {
    return {}
  }
}

function extractJsonObject(content: string): string {
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return content
  }
  return content.slice(start, end + 1)
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
    return JSON.stringify(sanitizePromptValue(JSON.parse(resultJson)))
  } catch {
    return sanitizePromptString(resultJson)
  }
}

function sanitizePromptValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return sanitizePromptString(value)
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizePromptValue(entry))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizePromptValue(entry)]),
    )
  }
  return value
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
  constructor(code: string) {
    super(`answer_tool_use_${code}`)
    this.name = 'AnswerToolUseAgentError'
    this.code = code
  }
}

export function isAnswerToolUseAgentError(error: unknown): error is AnswerToolUseAgentError {
  return error instanceof AnswerToolUseAgentError
}

// Re-export so callers can build a Zod-validated plan if needed.
export { z }
