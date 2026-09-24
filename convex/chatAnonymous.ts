import type { LanguageModelV4 } from '@ai-sdk/provider'
import { createUIMessageStream, createUIMessageStreamResponse, stepCountIs, type ModelMessage, type UIMessageChunk } from 'ai'
import type { z } from 'zod'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { sanitizeTelemetryError } from '@/lib/observability/private-route-safety'
import { constantTimeStringEqual } from '@/lib/server/constant-time'
import {
  openRouterGatewayConfig,
  openRouterModel,
} from '@/modules/model-gateway/public'
import { toolChoiceDescribeOutputSchema, toolChoiceSearchOutputSchema, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'

import { internal } from './_generated/api'
import { env, httpAction } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import { CHAT_NO_RESULT_ANSWER, CHAT_TOOL_NAME_MAP, chatNoMatchSearchCount, createChatAgent, prepareChatToolStep } from './chatTools'

export const MAX_ANONYMOUS_CHAT_MESSAGES = 12
export const MAX_ANONYMOUS_CHAT_PROMPT_CHARACTERS = 2_000
export const MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES = 16 * 1024

const PROXY_SECRET_MIN_LENGTH = 32
const ADMISSION_KEY_PATTERN = /^(?:principal|session|ip):sha256:[0-9a-f]{64}:sha256:[0-9a-f]{64}$/u
const encoder = new TextEncoder()

export type AnonymousChatMessage = Readonly<{
  role: 'user' | 'assistant'
  content: string
}>

export type AnonymousChatBody = Readonly<{
  messages: readonly AnonymousChatMessage[]
}>

type AdmissionResult =
  | Readonly<{ ok: true; retryAfter?: number }>
  | Readonly<{ ok: false; retryAfter: number }>

type AnonymousChatHandlerDependencies = Readonly<{
  proxySecret: string | undefined
  admit: (key: string) => Promise<AdmissionResult>
  stream: (
    messages: readonly AnonymousChatMessage[],
    signal: AbortSignal,
  ) => Promise<Response>
}>

type ValidationResult =
  | Readonly<{ ok: true; body: AnonymousChatBody }>
  | Readonly<{ ok: false; code: string }>

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const ownKeys = Object.keys(value)
  return ownKeys.length === keys.length && keys.every((key) => ownKeys.includes(key))
}

function unicodeLength(value: string): number {
  return Array.from(value).length
}

export function validateAnonymousChatBody(value: unknown): ValidationResult {
  if (!isExactObject(value, ['messages']) || !Array.isArray(value.messages)) {
    return { ok: false, code: 'invalid_body' }
  }
  if (value.messages.length < 1 || value.messages.length > MAX_ANONYMOUS_CHAT_MESSAGES) {
    return { ok: false, code: 'invalid_messages' }
  }

  const messages: AnonymousChatMessage[] = []
  for (const valueMessage of value.messages) {
    if (!isExactObject(valueMessage, ['role', 'content'])) {
      return { ok: false, code: 'invalid_message' }
    }
    if (
      (valueMessage.role !== 'user' && valueMessage.role !== 'assistant')
      || typeof valueMessage.content !== 'string'
      || valueMessage.content.trim().length === 0
    ) {
      return { ok: false, code: 'invalid_message' }
    }
    messages.push({ role: valueMessage.role, content: valueMessage.content })
  }

  const current = messages.at(-1)
  if (
    current?.role !== 'user'
    || unicodeLength(current.content) > MAX_ANONYMOUS_CHAT_PROMPT_CHARACTERS
  ) {
    return { ok: false, code: 'invalid_prompt' }
  }
  const body = { messages } satisfies AnonymousChatBody
  if (encoder.encode(JSON.stringify(body)).byteLength > MAX_ANONYMOUS_CHAT_TRANSCRIPT_BYTES) {
    return { ok: false, code: 'transcript_too_large' }
  }
  return { ok: true, body }
}

function jsonError(
  status: number,
  code: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return Response.json({ code }, {
    status,
    headers: {
      ...Object.fromEntries(new Headers(headers)),
      'Cache-Control': 'no-store',
    },
  })
}

function configuredProxySecret(value: string | undefined): string | undefined {
  const secret = value?.trim()
  return secret !== undefined && secret.length >= PROXY_SECRET_MIN_LENGTH
    ? secret
    : undefined
}

function secretMatches(expected: string, received: string | null): boolean {
  return constantTimeStringEqual(expected, received ?? '')
}

function retryAfterHeader(retryAfterMs: number): Readonly<Record<string, string>> {
  return { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1_000))) }
}

export async function handleAnonymousChatRequest(
  request: Request,
  dependencies: AnonymousChatHandlerDependencies,
): Promise<Response> {
  const proxySecret = configuredProxySecret(dependencies.proxySecret)
  if (proxySecret === undefined) return jsonError(503, 'chat_unavailable')
  if (!secretMatches(proxySecret, request.headers.get('x-ae-chat-proxy-secret'))) {
    return jsonError(404, 'not_found')
  }

  const admissionKey = request.headers.get('x-ae-chat-admission-key')?.trim()
  if (admissionKey === undefined || !ADMISSION_KEY_PATTERN.test(admissionKey)) {
    return jsonError(400, 'invalid_admission_key')
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return jsonError(415, 'invalid_content_type')
  }

  let value: unknown
  try {
    value = await request.json() as unknown
  } catch (cause) {
    return degradeBackend(cause, jsonError(400, 'invalid_json'), { site: 'handleAnonymousChatRequest', reason: 'invalid_response' })
  }
  const parsed = validateAnonymousChatBody(value)
  if (!parsed.ok) return jsonError(400, parsed.code)

  const admission = await dependencies.admit(admissionKey)
  if (!admission.ok) {
    return jsonError(429, 'rate_limited', retryAfterHeader(admission.retryAfter))
  }
  return await dependencies.stream(parsed.body.messages, request.signal)
}

type ChatCandidate =
  | Extract<ToolChoiceSearchOutput, { kind: 'matched' }>['results'][number]
  | Extract<z.output<typeof toolChoiceDescribeOutputSchema>, { kind: 'found' }>['tool']

export async function streamAnonymousChatResponse(
  ctx: ActionCtx,
  messages: readonly AnonymousChatMessage[],
  languageModel: LanguageModelV4,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const agent = createChatAgent(languageModel)
  const scope = { userId: 'anonymous-ephemeral' }
  const prompt = messages.map((message) => ({ ...message })) as ModelMessage[]
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = await agent.streamText(ctx, scope, {
        messages: prompt,
        prepareStep: prepareChatToolStep,
        ...(abortSignal === undefined ? {} : { abortSignal }),
      })
      const initialText: UIMessageChunk[] = []
      for await (const chunk of result.toUIMessageStream({ sendFinish: false })) {
        if (chunk.type === 'text-start' || chunk.type === 'text-delta' || chunk.type === 'text-end') {
          initialText.push(chunk)
        } else {
          writer.write(chunk)
        }
      }
      const steps = await result.steps
      if (steps.every(step => step.toolResults.length === 0) || chatNoMatchSearchCount(steps) > 0) {
        writer.write({ type: 'text-start', id: 'no-tool-result' })
        writer.write({ type: 'text-delta', id: 'no-tool-result', delta: CHAT_NO_RESULT_ANSWER })
        writer.write({ type: 'text-end', id: 'no-tool-result' })
        writer.write({ type: 'finish' })
        return
      }
      const last = steps.at(-1)
      const clarification = steps.some(step => step.toolCalls.some(call =>
        call.toolName === CHAT_TOOL_NAME_MAP.canonicalToProvider['chat.clarify']))
      const finish = clarification || (steps.every(step => step.toolCalls.length === 0)
        && Boolean(last?.text.trim()) && /[.!?…)"']$/u.test(last?.text.trim() ?? '')
        && !/\b(?:let me|i(?:'ll| will) (?:check|search|look)|next page)\b/iu.test(last?.text ?? ''))
      if (finish) {
        if (!clarification) for (const chunk of initialText) writer.write(chunk)
        writer.write({ type: 'finish' })
        return
      }
      const final = await agent.streamText(ctx, scope, {
        messages: [...prompt, ...await result.responseMessages],
        tools: {},
        stopWhen: stepCountIs(1),
        instructions: `${agent.options.instructions} The tools are closed. Answer directly from completed tool results, not earlier narration. Open with a bold supported answer, use bullets for one Tool and a table only for two to four distinct Tools, name a material gap once, and finish with one "Next: ..." action. This guest cannot obtain a Quote or Call, so never suggest those actions. Do not promise another search.`,
        ...(abortSignal === undefined ? {} : { abortSignal }),
      })
      const finalChunks: UIMessageChunk[] = []
      for await (const chunk of final.toUIMessageStream({ sendStart: false })) finalChunks.push(chunk)
      const answer = (await final.text).trim()
      if (answer.length >= 35 && !/[｜▁]|<\|(?:begin|end)|\b(?:let me|i(?:'ll| will) (?:check|search|look))\b/iu.test(answer)) {
        for (const chunk of finalChunks) {
          writer.write(
            (chunk.type === 'text-start' || chunk.type === 'text-delta' || chunk.type === 'text-end')
              ? { ...chunk, id: `final-${chunk.id}` }
              : chunk,
          )
        }
        return
      }
      const candidates: ChatCandidate[] = []
      for (const step of steps) for (const result of step.toolResults) {
        const search = toolChoiceSearchOutputSchema.safeParse(result.output)
        if (search.success && (search.data.kind === 'matched' || search.data.kind === 'degraded')) {
          candidates.push(...search.data.results)
          continue
        }
        const detail = toolChoiceDescribeOutputSchema.safeParse(result.output)
        if (detail.success && detail.data.kind === 'found') candidates.push(detail.data.tool)
      }
      const first = candidates[0]
      const second = candidates.find(candidate => candidate.toolRef !== first?.toolRef)
      const status = (health: 'operational' | 'degraded' | 'unverified') =>
        health === 'operational' ? 'Operational' : health === 'degraded' ? 'Degraded' : 'Not yet verified by AE'
      const fallback = first === undefined
        ? CHAT_NO_RESULT_ANSWER
        : second === undefined
          ? `**${first.title}: ${'summary' in first ? first.summary : first.description}**\n\n- Price: ${'price' in first ? first.price.label : first.priceLabel}.\n- Status: ${status(first.healthStatus)}.\n\nNext: Open the Tool card to check its inputs and current terms.`
          : `**${first.title} and ${second.title} can both help with this request.**\n\n| Tool | Price | Status | Best for |\n| --- | --- | --- | --- |\n| **${first.title}** | ${'price' in first ? first.price.label : first.priceLabel} | ${status(first.healthStatus)} | ${'summary' in first ? first.summary : first.description} |\n| **${second.title}** | ${'price' in second ? second.price.label : second.priceLabel} | ${status(second.healthStatus)} | ${'summary' in second ? second.summary : second.description} |\n\nNext: Compare their inputs and current terms before choosing.`
      writer.write({ type: 'text-start', id: 'final-fallback' })
      writer.write({ type: 'text-delta', id: 'final-fallback', delta: fallback })
      writer.write({ type: 'text-end', id: 'final-fallback' })
      writer.write({ type: 'finish' })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

export const anonymousChat = httpAction(async (ctx, request) =>
  await handleAnonymousChatRequest(request, {
    proxySecret: env.AE_CHAT_PROXY_SECRET,
    admit: async (key) => await ctx.runMutation(internal.rateLimit.admit, {
      name: 'chat-anonymous',
      key,
    }),
    stream: async (messages, signal) => {
      const apiKey = env.OPENROUTER_API_KEY?.trim()
      if (apiKey === undefined || apiKey.length === 0) {
        return jsonError(503, 'chat_model_unconfigured')
      }
      const config = openRouterGatewayConfig({
        OPENROUTER_API_KEY: apiKey,
        ...(env.AE_LLM_MODEL === undefined ? {} : { AE_LLM_MODEL: env.AE_LLM_MODEL }),
        ...(env.AE_SITE_URL === undefined ? {} : { SITE_URL: env.AE_SITE_URL }),
      })
      try {
        return await streamAnonymousChatResponse(
          ctx,
          messages,
          openRouterModel(config, config.model),
          signal,
        )
      } catch (error) {
        console.error('[chat-anonymous] stream failed', sanitizeTelemetryError(error))
        return jsonError(503, 'chat_stream_failed')
      }
    },
  }),
)
