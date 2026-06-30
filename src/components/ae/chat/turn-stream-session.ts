import {
  streamAnswerTurnRequest,
  type StreamAnswerResult,
  type TurnStreamFrame,
  type TurnThreadMeta,
} from './answer-stream'

type Subscriber = {
  onFrame: (frame: TurnStreamFrame) => void
  onThread?: (meta: TurnThreadMeta) => void
  onResult: (result: StreamAnswerResult) => void
}

type Session = {
  key: string
  frames: TurnStreamFrame[]
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
  subscriber: Subscriber
}): () => void {
  let session = sessions.get(input.key)

  if (session === undefined) {
    const abortController = new AbortController()
    session = {
      key: input.key,
      frames: [],
      threadMeta: null,
      result: null,
      subscribers: new Set(),
      abortController,
    }
    sessions.set(input.key, session)

    void streamAnswerTurnRequest({
      query: input.query,
      ...(input.threadId === undefined ? {} : { threadId: input.threadId }),
      clientTurnKey: input.key,
      signal: abortController.signal,
      onThread: (meta) => {
        session!.threadMeta = meta
        for (const sub of session!.subscribers) {
          sub.onThread?.(meta)
        }
      },
      onFrame: (frame) => {
        session!.frames.push(frame)
        for (const sub of session!.subscribers) {
          sub.onFrame(frame)
        }
      },
    }).then((result) => {
      session!.result = result
      for (const sub of session!.subscribers) {
        sub.onResult(result)
      }
      sessions.delete(input.key)
    })
  }

  if (session.threadMeta !== null) {
    input.subscriber.onThread?.(session.threadMeta)
  }
  for (const frame of session.frames) {
    input.subscriber.onFrame(frame)
  }
  if (session.result !== null) {
    input.subscriber.onResult(session.result)
  }

  session.subscribers.add(input.subscriber)

  return () => {
    session!.subscribers.delete(input.subscriber)
  }
}

export function abortAnswerTurnStream(key: string): void {
  const session = sessions.get(key)
  if (session === undefined) {
    return
  }
  session.abortController.abort()
  sessions.delete(key)
}
