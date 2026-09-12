'use client'

import { useSyncExternalStore } from 'react'

import { degrade } from '@/lib/observability/degrade'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

const RECENT_TOOL_STORAGE_KEY = 'ae:command-panel:recent-tool-refs:v1'
const RECENT_TOOL_EVENT = 'ae:command-panel:recent-tools-changed'
const MAX_RECENT_TOOLS = 5
const PUBLIC_TOOL_REF_PATTERN = /^operation:v1:[0-9a-f]{64}$/u
const EMPTY_RECENTS_SNAPSHOT = '[]'

/** Hydration-safe browser subscription for the command panel's local recents. */
export function useRecentToolRefs(): readonly string[] {
  const snapshot = useSyncExternalStore(
    subscribeToRecentTools,
    readRecentToolsSnapshot,
    () => EMPTY_RECENTS_SNAPSHOT,
  )
  return parseRecentToolRefs(snapshot)
}

/** Read the local navigation aid, ignoring invalid or stale browser data. */
export function readRecentToolRefs(): readonly string[] {
  return parseRecentToolRefs(readRecentToolsSnapshot())
}

function readRecentToolsSnapshot(): string {
  if (typeof window === 'undefined') return EMPTY_RECENTS_SNAPSHOT
  try {
    return window.localStorage.getItem(RECENT_TOOL_STORAGE_KEY) ?? EMPTY_RECENTS_SNAPSHOT
  } catch (cause) {
    return degrade(cause, EMPTY_RECENTS_SNAPSHOT, {
      site: 'readRecentToolsSnapshot',
      reason: 'source_unavailable',
    })
  }
}

function parseRecentToolRefs(snapshot: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(snapshot)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter(isPublicToolRef))].slice(0, MAX_RECENT_TOOLS)
  } catch (cause) {
    return degrade(cause, [], { site: 'parseRecentToolRefs', reason: 'invalid_response' })
  }
}

/** Store public references only: never queries, Tool payloads, or credentials. */
export function rememberRecentToolRef(toolRef: string): void {
  if (typeof window === 'undefined' || !isPublicToolRef(toolRef)) return
  const recents = [
    toolRef,
    ...readRecentToolRefs().filter((recent) => recent !== toolRef),
  ].slice(0, MAX_RECENT_TOOLS)
  try {
    window.localStorage.setItem(RECENT_TOOL_STORAGE_KEY, JSON.stringify(recents))
    window.dispatchEvent(new Event(RECENT_TOOL_EVENT))
  } catch (cause) {
    // Storage can be unavailable in private or locked-down browser contexts.
    captureRouteException(cause, { site: 'rememberRecentToolRef' }, 'warning')
  }
}

function subscribeToRecentTools(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  window.addEventListener('storage', onStoreChange)
  window.addEventListener(RECENT_TOOL_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('storage', onStoreChange)
    window.removeEventListener(RECENT_TOOL_EVENT, onStoreChange)
  }
}

function isPublicToolRef(value: unknown): value is string {
  return typeof value === 'string' && PUBLIC_TOOL_REF_PATTERN.test(value)
}
