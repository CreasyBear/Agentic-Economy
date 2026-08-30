'use client'

import { useSyncExternalStore } from 'react'

const RECENT_OPERATION_STORAGE_KEY = 'ae:command-panel:recent-operation-refs:v1'
const RECENT_OPERATION_EVENT = 'ae:command-panel:recent-operations-changed'
const MAX_RECENT_OPERATIONS = 5
const PUBLIC_OPERATION_REF_PATTERN = /^operation:v1:[0-9a-f]{64}$/u
const EMPTY_RECENTS_SNAPSHOT = '[]'

/** Hydration-safe browser subscription for the command panel's local recents. */
export function useRecentOperationRefs(): readonly string[] {
  const snapshot = useSyncExternalStore(
    subscribeToRecentOperations,
    readRecentOperationsSnapshot,
    () => EMPTY_RECENTS_SNAPSHOT,
  )
  return parseRecentOperationRefs(snapshot)
}

/** Read the local navigation aid, ignoring invalid or stale browser data. */
export function readRecentOperationRefs(): readonly string[] {
  return parseRecentOperationRefs(readRecentOperationsSnapshot())
}

function readRecentOperationsSnapshot(): string {
  if (typeof window === 'undefined') return EMPTY_RECENTS_SNAPSHOT
  try {
    return window.localStorage.getItem(RECENT_OPERATION_STORAGE_KEY) ?? EMPTY_RECENTS_SNAPSHOT
  } catch {
    return EMPTY_RECENTS_SNAPSHOT
  }
}

function parseRecentOperationRefs(snapshot: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter(isPublicOperationRef))].slice(0, MAX_RECENT_OPERATIONS)
  } catch {
    return []
  }
}

/** Store public references only: never queries, operation payloads, or credentials. */
export function rememberRecentOperationRef(operationRef: string): void {
  if (typeof window === 'undefined' || !isPublicOperationRef(operationRef)) return
  const recents = [
    operationRef,
    ...readRecentOperationRefs().filter((recent) => recent !== operationRef),
  ].slice(0, MAX_RECENT_OPERATIONS)
  try {
    window.localStorage.setItem(RECENT_OPERATION_STORAGE_KEY, JSON.stringify(recents))
    window.dispatchEvent(new Event(RECENT_OPERATION_EVENT))
  } catch {
    // Storage can be unavailable in private or locked-down browser contexts.
  }
}

function subscribeToRecentOperations(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(RECENT_OPERATION_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(RECENT_OPERATION_EVENT, onStoreChange)
  }
}

function isPublicOperationRef(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_OPERATION_REF_PATTERN.test(value)
}
