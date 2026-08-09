import {
  streamAnswerTurnRequest,
  type StreamAnswerResult,
  type AnswerStreamFrame,
  type TurnThreadMeta,
} from './answer-stream'
import type { AeSearchContext } from '@/modules/answer/search-context'

type Subscriber = {
  onFrame: (frame: AnswerStreamFrame) => void
  onThread?: (meta: TurnThreadMeta) => void
  onResult: (result: StreamAnswerResult) => void
}

type Session = {
  key: string
  frames: AnswerStreamFrame[]
  lastAcceptedSeq: number
  threadMeta: TurnThreadMeta | null
  result: StreamAnswerResult | null
  subscribers: Set<Subscriber>
  abortController: AbortController
}

const sessions = new Map<string, Session>()

export function attachAnswerTurnStream(input: {
  key: string
  query: string
  threadId?: string
  searchContext?: AeSearchContext
  subscriber: Subscriber
}): () => void {
  let session = sessions.get(input.key)

  if (session === undefined) {
    const abortController = new AbortController()
    const createdSession: Session = {
      key: input.key,
      frames: [],
      lastAcceptedSeq: -1,
      threadMeta: null,
      result: null,
      subscribers: new Set(),
      abortController,
    }
    session = createdSession
    sessions.set(input.key, createdSession)
    const isCurrentSession = (): boolean => sessions.get(input.key) === createdSession

    void streamAnswerTurnRequest({
      query: input.query,
      ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      ...(input.searchContext === undefined ? {} : { searchContext: input.searchContext }),
      clientTurnKey: input.key,
      signal: abortController.signal,
      onThread: (meta) => {
        if (!isCurrentSession()) {
          return
        }
        createdSession.threadMeta = meta
        for (const sub of createdSession.subscribers) {
          sub.onThread?.(meta)
        }
      },
      onFrame: (frame) => {
        if (!isCurrentSession() || frame.seq <= createdSession.lastAcceptedSeq) {
          return
        }
        createdSession.lastAcceptedSeq = frame.seq
        createdSession.frames.push(frame)
        for (const sub of createdSession.subscribers) {
          sub.onFrame(frame)
        }
      },
    }).then((result) => {
      if (!isCurrentSession()) {
        return
      }
      createdSession.result = result
      for (const sub of createdSession.subscribers) {
        sub.onResult(result)
      }
      if (createdSession.subscribers.size === 0) {
        sessions.delete(input.key)
      }
    })
  }

  const attachedSession = session
  attachedSession.subscribers.add(input.subscriber)
  if (attachedSession.threadMeta !== null) {
    input.subscriber.onThread?.(attachedSession.threadMeta)
  }
  for (const frame of attachedSession.frames) {
    if (frame.event.type !== 'thinking') {
      input.subscriber.onFrame(frame)
    }
  }
  if (attachedSession.result !== null) {
    input.subscriber.onResult(attachedSession.result)
  }

  return () => {
    attachedSession.subscribers.delete(input.subscriber)
    if (
      attachedSession.result !== null
      && sessions.get(input.key) === attachedSession
      && attachedSession.subscribers.size === 0
    ) {
      sessions.delete(input.key)
    }
  }
}

/** Local transport cancellation is only called after the durable Stop ack. */
export function abortAnswerTurnStream(key: string): void {
  const session = sessions.get(key)
  if (session === undefined) {
    return
  }
  session.abortController.abort()
  session.subscribers.clear()
  sessions.delete(key)
}

