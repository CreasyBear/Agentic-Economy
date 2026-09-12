'use client'

// Adapted from ShadcnSpace's MIT-licensed wishlist context.
// Source and copyright notice: docs/licenses/shadcnspace.txt.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { x402DirectoryInputSchema, type X402DirectoryEntry, type X402DirectoryInput } from '@/modules/market/x402-directory'
import { degrade } from '@/lib/observability/degrade'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

export const DIRECTORY_SAVED_TOOLS_STORAGE_KEY = 'ae:directory:saved-tools:v1'
export const DIRECTORY_SAVED_TOOLS_LIMIT = 100
const MAX_STORAGE_BYTES = 2 * 1024 * 1024
const STORAGE_READ_ERROR = 'Saved Tools could not be loaded. New saves last for this session only; existing browser data was left unchanged.'

export type SavedDirectoryTool = Readonly<{ entry: X402DirectoryEntry; search: X402DirectoryInput }>
type StorageState = 'checking' | 'browser' | 'session'
type SavedToolsContextValue = Readonly<{
  savedTools: readonly SavedDirectoryTool[]
  toggleSavedTool: (tool: SavedDirectoryTool) => void
  isSaved: (resource: string) => boolean
  hydrated: boolean
  storageState: StorageState
  saveError?: string
}>

const publicLinkSchema = z.string().max(2048).refine(value => {
  if (/[\u0000-\u0020\u007f]/u.test(value)) return false
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password } catch (cause) { return degrade(cause, false, { site: 'publicLinkSchema', reason: 'invalid_response' }) }
})
const jsonText = (maximum: number) => z.string().max(maximum).refine(value => {
  try { JSON.parse(value); return true } catch (cause) { return degrade(cause, false, { site: 'jsonTextSchema', reason: 'invalid_response' }) }
})
const contractSchema = z.object({
  type: z.string().max(100).exactOptional(),
  schemaJson: jsonText(32768).exactOptional(), exampleJson: jsonText(16384).exactOptional(),
  schemaOmitted: z.literal(true).exactOptional(), exampleOmitted: z.literal(true).exactOptional(), fieldsTruncated: z.literal(true).exactOptional(),
  fields: z.array(z.object({
    name: z.string().max(160), path: z.string().max(4096),
    location: z.enum(['body', 'queryParams', 'pathParams', 'headers', 'output']), source: z.enum(['schema', 'example']),
    type: z.string().max(100).exactOptional(), required: z.boolean().exactOptional(), description: z.string().max(1000).exactOptional(),
    enumValues: z.array(jsonText(512)).max(30).exactOptional(), defaultJson: jsonText(2048).exactOptional(), exampleJson: jsonText(4096).exactOptional(),
    constraints: z.array(z.string().max(300)).max(12).exactOptional(),
  })).max(64),
})

const entrySchema: z.ZodType<X402DirectoryEntry> = z.object({
  serviceName: z.string().max(140).exactOptional(), iconUrl: publicLinkSchema.exactOptional(), skillUrl: publicLinkSchema.exactOptional(),
  category: z.string().max(80).exactOptional(), input: contractSchema.exactOptional(), output: contractSchema.exactOptional(),
  resource: z.string().min(1).max(8192), title: z.string().max(2048), description: z.string().max(16384),
  protocol: z.string().max(100), provider: z.string().max(8192),
  method: z.string().max(100).exactOptional(), methodLabel: z.string().max(200).exactOptional(),
  outputSummary: z.string().max(8192).exactOptional(), schemaSummary: z.string().max(8192).exactOptional(),
  tags: z.array(z.string().max(200)).max(64).exactOptional(),
  slug: z.string().max(200).exactOptional(),
  provenance: z.object({
    directory: z.literal('Coinbase Bazaar'), metadata: z.literal('provider_declared'), updatedAt: z.string().max(100).exactOptional(),
  }).exactOptional(),
  activity: z.object({
    calls30d: z.number().finite().nonnegative().exactOptional(), payers30d: z.number().finite().nonnegative().exactOptional(),
    lastCalledAt: z.string().max(100).exactOptional(),
  }).exactOptional(),
  prices: z.array(z.object({
    asset: z.string().max(160).exactOptional(), symbol: z.string().max(100).exactOptional(), decimalAmount: z.string().max(200).regex(/^\d+(?:\.\d+)?$/u).exactOptional(),
    network: z.string().max(200), networkLabel: z.string().max(200).exactOptional(), scheme: z.string().max(100), amount: z.string().max(1000),
  })).max(64),
  metadataJson: z.string().max(128 * 1024),
})
const savedToolSchema = z.object({ entry: entrySchema, search: x402DirectoryInputSchema })
const savedToolsSchema = z.strictObject({ version: z.literal(1), items: z.array(savedToolSchema).max(DIRECTORY_SAVED_TOOLS_LIMIT) })
const DirectorySavedToolsContext = createContext<SavedToolsContextValue | undefined>(undefined)

function parseSavedTools(raw: string | null): readonly SavedDirectoryTool[] {
  if (raw === null) return []
  if (new TextEncoder().encode(raw).byteLength > MAX_STORAGE_BYTES) throw new Error('saved_tools_too_large')
  const parsed = savedToolsSchema.parse(JSON.parse(raw))
  const resources = new Set<string>()
  return parsed.items.filter(({ entry }) => {
    if (resources.has(entry.resource)) return false
    resources.add(entry.resource)
    return true
  })
}

/** Browser-local references and public source snapshots; never Call input or connection data. */
export function DirectorySavedToolsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [savedTools, setSavedTools] = useState<readonly SavedDirectoryTool[]>([])
  const currentTools = useRef<readonly SavedDirectoryTool[]>([])
  const ready = useRef(false)
  const persistenceAllowed = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  const [storageState, setStorageState] = useState<StorageState>('checking')
  const [saveError, setSaveError] = useState<string>()

  useEffect(() => {
    function readStorage() {
      try {
        const loaded = parseSavedTools(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY))
        persistenceAllowed.current = true
        currentTools.current = loaded
        setSavedTools(loaded)
        setStorageState('browser')
        setSaveError(undefined)
      } catch (cause) {
        // Preserve the saved document. Corruption, unavailable storage and an
        // unsupported version must never trigger the upstream initial wipe.
        captureRouteException(cause, { site: 'readStorage' }, 'warning')
        persistenceAllowed.current = false
        setStorageState('session')
        setSaveError(STORAGE_READ_ERROR)
      }
      ready.current = true
      setHydrated(true)
    }
    readStorage()
    const onStorage = (event: StorageEvent) => {
      if (event.key === DIRECTORY_SAVED_TOOLS_STORAGE_KEY || event.key === null) readStorage()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const toggleSavedTool = useCallback((tool: SavedDirectoryTool) => {
    if (!ready.current) return
    const existing = currentTools.current.some(({ entry }) => entry.resource === tool.entry.resource)
    let latest = currentTools.current
    if (persistenceAllowed.current) {
      try {
        // A storage event may still be queued. Apply the visible Save/Remove
        // intent to the latest document instead of overwriting another tab's saves.
        latest = parseSavedTools(window.localStorage.getItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY))
      } catch (cause) {
        captureRouteException(cause, { site: 'toggleSavedTool' }, 'warning')
        persistenceAllowed.current = false
        setStorageState('session')
        setSaveError(STORAGE_READ_ERROR)
      }
    }
    let next: readonly SavedDirectoryTool[]
    if (existing) {
      next = latest.filter(({ entry }) => entry.resource !== tool.entry.resource)
    } else if (latest.some(({ entry }) => entry.resource === tool.entry.resource)) {
      next = latest
    } else {
      // Route state can contain view/comparison fields. Persist only the
      // canonical discovery inputs needed to re-resolve this observation.
      const { query, offset, network, provider, maxUsdPrice } = tool.search
      const parsed = savedToolSchema.safeParse({ entry: tool.entry, search: {
        ...(query === undefined ? {} : { query }), ...(offset === undefined ? {} : { offset }),
        ...(network === undefined ? {} : { network }), ...(provider === undefined ? {} : { provider }),
        ...(maxUsdPrice === undefined ? {} : { maxUsdPrice }),
      } })
      if (!parsed.success) { setSaveError('This Tool has too much or unsupported source metadata to save in this browser.'); return }
      if (latest.length >= DIRECTORY_SAVED_TOOLS_LIMIT) {
        setSaveError('You can save up to 100 Tools in this browser. Remove a saved Tool before adding another.')
        return
      }
      next = [...latest, parsed.data]
    }
    const serialized = JSON.stringify({ version: 1, items: next })
    if (new TextEncoder().encode(serialized).byteLength > MAX_STORAGE_BYTES) {
      setSaveError('Saved Tools have reached this browser’s size limit. Remove a saved Tool before adding another.')
      return
    }
    currentTools.current = next
    setSavedTools(next)
    // Failed reads must never be repaired implicitly by the next Save click.
    // A later valid storage event can restore browser persistence.
    if (!persistenceAllowed.current) return
    try {
      window.localStorage.setItem(DIRECTORY_SAVED_TOOLS_STORAGE_KEY, serialized)
      setStorageState('browser')
      setSaveError(undefined)
    } catch (cause) {
      captureRouteException(cause, { site: 'persistSavedTools' }, 'warning')
      persistenceAllowed.current = false
      setStorageState('session')
      setSaveError('Browser storage is unavailable or full. Changes to saved Tools will last for this session only.')
    }
  }, [])

  const value = useMemo<SavedToolsContextValue>(() => ({
    savedTools, toggleSavedTool, isSaved: (resource) => savedTools.some(({ entry }) => entry.resource === resource),
    hydrated, storageState, ...(saveError === undefined ? {} : { saveError }),
  }), [savedTools, toggleSavedTool, hydrated, storageState, saveError])

  return <DirectorySavedToolsContext.Provider value={value}>{children}</DirectorySavedToolsContext.Provider>
}

export function useDirectorySavedTools(): SavedToolsContextValue {
  const context = useContext(DirectorySavedToolsContext)
  if (context === undefined) throw new Error('useDirectorySavedTools must be used within DirectorySavedToolsProvider')
  return context
}
