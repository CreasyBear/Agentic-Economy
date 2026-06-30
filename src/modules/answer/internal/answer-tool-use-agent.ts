import { z } from 'zod'

import { findAction, type AnyAction } from '@/modules/actions'
import type { AnswerLlmConfig } from './llm-config'
import { readAnswerLlmConfig } from './llm-config'
import { runAnswerGate, type AnswerGateResult } from './answer-gate'
import { collectAllowedSlugsFromToolResults } from './catalog-grounding'
import { actionToOpenRouterTool } from './action-to-tool-spec'
import { buildToolUseAgentSystemPrompt, buildToolUseAgentUserPrompt } from './answer-llm-prompts'
import { AnswerProseSchema, snapshotProseFromAnswer, type AnswerProse } from '../answer-prose'
import {
  buildAgentJsonUrl,
  type AnswerSource,
  type AnswerSnapshot,
} from '../answer-synthesizer'
import {
  runAnswerToolCall,
  toolCallRecordsToGateInput,
} from '@/modules/answer-thread/public'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/answer-thread.schema'
import type { FollowUpIntent } from '@/modules/answer-thread/answer-thread.schema'

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
const DEFAULT_LIMIT = 10
const ANSWER_MODEL_TOOL_IDS = ['registry.search', 'registry.detail'] as const

export type AnswerToolUseAgentInput = {
  query: string
  /** OpenRouter config; required for the real loop, ignored by the test seam. */
  config?: AnswerLlmConfig
  model?: string
  signal?: AbortSignal
  /** Frozen prior-turn providers, for filter_known / compare_known intents. */
  priorProviders?: readonly AnswerSource[]
  /** Frozen prior-turn slugs, used as the gate allow-list for non-search intents. */
  priorAllowedSlugs?: readonly string[]
  followUpIntent?: FollowUpIntent
  /**
   * When true, the agent requests prose directly without exposing registry
   * tools. Used for filter_known / compare_known intents, which must reuse
   * frozen prior evidence and never start a fresh catalog search.
   */
  disableTools?: boolean
}

export type AgentPlannedToolCall = {
  toolId: string
  input: unknown
}

export type AnswerToolUseAgentPlan = {
  toolCalls: readonly AgentPlannedToolCall[]
  prose: AnswerProse
}

/**
 * Test seam: fakes the model's tool-argument choice and final prose. The
 * runner still executes the planned tool calls against the real registry
 * (via `runAnswerToolCall`) and runs the real gate, so tests prove that a
 * chosen `registry.search` input recovers a misspelled query and that an
 * ungrounded prose slug is rejected.
 */
export type AnswerToolUseAgentGenerator = (input: {
  query: string
  priorProviders?: readonly AnswerSource[]
  followUpIntent?: FollowUpIntent
}) => Promise<AnswerToolUseAgentPlan>

export type AnswerToolUseAgentResult = {
  prose: AnswerProse
  providers: readonly AnswerSource[]
  allowedSlugs: ReadonlySet<string>
  toolCalls: AnswerToolCallRecord[]
  snapshot: AnswerSnapshot
  gate: AnswerGateResult
}

let testGenerator: AnswerToolUseAgentGenerator | undefined

export function setAnswerToolUseAgentForTests(
  generator: AnswerToolUseAgentGenerator | undefined,
): () => void {
  const previous = testGenerator
  testGenerator = generator
  return () => {
    testGenerator = previous
  }
}

export async function runAnswerToolUseAgent(
  input: AnswerToolUseAgentInput,
): Promise<AnswerToolUseAgentResult> {
  if (testGenerator !== undefined) {
    return runPlannedAgent(input, await testGenerator(input))
  }

  const config = input.config ?? readAnswerLlmConfig()
  if (config === undefined) {
    throw new AnswerToolUseAgentError('unavailable')
  }

  return runRealToolUseAgent(input, config)
}

async function runPlannedAgent(
  input: AnswerToolUseAgentInput,
  plan: AnswerToolUseAgentPlan,
): Promise<AnswerToolUseAgentResult> {
  const toolCalls: AnswerToolCallRecord[] = []
  const providers: AnswerSource[] = []
  const slugSeen = new Set<string>()
  let seq = 0

  for (const planned of plan.toolCalls) {
    const result = await runAnswerToolCall({
      toolId: planned.toolId,
      input: planned.input,
      turnId: 'pending',
      seq,
    })
    toolCalls.push(result.record)
    seq += 1
    appendProvidersFromToolResult(providers, slugSeen, result.providers)
  }

  return buildAgentResult(input, plan.prose, toolCalls, providers)
}

function buildAgentResult(
  input: AnswerToolUseAgentInput,
  prose: AnswerProse,
  toolCalls: readonly AnswerToolCallRecord[],
  providers: readonly AnswerSource[],
): AnswerToolUseAgentResult {
  const toolAllowedSlugs = collectAllowedSlugsFromToolResults(
    toolCallRecordsToGateInput(toolCalls),
  )
  const priorAllowed = new Set(input.priorAllowedSlugs ?? [])
  const allowedSlugs = new Set<string>([...toolAllowedSlugs, ...priorAllowed])

  // For non-search intents the providers come from frozen prior evidence.
  const finalProviders: readonly AnswerSource[] =
    providers.length > 0 ? providers : (input.priorProviders ?? [])

  const mapped = snapshotProseFromAnswer(prose)
  // The agent JSON URL points at the search that actually grounded the answer.
  // When the model chose a corrected `registry.search` argument (e.g.
  // "parramatta" for a misspelled "paramata"), the URL reflects that chosen
  // query while the frozen snapshot query stays honest to what the person typed.
  const agentQuery = resolveAgentQuery(toolCalls, input.query)
  const snapshot: AnswerSnapshot = {
    query: input.query,
    oneLine: mapped.oneLine,
    providers: finalProviders,
    summary: mapped.summary,
    nextStep: mapped.nextStep,
    agentJsonUrl: buildAgentJsonUrl(agentQuery, DEFAULT_LIMIT),
  }

  const gate = runAnswerGate({ snapshot, allowedSlugs })
  return {
    prose,
    providers: finalProviders,
    allowedSlugs,
    toolCalls: [...toolCalls],
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
      }),
    },
  ]

  const toolCalls: AnswerToolCallRecord[] = []
  const providers: AnswerSource[] = []
  const slugSeen = new Set<string>()
  let seq = 0

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const payload = await postChatCompletion({
      config,
      ...(input.model === undefined ? {} : { model: input.model }),
      tools,
      messages,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    const assistantMessage = payload.choices?.[0]?.message
    if (assistantMessage === undefined) {
      throw new AnswerToolUseAgentError('no_response')
    }

    const assistantToolCalls = assistantMessage.tool_calls ?? []
    if (input.disableTools === true && assistantToolCalls.length > 0) {
      throw new AnswerToolUseAgentError('tool_unavailable')
    }
    if (assistantToolCalls.length === 0) {
      const prose = parseProse(assistantMessage.content)
      if (prose === undefined) {
        throw new AnswerToolUseAgentError('prose_failed')
      }
      return buildAgentResult(input, prose, toolCalls, providers)
    }

    messages.push({ role: 'assistant', content: assistantMessage.content ?? '', tool_calls: assistantToolCalls })

    for (const call of assistantToolCalls) {
      const toolId = call.function?.name ?? ''
      const parsedInput = parseToolInput(call.function?.arguments)
      const result = await runAnswerToolCall({
        toolId,
        input: parsedInput,
        turnId: 'pending',
        seq,
      })
      toolCalls.push(result.record)
      appendProvidersFromToolResult(providers, slugSeen, result.providers)
      seq += 1
      messages.push({
        role: 'tool',
        tool_call_id: call.id ?? result.record.toolCallId,
        content: result.resultJson,
      })
    }
  }

  // Exhausted rounds: request a final prose-only completion.
  const finalPayload = await postChatCompletion({
    config,
    ...(input.model === undefined ? {} : { model: input.model }),
    tools: [],
    messages: [
      ...messages,
      {
        role: 'user',
        content:
          'Stop calling tools. Return AnswerProse JSON now: {"oneLine","summary","whatToDoNow"}.',
      },
    ],
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })
  const prose = parseProse(finalPayload.choices?.[0]?.message?.content)
  if (prose === undefined) {
    throw new AnswerToolUseAgentError('prose_failed')
  }
  return buildAgentResult(input, prose, toolCalls, providers)
}

function listAnswerModelToolActions(): AnyAction[] {
  return ANSWER_MODEL_TOOL_IDS.map((toolId) => {
    const action = findAction(toolId)
    if (action === undefined || !action.readOnly) {
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
  message?: {
    content?: string
    tool_calls?: readonly OpenRouterToolCall[]
  }
}

type OpenRouterResponse = {
  choices?: readonly OpenRouterChoice[]
}

async function postChatCompletion(input: {
  config: AnswerLlmConfig
  model?: string
  tools: readonly ReturnType<typeof actionToOpenRouterTool>[]
  messages: readonly OpenRouterMessage[]
  signal?: AbortSignal
}): Promise<OpenRouterResponse> {
  const response = await fetch(OPENROUTER_URL, {
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
      ...(input.tools.length === 0 ? {} : { tools: input.tools, tool_choice: 'auto' }),
      temperature: 0.2,
    }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })

  if (!response.ok) {
    throw new AnswerToolUseAgentError('request_failed')
  }
  return (await response.json()) as OpenRouterResponse
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
