import { useMemo, useSyncExternalStore } from 'react'
import { isRecord } from '@/modules/common/is-record'
import type { AnswerThreadRecord } from '@/modules/answer-thread/public'

const RECENT_THREADS_STORAGE_KEY = 'ae.recentThreads.v1'
const RECENT_THREADS_LIMIT = 20
const EMPTY_THREAD_RECORDS_SNAPSHOT = '[]'
let fallbackThreadRecordsSnapshot = EMPTY_THREAD_RECORDS_SNAPSHOT
let preferFallbackThreadRecordsSnapshot = false
const threadRecordsSubscribers = new Set<() => void>()

export function useStoredThreadRecords(): readonly AnswerThreadRecord[] {
  const snapshot = useSyncExternalStore(
    subscribeThreadRecords,
    getThreadRecordsSnapshot,
    getServerThreadRecordsSnapshot,
  )
  return useMemo(() => readStoredThreadRecordsSnapshot(snapshot), [snapshot])
}

export function mergeThreadRecords(
  incoming: readonly AnswerThreadRecord[],
  current: readonly AnswerThreadRecord[],
): AnswerThreadRecord[] {
  const normalizedIncoming = incoming.map(sanitizeThreadRecord)
  const incomingIds = new Set(normalizedIncoming.map((thread) => thread.threadId))
  const optimistic = current.flatMap((thread) => {
    const sanitized = sanitizeThreadRecord(thread)
    return incomingIds.has(sanitized.threadId) ? [] : [sanitized]
  })
  return [...normalizedIncoming, ...optimistic]
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, RECENT_THREADS_LIMIT)
}

export function upsertOptimisticThread(
  current: readonly AnswerThreadRecord[],
  input: { threadId: string; title: string },
): AnswerThreadRecord[] {
  const now = Date.now()
  const existing = current.find((thread) => thread.threadId === input.threadId)
  const optimistic: AnswerThreadRecord = {
    threadId: input.threadId,
    pseudonymousSessionId: '',
    title: input.title.length > 0 ? input.title : 'New chat',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  return mergeThreadRecords([optimistic], current.filter((thread) => thread.threadId !== input.threadId))
}

export function writeStoredThreadRecords(threads: readonly AnswerThreadRecord[]): void {
  fallbackThreadRecordsSnapshot = JSON.stringify(threads.map(sanitizeThreadRecord).slice(0, RECENT_THREADS_LIMIT))
  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(RECENT_THREADS_STORAGE_KEY, fallbackThreadRecordsSnapshot)
      preferFallbackThreadRecordsSnapshot = false
    } catch {
      preferFallbackThreadRecordsSnapshot = true
      // Recent chats still work in-memory when storage is unavailable.
    }
  }
  notifyThreadRecordsSubscribers()
}

function subscribeThreadRecords(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  threadRecordsSubscribers.add(onStoreChange)
  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea === window.sessionStorage && event.key === RECENT_THREADS_STORAGE_KEY) {
      onStoreChange()
    }
  }
  window.addEventListener('storage', handleStorage)

  return () => {
    threadRecordsSubscribers.delete(onStoreChange)
    window.removeEventListener('storage', handleStorage)
  }
}

function getThreadRecordsSnapshot(): string {
  if (typeof window === 'undefined') {
    return fallbackThreadRecordsSnapshot
  }
  if (preferFallbackThreadRecordsSnapshot) {
    return fallbackThreadRecordsSnapshot
  }
  try {
    return window.sessionStorage.getItem(RECENT_THREADS_STORAGE_KEY) ?? fallbackThreadRecordsSnapshot
  } catch {
    return fallbackThreadRecordsSnapshot
  }
}

function getServerThreadRecordsSnapshot(): string {
  return EMPTY_THREAD_RECORDS_SNAPSHOT
}

function notifyThreadRecordsSubscribers(): void {
  threadRecordsSubscribers.forEach((subscriber) => subscriber())
}

function readStoredThreadRecordsSnapshot(raw: string): AnswerThreadRecord[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.flatMap(readStoredThreadRecord).slice(0, RECENT_THREADS_LIMIT)
  } catch {
    return []
  }
}

function readStoredThreadRecord(value: unknown): AnswerThreadRecord[] {
  if (!isRecord(value)) return []
  const record = value as Partial<AnswerThreadRecord>
  if (
    typeof record.threadId !== 'string' ||
    record.threadId.length === 0 ||
    typeof record.title !== 'string' ||
    record.title.length === 0 ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number'
  ) {
    return []
  }
  return [sanitizeThreadRecord({
    threadId: record.threadId,
    pseudonymousSessionId: '',
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  })]
}

function sanitizeThreadRecord(thread: AnswerThreadRecord): AnswerThreadRecord {
  return {
    threadId: thread.threadId,
    pseudonymousSessionId: '',
    title: thread.title.trim().length > 0 ? thread.title.trim() : 'New chat',
    createdAt: finiteTimestamp(thread.createdAt),
    updatedAt: finiteTimestamp(thread.updatedAt),
  }
}

function finiteTimestamp(value: number): number {
  return Number.isFinite(value) ? value : Date.now()
}
