import { useState } from 'react'

import { AeThreadTurnStreamSection } from './AeThreadTurnStreamSection'

const INLINE_THREAD_STORAGE_KEY = 'ae.inlineEngineThreadId.v1'

function readStoredThreadId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const value = window.sessionStorage.getItem(INLINE_THREAD_STORAGE_KEY)?.trim()
    return value === undefined || value.length === 0 ? undefined : value
  } catch {
    return undefined
  }
}

function storeThreadId(threadId: string): void {
  try {
    window.sessionStorage.setItem(INLINE_THREAD_STORAGE_KEY, threadId)
  } catch {
    // Session storage is an optional continuity aid.
  }
}

export type AeInlineAnswerTurnProps = {
  query: string
}

export function AeInlineAnswerTurn({ query }: AeInlineAnswerTurnProps) {
  const [threadId, setThreadId] = useState<string | undefined>(() => readStoredThreadId())

  function handleThreadCreated(id: string) {
    setThreadId(id)
    storeThreadId(id)
  }

  return (
    <AeThreadTurnStreamSection
      query={query}
      generation={1}
      {...(threadId === undefined ? {} : { threadId })}
      onThreadCreated={handleThreadCreated}
    />
  )
}
