import type { AnswerThreadRecord, AnswerTurnRecord } from '@/modules/answer-thread/public'
import { buildPublicThreadProjection } from '@/modules/answer-thread/public'
import { setAnswerThreadPortForTests } from '@/modules/answer-thread/public'

export type AnswerThreadTestStore = {
  threads: Map<string, AnswerThreadRecord>
  turns: Map<string, AnswerTurnRecord>
}

export function createAnswerThreadTestStore(): AnswerThreadTestStore {
  return {
    threads: new Map(),
    turns: new Map(),
  }
}

export function installAnswerThreadTestPort(store: AnswerThreadTestStore): () => void {
  return setAnswerThreadPortForTests({
    createThread: async (args) => {
      const now = Date.now()
      store.threads.set(args.threadId, {
        threadId: args.threadId,
        pseudonymousSessionId: args.pseudonymousSessionId,
        title: args.title,
        sharePolicy: 'public',
        createdAt: now,
        updatedAt: now,
      })
      return { threadId: args.threadId }
    },
    appendTurn: async (args) => {
      const thread = store.threads.get(args.threadId)
      if (thread === undefined) {
        throw new Error('thread_not_found')
      }
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
        throw new Error('thread_forbidden')
      }
      const turnCount = [...store.turns.values()].filter((turn) => turn.threadId === args.threadId).length
      if (turnCount >= 25) {
        throw new Error('thread_turn_limit')
      }
      store.turns.set(args.turnId, {
        ...args,
        createdAt: Date.now(),
      })
      return { turnId: args.turnId }
    },
    listSessionThreads: async (sessionId) => ({
      threads: [...store.threads.values()]
        .filter((thread) => thread.pseudonymousSessionId === sessionId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }),
    getPublicThreadProjection: async (threadId) => {
      const thread = store.threads.get(threadId)
      if (thread === undefined) {
        return null
      }
      return buildPublicThreadProjection(
        thread,
        [...store.turns.values()].filter((turn) => turn.threadId === threadId),
      )
    },
    getThreadTurns: async (threadId) => ({
      turns: [...store.turns.values()]
        .filter((turn) => turn.threadId === threadId)
        .sort((a, b) => a.seq - b.seq),
    }),
    getAnswerThread: async (threadId) => {
      const thread = store.threads.get(threadId)
      if (thread === undefined) {
        return null
      }
      const turnCount = [...store.turns.values()].filter((turn) => turn.threadId === threadId).length
      return { ...thread, turnCount }
    },
  })
}

export function readSessionCookieFromResponse(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  if (setCookie === null) {
    return ''
  }
  const match = setCookie.match(/ae_session=([^;]+)/)
  if (match === null) {
    return ''
  }
  return decodeURIComponent(match[1] ?? '')
}

export function sessionCookieHeader(sessionId: string): string {
  return sessionId.length === 0 ? '' : `ae_session=${encodeURIComponent(sessionId)}`
}
