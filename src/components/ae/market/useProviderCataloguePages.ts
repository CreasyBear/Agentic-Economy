import { useCallback, useEffect, useRef, useState } from 'react'

import { absorbProviderEntries, DIRECTORY_LIST_PAGE_SIZE } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryCatalogue, X402DirectoryCatalogueInput } from '@/modules/market/x402-directory-catalogue'
import { readX402DirectoryCatalogueServer } from '@/modules/market/x402-directory-index.functions'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

type ProviderGroup = { provider: string; tools: X402DirectoryEntry[] }
type ProviderPage = { groups: ProviderGroup[]; isDone: boolean }
type ProviderPagesState = {
  source: X402DirectoryCatalogue | undefined
  pages: ProviderPage[]
  index: number
  status: 'idle' | 'loading' | 'failed'
  rest: X402DirectoryEntry[]
  cursor: string | undefined
  streamDone: boolean
}

const PROVIDER_PAGE_FETCH_CAP = 4

function providerPageHasNext(groups: readonly ProviderGroup[], rest: readonly X402DirectoryEntry[], seen: ReadonlySet<string>, streamDone: boolean, cursor: string | undefined): boolean {
  if (rest.some(entry => !seen.has(entry.provider) && !groups.some(group => group.provider === entry.provider))) return true
  return !streamDone && cursor !== undefined
}

function initialProviderPages(enabled: boolean, catalogue: X402DirectoryCatalogue | undefined): ProviderPagesState {
  if (!enabled || catalogue?.kind !== 'ok' || catalogue.source !== 'index') {
    return { source: catalogue, pages: [], index: 0, status: 'idle', rest: [], cursor: undefined, streamDone: true }
  }
  const absorbed = absorbProviderEntries(catalogue.page.items, [], new Set())
  const hasNext = providerPageHasNext(absorbed.groups, absorbed.rest, new Set(), catalogue.isDone, catalogue.indexCursor)
  const settled = absorbed.groups.length >= DIRECTORY_LIST_PAGE_SIZE || !hasNext
  return {
    source: catalogue,
    pages: [{ groups: absorbed.groups, isDone: !hasNext }],
    index: 0,
    status: settled ? 'idle' : 'loading',
    rest: absorbed.rest,
    cursor: catalogue.indexCursor,
    streamDone: catalogue.isDone,
  }
}

async function extendProviderPage(
  start: { groups: readonly ProviderGroup[]; rest: readonly X402DirectoryEntry[]; cursor: string | undefined; streamDone: boolean; seen: ReadonlySet<string> },
  filters: X402DirectoryCatalogueInput,
): Promise<{ groups: ProviderGroup[]; rest: X402DirectoryEntry[]; cursor: string | undefined; streamDone: boolean }> {
  let groups = start.groups.map(group => ({ provider: group.provider, tools: [...group.tools] }))
  let rest = [...start.rest]
  let cursor = start.cursor
  let streamDone = start.streamDone
  let fetches = 0
  while (groups.length < DIRECTORY_LIST_PAGE_SIZE && fetches < PROVIDER_PAGE_FETCH_CAP) {
    if (rest.length === 0) {
      if (streamDone || cursor === undefined) break
      fetches += 1
      const { indexCursor: _indexCursor, offset: _offset, ...query } = filters
      const result = await readX402DirectoryCatalogueServer({ data: { ...query, indexCursor: cursor } })
      if (result.kind !== 'ok' || result.source !== 'index') throw new Error('provider_page_unavailable')
      rest = [...result.page.items]
      cursor = result.indexCursor
      streamDone = result.isDone
    }
    const absorbed = absorbProviderEntries(rest, groups, start.seen)
    if (absorbed.groups.length === groups.length && absorbed.rest.length === rest.length) break
    groups = absorbed.groups
    rest = absorbed.rest
    if (groups.length >= DIRECTORY_LIST_PAGE_SIZE) break
  }
  return { groups, rest, cursor, streamDone }
}

function hostsBefore(pages: readonly ProviderPage[], index: number): Set<string> {
  return new Set(pages.filter((_, pageIndex) => pageIndex !== index).flatMap(page => page.groups.map(group => group.provider)))
}

/** Providers paginate by host. A page keeps reading the sorted Tool list until it has 12 hosts, or the list ends. */
export function useProviderCataloguePages(enabled: boolean, catalogue: X402DirectoryCatalogue | undefined, filters: X402DirectoryCatalogueInput, requestedPage = 1) {
  const filtersRef = useRef(filters)
  const generation = useRef(0)
  const lastCompleted = useRef<ProviderPagesState | undefined>(undefined)
  const [state, setState] = useState(() => initialProviderPages(enabled, catalogue))
  useEffect(() => { filtersRef.current = filters }, [filters])

  const [walkTarget, setWalkTarget] = useState(requestedPage)
  const catalogueIdentity = useRef(catalogue)
  useEffect(() => {
    if (catalogueIdentity.current !== catalogue) {
      catalogueIdentity.current = catalogue
      setWalkTarget(1)
      return
    }
    setWalkTarget(requestedPage)
  }, [catalogue, requestedPage])
  useEffect(() => {
    const nextGeneration = generation.current + 1
    generation.current = nextGeneration
    const cached = lastCompleted.current
    const started = enabled && cached !== undefined && cached.source === catalogue
      ? { ...cached, index: Math.max(0, Math.min(requestedPage - 1, cached.pages.length - 1)) }
      : initialProviderPages(enabled, catalogue)
    setState(started)
    if (started.status !== 'loading') return
    let cancelled = false
    const page = started.pages[0]
    void extendProviderPage({
      groups: page?.groups ?? [],
      rest: started.rest,
      cursor: started.cursor,
      streamDone: started.streamDone,
      seen: new Set(),
    }, filtersRef.current).then(extended => {
      if (cancelled || generation.current !== nextGeneration) return
      const hasNext = providerPageHasNext(extended.groups, extended.rest, new Set(), extended.streamDone, extended.cursor)
      setState(current => current.source !== started.source ? current : {
        ...current,
        pages: [{ groups: extended.groups, isDone: !hasNext }],
        status: 'idle',
        rest: extended.rest,
        cursor: extended.cursor,
        streamDone: extended.streamDone,
      })
    }).catch(() => {
      if (cancelled || generation.current !== nextGeneration) return
      setState(current => current.source === started.source && current.status === 'loading' ? { ...current, status: 'failed' } : current)
    })
    return () => { cancelled = true }
    // Page-only changes stay on the existing walkTarget path; this reset reads the latest requested page on source/enable changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, catalogue])

  useEffect(() => {
    if (
      enabled && state.pages.length > 0 && state.source === catalogue &&
      catalogue?.kind === 'ok' && catalogue.source === 'index' && state.status === 'idle'
    ) {
      lastCompleted.current = state
    }
  }, [enabled, state, catalogue])

  function showPreviousPage() {
    setState(current => current.index === 0 || current.status === 'loading' ? current : { ...current, index: current.index - 1, status: 'idle' })
  }

  const loadNextPage = useCallback(async () => {
    if (state.status === 'loading') return
    const nextIndex = state.index + 1
    if (nextIndex < state.pages.length) {
      setState(current => ({ ...current, index: nextIndex, status: 'idle' }))
      return
    }
    const currentPage = state.pages[state.index]
    if (currentPage?.isDone === true) return
    const generationAtStart = generation.current
    const source = state.source
    const index = state.index
    const fillingCurrent = currentPage !== undefined && currentPage.groups.length < DIRECTORY_LIST_PAGE_SIZE
    setState(current => current.source === source && current.index === index ? { ...current, status: 'loading' } : current)
    try {
      const extended = await extendProviderPage({
        groups: fillingCurrent ? currentPage.groups : [],
        rest: state.rest,
        cursor: state.cursor,
        streamDone: state.streamDone,
        seen: hostsBefore(state.pages, fillingCurrent ? index : state.pages.length),
      }, filtersRef.current)
      if (generation.current !== generationAtStart) return
      setState(current => {
        if (current.source !== source || current.index !== index) return current
        const seen = hostsBefore(current.pages, fillingCurrent ? index : current.pages.length)
        const hasNext = providerPageHasNext(extended.groups, extended.rest, seen, extended.streamDone, extended.cursor)
        const page = { groups: extended.groups, isDone: !hasNext }
        const pages = fillingCurrent
          ? current.pages.map((existing, pageIndex) => pageIndex === index ? page : existing)
          : [...current.pages, page]
        return {
          ...current,
          pages,
          index: fillingCurrent ? index : pages.length - 1,
          status: 'idle',
          rest: extended.rest,
          cursor: extended.cursor,
          streamDone: extended.streamDone,
        }
      })
    } catch {
      if (generation.current !== generationAtStart) return
      setState(current => current.source === source && current.index === index ? { ...current, status: 'failed' } : current)
    }
  }, [state])

  useEffect(() => {
    if (!enabled) return
    const target = walkTarget - 1
    if (target < 0 || state.pages.length === 0 || state.status === 'loading' || target < state.pages.length) return
    if (state.status === 'failed' || state.pages.at(-1)?.isDone === true) return
    void loadNextPage()
  }, [enabled, walkTarget, state.pages, state.status, loadNextPage])

  const current = state.pages[state.index]
  return {
    items: current?.groups.flatMap(group => group.tools) ?? [],
    isDone: current?.isDone ?? true,
    status: state.status,
    hasPrevious: state.index > 0,
    pageNumber: state.pages.length === 0 ? 0 : state.index + 1,
    loadedCount: state.pages.length,
    loadNextPage,
    showPreviousPage,
  }
}
