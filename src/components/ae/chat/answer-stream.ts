import type { AnswerEvent } from '@/modules/answer/public'
import type { AeSearchContext } from '@/modules/answer/search-context'

export type AnswerStreamFrame = { seq: number; event: AnswerEvent }

function parseAnswerSseBuffer(buffer: string): { frames: AnswerStreamFrame[]; rest: string } {
  const frames: AnswerStreamFrame[] = []
  const chunks = buffer.split('\n\n')
  const rest = chunks.pop() ?? ''

  for (const chunk of chunks) {
    const line = chunk.trim()
    if (!line.startsWith('data:')) {
      continue
    }
    const payload = line.slice('data:'.length).trim()
    if (payload.length === 0) {
      continue
    }
    try {
      frames.push(JSON.parse(payload) as AnswerStreamFrame)
    } catch {
      // Skip malformed frame.
    }
  }

  return { frames, rest }
}

export type StreamAnswerResult = 'done' | 'aborted' | 'error' | 'rate_limited'

async function streamAnswerSse(input: {
  url: string
  method?: 'GET' | 'POST'
  body?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  onFrame: (frame: AnswerStreamFrame) => void
}): Promise<StreamAnswerResult> {
  try {
    const method = input.method ?? (input.body === undefined ? 'GET' : 'POST')
    const response = await fetch(input.url, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(input.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...input.headers,
      },
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })

    if (response.status === 429) {
      return 'rate_limited'
    }

    if (!response.ok || response.body === null) {
      return input.signal?.aborted === true ? 'aborted' : 'error'
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { value, done } = await reader.read()
      if (done) {
        break
      }
      buffer += decoder.decode(value, { stream: true })
      const parsed = parseAnswerSseBuffer(buffer)
      buffer = parsed.rest
      for (const frame of parsed.frames) {
        input.onFrame(frame)
      }
    }

    return input.signal?.aborted === true ? 'aborted' : 'done'
  } catch (cause) {
    if (input.signal?.aborted === true) {
      return 'aborted'
    }
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      return 'aborted'
    }
    return 'error'
  }
}

export type TurnStreamFrame = AnswerStreamFrame

export type TurnThreadMeta = {
  threadId: string
  turnId: string
  turnSeq: number
}

export async function streamAnswerTurnRequest(input: {
  query: string
  threadId?: string
  searchContext?: AeSearchContext
  clientTurnKey?: string
  signal?: AbortSignal
  onFrame: (frame: TurnStreamFrame) => void
  onThread?: (meta: TurnThreadMeta) => void
}): Promise<StreamAnswerResult> {
  return streamAnswerSse({
    url: '/api/answer/turn',
    method: 'POST',
    body: JSON.stringify({
      query: input.query,
      ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      ...(input.searchContext === undefined ? {} : { searchContext: input.searchContext }),
    }),
    ...(input.clientTurnKey === undefined
      ? {}
      : { headers: { 'X-AE-Turn-Key': input.clientTurnKey } }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    onFrame: (frame) => {
      if (frame.event.type === 'thread') {
        input.onThread?.({
          threadId: frame.event.threadId,
          turnId: frame.event.turnId,
          turnSeq: frame.event.turnSeq,
        })
      }
      input.onFrame(frame)
    },
  })
}

export function appendThinkingStep(steps: readonly string[], label: string): string[] {
  if (steps.at(-1) === label) {
    return [...steps]
  }
  return [...steps, label]
}

export type { AnswerEvent }
