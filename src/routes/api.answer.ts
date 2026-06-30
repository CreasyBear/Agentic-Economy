import { createFileRoute } from '@tanstack/react-router'

import { deterministicSynthesizer } from '@/modules/answer/public'
import type {
  AnswerEvent,
  AnswerSnapshot,
  AnswerSource,
} from '@/modules/answer/public'
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
    return streamAnswer(request, { query, limit, after })
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

  const snapshot = await collectSnapshot(input)
  if (snapshot !== undefined) {
    writeCache(input, snapshot)
  }

  if (snapshot === undefined) {
    return jsonResponse(
      { kind: 'error', code: 'answer_search_failed', copyId: makeCopyId() },
      { status: 502 }
    )
  }

  return jsonResponse(snapshot)
}

async function streamAnswer(
  request: Request,
  input: { query: string; limit: number; after: number },
): Promise<Response> {
  const { query, limit, after } = input
  const encoder = new TextEncoder()

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Each event is assigned a monotonically increasing seq. On reconnect,
      // the client sends ?after=<lastSeq> and we replay only events with
      // seq > after. Because the Phase-1 synthesizer is deterministic, a cache
      // miss re-synthesizes the same events with the same seqs, so resumption
      // is exact without a run-id or persistence (a seq-based reconnect ported
      // from a home-to-thread streaming model, adapted to AE's stateless register).
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

      try {
        let captured: AnswerSnapshot | undefined
        for await (const event of deterministicSynthesizer.synthesize({ query, limit })) {
          if (request.signal.aborted) {
            break
          }
          send(event)
          if (event.type === 'complete') {
            captured = event.answer
          }
          if (event.type === 'error') {
            break
          }
        }
        if (captured !== undefined) {
          writeCache(input, captured)
        }
      } catch {
        send({ type: 'error', code: 'answer_stream_failed', copyId: makeCopyId() })
      } finally {
        controller.close()
      }
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

async function collectSnapshot(input: { query: string; limit: number }): Promise<AnswerSnapshot | undefined> {
  for await (const event of deterministicSynthesizer.synthesize(input)) {
    if (event.type === 'complete') {
      return event.answer
    }
    if (event.type === 'error') {
      return undefined
    }
  }
  return undefined
}

function snapshotToEvents(snapshot: AnswerSnapshot): AnswerEvent[] {
  const events: AnswerEvent[] = []
  events.push({ type: 'thinking' })
  events.push({ type: 'one-line', oneLine: snapshot.oneLine })
  events.push({ type: 'sources', providers: snapshot.providers })
  for (const delta of splitSentences(snapshot.summary)) {
    events.push({ type: 'summary-delta', delta })
  }
  events.push({ type: 'next-step', nextStep: snapshot.nextStep })
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

function writeCache(input: { query: string; limit: number }, snapshot: AnswerSnapshot): void {
  answerCache.set(cacheKey(input), { ts: Date.now(), snapshot })
}

function makeCopyId(): string {
  return `answer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

// Re-export for callers that want the source shape alongside the route.
export type { AnswerSource }
