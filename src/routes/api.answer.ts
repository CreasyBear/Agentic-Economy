import { createFileRoute } from '@tanstack/react-router'

import { buildArtifactsFromSnapshot, type AnswerEvent, type AnswerSnapshot, type AnswerSource } from '@/modules/answer/public'
import { resolveOrCreateSessionId, checkAnswerStreamRateLimit } from '@/modules/answer-thread/public'
import { jsonResponse, optionalLimit } from './api.businesses'

export const Route = createFileRoute('/api/answer')({
  server: {
    handlers: {
      GET: ({ request }) => handleAnswerRequest(request),
    },
  },
})

const DEFAULT_LIMIT = 10
const MAX_QUERY_LENGTH = 200
const CACHE_TTL_MS = 30_000

type CachedAnswer = { ts: number; snapshot: AnswerSnapshot }

const answerCache = new Map<string, CachedAnswer>()

export async function handleAnswerRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') ?? '').slice(0, MAX_QUERY_LENGTH).trim()
  const limit = optionalLimit(url.searchParams.get('limit')).limit ?? DEFAULT_LIMIT
  const stream = url.searchParams.get('stream') === '1'
  const after = parseAfterParam(url.searchParams.get('after'))

  if (stream) {
    const { sessionId } = resolveOrCreateSessionId(request)
    const rateLimit = checkAnswerStreamRateLimit(sessionId)
    if (rateLimit.kind === 'limited') {
      return jsonResponse({ error: 'rate_limited' }, { status: 429 })
    }
    return streamAnswer(request, { query, limit, after })
  }

  const { sessionId } = resolveOrCreateSessionId(request)
  const rateLimit = checkAnswerStreamRateLimit(sessionId)
  if (rateLimit.kind === 'limited') {
    return jsonResponse({ error: 'rate_limited' }, { status: 429 })
  }

  return jsonAnswer({ query, limit })
}

function parseAfterParam(raw: string | null): number {
  if (raw === null) return -1
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) && value >= 0 ? value : -1
}

async function jsonAnswer(input: { query: string; limit: number }): Promise<Response> {
  const cached = readCache(input)
  if (cached !== undefined) {
    return jsonResponse(cached)
  }

  // Phase 7 collapsed the answer path onto the thread tool-use agent
  // (`POST /api/answer/turn`). This legacy stateless endpoint no longer has a
  // deterministic synthesizer to fall back on, so it returns a safe error
  // rather than fabricated prose. The UI does not consume this endpoint.
  return jsonResponse(
    { kind: 'error', code: 'answer_unavailable', copyId: makeCopyId() },
    { status: 503 }
  )
}

async function streamAnswer(
  request: Request,
  input: { query: string; limit: number; after: number },
): Promise<Response> {
  const { query, limit, after } = input
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = -1
      const send = (event: AnswerEvent) => {
        seq += 1
        if (event.type === 'error' && seq <= after) {
          seq = after + 1
        }
        if (seq <= after) {
          return
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ seq, event })}\n\n`))
      }

      const cached = readCache(input)
      if (cached !== undefined) {
        for (const event of snapshotToEvents(cached)) {
          if (request.signal.aborted) {
            break
          }
          send(event)
        }
        controller.close()
        return
      }

      // No deterministic synthesizer remains (Phase 7G); the live answer surface
      // is `POST /api/answer/turn`. Emit a single safe error and close.
      send({ type: 'error', code: 'answer_unavailable', copyId: makeCopyId() })
      controller.close()
    },
    cancel() {
      // Client disconnected (Stop button / navigation). Nothing to clean up here;
      // the iterator loop checks request.signal.aborted and exits.
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function snapshotToEvents(snapshot: AnswerSnapshot): AnswerEvent[] {
  const events: AnswerEvent[] = []
  events.push({ type: 'thinking', step: 'search', label: 'Searching listed businesses…' })
  events.push({ type: 'one-line', oneLine: snapshot.oneLine })
  events.push({ type: 'sources', providers: snapshot.providers })
  for (const delta of splitSentences(snapshot.summary)) {
    events.push({ type: 'summary-delta', delta })
  }
  events.push({ type: 'next-step', nextStep: snapshot.nextStep })
  for (const artifact of buildArtifactsFromSnapshot(snapshot)) {
    events.push({ type: 'artifact', artifact })
  }
  events.push({ type: 'complete', answer: snapshot })
  return events
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function cacheKey(input: { query: string; limit: number }): string {
  return `${input.query}|${input.limit}`
}

function readCache(input: { query: string; limit: number }): AnswerSnapshot | undefined {
  const key = cacheKey(input)
  const entry = answerCache.get(key)
  if (entry === undefined) {
    return undefined
  }
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    answerCache.delete(key)
    return undefined
  }
  return entry.snapshot
}

function makeCopyId(): string {
  return `answer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Re-export for callers that want the source shape alongside the route.
export type { AnswerSource }
