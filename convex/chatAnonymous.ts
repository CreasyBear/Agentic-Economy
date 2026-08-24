import type { LanguageModelV4 } from '@ai-sdk/provider'
import type { ModelMessage } from 'ai'

import { constantTimeStringEqual } from '@/lib/server/constant-time'
import {
  openRouterGatewayConfig,
  openRouterModel,
} from '@/modules/model-gateway/public'

import { internal } from './_generated/api'
import { env, httpAction } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import { createChatAgent } from './chatTools'

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
  } catch {
    return jsonError(400, 'invalid_json')
  }
  const parsed = validateAnonymousChatBody(value)
  if (!parsed.ok) return jsonError(400, parsed.code)

  const admission = await dependencies.admit(admissionKey)
  if (!admission.ok) {
    return jsonError(429, 'rate_limited', retryAfterHeader(admission.retryAfter))
  }
  return await dependencies.stream(parsed.body.messages, request.signal)
}

export async function streamAnonymousChatResponse(
  ctx: ActionCtx,
  messages: readonly AnonymousChatMessage[],
  languageModel: LanguageModelV4,
  abortSignal?: AbortSignal,
): Promise<Response> {
  const result = await createChatAgent(languageModel).streamText(
    ctx,
    // Agent 0.7.1 requires a user or thread scope even when storage is disabled.
    // This constant sentinel is neither requester identity nor persisted state.
    { userId: 'anonymous-ephemeral' },
    {
      messages: messages.map((message) => ({ ...message })) as ModelMessage[],
      ...(abortSignal === undefined ? {} : { abortSignal }),
    },
    {
      contextOptions: { recentMessages: 0 },
      storageOptions: { saveMessages: 'none' },
    },
  )
  return result.toUIMessageStreamResponse()
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
        return jsonError(503, 'chat_unavailable')
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
      } catch {
        return jsonError(503, 'chat_unavailable')
      }
    },
  }),
)
