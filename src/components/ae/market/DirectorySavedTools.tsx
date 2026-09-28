'use client'

import { useAuth } from '@clerk/tanstack-react-start'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { degrade } from '@/lib/observability/degrade'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { SavedToolsContextValue, SavedToolsLoadState, SavedToolsWriteError } from '@/modules/market/directory-card.view-model'
import type { SavedDirectoryTool, SavedToolIdentity, SavedToolListItem, SavedToolSaveInput } from '@/modules/market/saved-tools.contracts'
import { listSavedToolsForOwner, removeToolForOwner, saveToolForOwner } from '@/modules/market/market.functions'

const DirectorySavedToolsContext = createContext<SavedToolsContextValue | undefined>(undefined)
const EMPTY_SAVED_TOOLS: readonly SavedToolListItem[] = []

function savedKey(identity: SavedToolSaveInput): string {
  return identity.kind === 'ae_callable' ? identity.toolRef : 'id' in identity ? identity.id : identity.resource
}

/** Current owner membership includes the same compact Coinbase identity exposed by mixed search. */
function savedIdentityLookup(items: readonly SavedToolListItem[]): ReadonlyMap<string, SavedToolIdentity> {
  const lookup = new Map<string, SavedToolIdentity>()
  for (const item of items) {
    lookup.set(savedKey(item.identity), item.identity)
    if (item.identity.kind === 'external_listing') {
      lookup.set(`registry:${canonicalDigest({ source: 'coinbase', resource: item.identity.resource }).slice(7)}`, item.identity)
    }
  }
  return lookup
}

function entryIdentity(tool: SavedDirectoryTool): SavedToolSaveInput {
  return tool.entry.choice?.toolRef !== undefined && tool.entry.choice.access !== 'external_listing'
    ? { kind: 'ae_callable', toolRef: tool.entry.choice.toolRef }
    : { kind: 'external_listing', resource: tool.entry.resource }
}

export function DirectorySavedToolsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { isLoaded, isSignedIn, userId } = useAuth()
  const owner = isLoaded && isSignedIn && userId ? userId : undefined
  const [loaded, setLoaded] = useState<SavedToolsLoadState>()
  const [saveError, setSaveError] = useState<SavedToolsWriteError>()
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(new Set())
  const inFlight = useRef(new Set<string>())
  const generation = useRef(0)
  const currentOwner = useRef(owner)

  const refresh = useCallback(() => {
    if (owner === undefined || currentOwner.current !== owner) return
    const id = ++generation.current
    void listSavedToolsForOwner().then(result => {
      if (id !== generation.current || currentOwner.current !== owner) return
      setLoaded(result.kind === 'available'
        ? { owner, items: result.items, status: 'ready' }
        : { owner, items: [], status: 'failed', error: result.code === 'unauthenticated' ? 'Sign in to see Saved Tools.' : 'Saved Tools could not be loaded. Try again.' })
    }).catch(cause => {
      if (id === generation.current && currentOwner.current === owner) {
        degrade(cause, undefined, { site: 'DirectorySavedToolsProvider.refresh', reason: 'source_unavailable' })
        setLoaded({ owner, items: [], status: 'failed', error: 'Saved Tools could not be loaded. Try again.' })
      }
    })
  }, [owner])

  useEffect(() => {
    currentOwner.current = owner
    if (owner === undefined) {
      ++generation.current
      return
    }
    refresh()
  }, [owner, refresh])

  const savedTools = loaded !== undefined && loaded.owner === owner && loaded.status === 'ready' ? loaded.items : EMPTY_SAVED_TOOLS
  const identities = useMemo(() => savedIdentityLookup(savedTools), [savedTools])
  const status = !isLoaded ? 'loading' : owner === undefined ? 'signed_out' : loaded?.owner !== owner ? 'loading' : loaded.status
  const toggleIdentity = useCallback((identity: SavedToolSaveInput) => {
    if (owner === undefined || status !== 'ready') return
    const key = `${owner}:${savedKey(identity)}`
    if (inFlight.current.has(key)) return
    inFlight.current.add(key)
    setPendingKeys(previous => new Set(previous).add(key))
    setSaveError(undefined)
    const existing = identities.get(savedKey(identity))
    const action = existing === undefined ? saveToolForOwner({ data: identity }) : removeToolForOwner({ data: existing })
    void action.then(result => {
      if (result.kind === 'refused' || result.kind === 'error') {
        setSaveError({ owner, message: result.code === 'limit_reached' ? 'You can save up to 100 Tools. Remove one to make space.'
          : result.code === 'not_found' ? 'This Tool is no longer available. Search again for a current Tool.'
            : result.code === 'unauthenticated' ? 'Sign in to save Tools.' : 'Saved Tools could not be changed. Try again.' })
        return
      }
      if (currentOwner.current === owner) refresh()
    }).catch(cause => {
      degrade(cause, undefined, { site: 'DirectorySavedToolsProvider.toggleIdentity', reason: 'source_unavailable' })
      setSaveError({ owner, message: 'Saved Tools could not be changed. Try again.' })
    })
      .finally(() => {
        inFlight.current.delete(key)
        setPendingKeys(previous => { const next = new Set(previous); next.delete(key); return next })
      })
  }, [owner, refresh, identities, status])

  const visibleError = saveError !== undefined && saveError.owner === owner ? saveError.message : loaded !== undefined && loaded.owner === owner ? loaded.error : undefined
  const value = useMemo<SavedToolsContextValue>(() => ({
    savedTools,
    toggleIdentity,
    toggleSavedTool: tool => toggleIdentity(entryIdentity(tool)),
    isSavedIdentity: identity => identities.has(savedKey(identity)),
    isSavedTool: tool => identities.has(savedKey(entryIdentity(tool))),
    pending: identity => owner !== undefined && pendingKeys.has(`${owner}:${savedKey(identity)}`),
    status,
    refresh,
    ...(visibleError === undefined ? {} : { saveError: visibleError }),
  }), [savedTools, toggleIdentity, identities, pendingKeys, status, refresh, owner, visibleError])

  return <DirectorySavedToolsContext.Provider value={value}>{children}</DirectorySavedToolsContext.Provider>
}

export function useDirectorySavedTools(): SavedToolsContextValue {
  const context = useContext(DirectorySavedToolsContext)
  if (context === undefined) throw new Error('useDirectorySavedTools must be used within DirectorySavedToolsProvider')
  return context
}
