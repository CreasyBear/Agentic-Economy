import { createFileRoute } from '@tanstack/react-router'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'

import type { AnswerEvent } from '@/modules/answer/public'
import {
  extractModelFromChatBody,
  extractQueryFromChatBody,
  synthesizeChatAnswer,
  buildFallbackModels,
  fetchOpenRouterModels,
  readAnswerLlmConfig,
  resolveChatModelId,
} from '@/modules/answer/public'
import {
  checkAnswerStreamRateLimit,
  resolveOrCreateSessionId,
} from '@/modules/answer-thread/public'

export const Route = createFileRoute('/api/chat')({
  server: {
    handlers: {
      POST: ({ request }) => handleChatRequest(request),
    },
  },
})

const MAX_CHAT_BODY_BYTES = 16 * 1024

export async function handleChatRequest(request: Request): Promise<Response> {
  if (!isChatApiEnabled()) {
    return jsonError('chat_unavailable', 404)
  }

  const { sessionId } = resolveOrCreateSessionId(request)
  const rateLimit = checkAnswerStreamRateLimit(sessionId)
  if (rateLimit.kind === 'limited') {
    return jsonError('rate_limited', 429)
  }

  const llm = readAnswerLlmConfig()
  if (llm === undefined) {
    return new Response(JSON.stringify({ error: 'structured_answer_unavailable', reason: 'missing_openrouter_key' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const boundedBody = await readBoundedRequestText(request, MAX_CHAT_BODY_BYTES)
  if (!boundedBody.ok) {
    return jsonError('payload_too_large', 413)
  }

  let body: unknown
  try {
    body = JSON.parse(boundedBody.text)
  } catch {
    return jsonError('invalid_body', 400)
  }

  const query = extractQueryFromChatBody(body)
  if (query === undefined) {
    return jsonError('invalid_body', 400)
  }

  const requestedModel = extractModelFromChatBody(body)
  const availableModels = await loadAvailableChatModels(llm)
  const modelId = resolveChatModelId(
    availableModels,
    requestedModel === undefined ? {} : { model: requestedModel },
    llm.model,
  )

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = -1
      const send = (event: AnswerEvent) => {
        if (request.signal.aborted) {
          return
        }
        seq += 1
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ seq, event })}\n\n`))
      }

      try {
        for await (const event of synthesizeChatAnswer({
          query,
          limit: 10,
          emitThinking: true,
          forceGated: true,
          model: modelId,
        })) {
          if (request.signal.aborted) {
            break
          }
          send(event)
        }
      } catch {
        send({ type: 'error', code: 'chat_failed', copyId: makeCopyId() })
      } finally {
        controller.close()
      }
    },
    cancel() {
      // Client disconnected.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function loadAvailableChatModels(llm: { apiKey: string; model: string }) {
  try {
    const models = await fetchOpenRouterModels(llm.apiKey)
    if (models.length > 0) {
      return models
    }
  } catch {
    // Fall back to env whitelist or default model below.
  }

  return buildFallbackModels(llm.model)
}

function jsonError(code: string, status: number): Response {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeCopyId(): string {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function isChatApiEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.AE_ALLOW_CHAT_API === '1'
}
