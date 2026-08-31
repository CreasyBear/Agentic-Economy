'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

import { SearchIcon } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  formatOperationAuthentication,
  formatOperationPrice,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'

import {
  OPERATION_SEARCH_RESULT_LIMIT,
  searchMarketOperations,
  type MarketOperationSearchInput,
  type OperationChoiceSearchResult,
} from '../market-operations-client'
import { useRecentOperationRefs } from '../recent-operations'

type SearchState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed'; message: string }>
  | Readonly<{ kind: 'done'; result: OperationChoiceSearchResult; query: string }>

/** Production debounce for catalog keystrokes. */
export const OPERATIONS_SEARCH_DEBOUNCE_MS = 200

type OperationsSearchPageProps = Readonly<{
  isActive?: boolean
  query: string
  onQueryChange: (query: string) => void
  onSelectOperation: (operationRef: string) => void
  searchOperations?: (
    input: MarketOperationSearchInput,
  ) => Promise<OperationChoiceSearchResult>
}>

/**
 * Root layer of the command panel: a debounced, keyboard-navigable search
 * over the public operation market. The list is an honest projection of the
 * live endpoint — no local filtering, no invented results.
 */
export function OperationsSearchPage({
  isActive = true,
  query,
  onQueryChange,
  onSelectOperation,
  searchOperations = searchMarketOperations,
}: OperationsSearchPageProps) {
  const trimmedQuery = query.trim()
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const recentOperationRefs = useRecentOperationRefs()
  const [selectedId, setSelectedId] = useState(0)
  const selectedIdRef = useRef(0)
  const pendingActivationRef = useRef(false)
  const pendingQueryRef = useRef<string | null>(null)
  const latestLiveQueryRef = useRef(trimmedQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const generatedListboxId = useId()
  const listboxId = `ae-command-panel-results${generatedListboxId}`
  const items = state.kind === 'done' && state.query === trimmedQuery && state.result.kind === 'ok'
    ? state.result.items
    : []
  const choices = trimmedQuery === ''
    ? recentOperationRefs.map((operationRef) => ({ kind: 'recent' as const, operationRef }))
    : items.map((item) => ({ kind: 'result' as const, item }))
  const isAwaitingChoices = trimmedQuery !== '' && choices.length === 0 && (
    state.kind === 'idle'
    || state.kind === 'loading'
    || (state.kind === 'done' && state.query !== trimmedQuery)
  )

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setState({ kind: 'idle' })
      return
    }

    let current = true
    setState({ kind: 'loading' })
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await searchOperations({
            query: trimmed,
            limit: OPERATION_SEARCH_RESULT_LIMIT,
          })
          if (!current) return
          setState({ kind: 'done', result, query: trimmed })
        } catch (error) {
          if (!current) return
          setState({
            kind: 'failed',
            message:
              error instanceof Error && error.message === 'catalog_search_result_invalid'
                ? 'The catalog returned something unreadable. Try again.'
                : 'The catalog is temporarily unavailable. Try again.',
          })
        }
      })()
    }, OPERATIONS_SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchOperations])

  useEffect(() => {
    // Input events reset synchronously. An older rendered query may commit its
    // effect after a newer keystroke; never let that stale effect erase the
    // newer query's pending keyboard intent. Empty is the external Escape/
    // clear boundary and must always reset.
    if (trimmedQuery !== '' && trimmedQuery !== latestLiveQueryRef.current) return
    latestLiveQueryRef.current = trimmedQuery
    if (pendingQueryRef.current === trimmedQuery) return
    pendingQueryRef.current = null
    pendingActivationRef.current = false
    selectedIdRef.current = 0
    setSelectedId(0)
  }, [trimmedQuery])

  useEffect(() => {
    if (!isActive) {
      pendingQueryRef.current = null
      pendingActivationRef.current = false
      return
    }
    if (state.kind === 'failed') {
      if (pendingQueryRef.current === trimmedQuery) {
        pendingQueryRef.current = null
        pendingActivationRef.current = false
      }
      return
    }
    if (state.kind !== 'done' || state.query !== trimmedQuery) return
    if (state.result.kind !== 'ok' || state.result.items.length === 0) {
      if (pendingQueryRef.current === trimmedQuery) {
        pendingQueryRef.current = null
        pendingActivationRef.current = false
      }
      return
    }

    const nextId = Math.min(state.result.items.length - 1, selectedIdRef.current)
    selectId(nextId)
    const activate = pendingQueryRef.current === trimmedQuery && pendingActivationRef.current
    pendingQueryRef.current = null
    pendingActivationRef.current = false
    if (!activate) return
    const selected = state.result.items[nextId]
    if (selected !== undefined) onSelectOperation(selected.operationRef)
  }, [isActive, onSelectOperation, state, trimmedQuery])

  useEffect(() => {
    if (isActive) inputRef.current?.focus()
  }, [isActive])

  useEffect(() => {
    const listbox = listboxRef.current
    if (listbox === null) return
    const activeOption = listbox.querySelector('[aria-selected="true"]')
    if (
      activeOption instanceof HTMLElement &&
      typeof activeOption.scrollIntoView === 'function'
    ) {
      activeOption.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedId])

  function moveSelection(delta: number, choiceCount: number): void {
    const nextId = Math.max(0, selectedIdRef.current + delta)
    selectId(choiceCount === 0 ? nextId : Math.min(choiceCount - 1, nextId))
  }
  function selectId(nextId: number): void {
    selectedIdRef.current = nextId
    setSelectedId(nextId)
  }
  function consumeNavigationKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
  }
  function preparePendingIntent(liveQuery: string): void {
    if (pendingQueryRef.current === liveQuery) return
    pendingQueryRef.current = liveQuery
    pendingActivationRef.current = false
    selectId(0)
  }
  function handleQueryInputChange(nextQuery: string): void {
    latestLiveQueryRef.current = nextQuery.trim()
    pendingQueryRef.current = null
    pendingActivationRef.current = false
    selectId(0)
    onQueryChange(nextQuery)
  }
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const liveQuery = inputRef.current?.value.trim() ?? trimmedQuery
    const choicesMatchLiveQuery = liveQuery === trimmedQuery
    const liveChoices = choicesMatchLiveQuery ? choices : []
    const awaitingLiveChoices = liveQuery !== '' && (
      !choicesMatchLiveQuery
      || isAwaitingChoices
    )
    switch (event.key) {
      case 'ArrowDown': {
        if (liveChoices.length === 0 && !awaitingLiveChoices) return
        consumeNavigationKey(event)
        if (liveChoices.length === 0) preparePendingIntent(liveQuery)
        moveSelection(1, liveChoices.length)
        break
      }
      case 'ArrowUp': {
        if (liveChoices.length === 0 && !awaitingLiveChoices) return
        consumeNavigationKey(event)
        if (liveChoices.length === 0) preparePendingIntent(liveQuery)
        moveSelection(-1, liveChoices.length)
        break
      }
      case 'Home': {
        if (liveChoices.length === 0 && !awaitingLiveChoices) return
        consumeNavigationKey(event)
        if (liveChoices.length === 0) preparePendingIntent(liveQuery)
        selectId(0)
        break
      }
      case 'End':
        if (liveChoices.length === 0) return
        consumeNavigationKey(event)
        selectId(liveChoices.length - 1)
        break
      case 'Enter': {
        if (liveChoices.length === 0) {
          if (!awaitingLiveChoices) return
          consumeNavigationKey(event)
          preparePendingIntent(liveQuery)
          pendingActivationRef.current = true
          return
        }
        consumeNavigationKey(event)
        pendingQueryRef.current = null
        pendingActivationRef.current = false
        const selected = liveChoices[selectedIdRef.current]
        if (selected?.kind === 'recent') onSelectOperation(selected.operationRef)
        if (selected?.kind === 'result') onSelectOperation(selected.item.operationRef)
        break
      }
      default:
        break
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col outline-none" onKeyDown={handleKeyDown}>
      <div className="border-b border-border p-intra">
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-intra top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={choices.length > 0}
            aria-controls={choices.length > 0 ? listboxId : undefined}
            aria-activedescendant={choices.length > 0 ? optionId(listboxId, selectedId) : undefined}
            aria-label="Search operations"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Search operations…"
            className="ps-10"
            value={query}
            onChange={(event) => handleQueryInputChange(event.target.value)}
          />
        </div>
      </div>
      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
        {renderBody(state, query, recentOperationRefs.length, handleQueryInputChange)}
        {choices.length > 0 ? (
          <ul
            id={listboxId}
            ref={listboxRef}
            role="listbox"
            aria-label={query.trim() === '' ? 'Recently inspected operations' : 'Matching operations'}
            className="py-intra"
          >
            {choices.map((choice, index) => {
              const operationRef = choice.kind === 'recent' ? choice.operationRef : choice.item.operationRef
              return (
                <li key={operationRef}>
                  <button
                    type="button"
                    role="option"
                    id={optionId(listboxId, index)}
                    aria-selected={index === selectedId}
                    tabIndex={-1}
                    onClick={() => {
                      pendingQueryRef.current = null
                      pendingActivationRef.current = false
                      onSelectOperation(operationRef)
                    }}
                    onMouseMove={() => selectId(index)}
                    className={cn(
                      'flex w-full items-center gap-intra px-gutter py-intra text-start transition-colors hover:bg-muted focus-visible:bg-muted',
                      index === selectedId && 'bg-muted',
                    )}
                  >
                    {choice.kind === 'recent' ? (
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="text-sm font-medium text-foreground">Inspect recent Operation</span>
                        <span dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
                          {choice.operationRef}
                        </span>
                      </span>
                    ) : (
                      <>
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate text-sm font-medium text-foreground">{choice.item.title}</span>
                          <span className="truncate font-mono text-xs text-muted-foreground">
                            {choice.item.supplier.name} · {choice.item.capabilityId}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {formatOperationReadiness(choice.item.availability.posture)} · {formatOperationAuthentication(choice.item.authentication)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          {formatOperationPrice(choice.item.price)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function optionId(listboxId: string, index: number): string {
  return `${listboxId}-option-${index}`
}

function renderBody(
  state: SearchState,
  query: string,
  recentCount: number,
  onQueryChange: (query: string) => void,
): ReactNode {
  if (state.kind === 'idle') {
    return (
      <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
        {recentCount > 0
          ? `Recently inspected · ${recentCount}`
          : 'Search the operation catalog by job, provider, or capability.'}
      </p>
    )
  }
  if (state.kind === 'loading') {
    return (
      <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
        Searching…
      </p>
    )
  }
  if (state.kind === 'failed') {
    return (
      <p role="alert" className="px-gutter py-section text-sm text-foreground">
        {state.message}
      </p>
    )
  }
  if (state.result.kind === 'unavailable') {
    return (
      <SearchRecovery
        message="This search could not run. Try different wording or browse the current catalogue."
        onClear={() => onQueryChange('')}
      />
    )
  }
  if (state.result.kind !== 'ok') {
    return (
      <SearchRecovery message={`No Operations matched “${query}”.`} onClear={() => onQueryChange('')} />
    )
  }
  if (state.result.items.length === 0) {
    return (
      <SearchRecovery message={`No Operations matched “${query}”.`} onClear={() => onQueryChange('')} />
    )
  }
  return (
    <p className="border-b border-border px-gutter py-intra text-xs text-muted-foreground">
      {state.result.matchedCount} matched · showing {state.result.items.length}
    </p>
  )
}

function SearchRecovery({ message, onClear }: Readonly<{ message: string; onClear: () => void }>) {
  return (
    <div className="grid gap-intra px-gutter py-section">
      <p role="status" className="text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap gap-intra">
        <button
          type="button"
          onClick={onClear}
          className="min-h-touch rounded-md border border-border px-intra text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Clear search
        </button>
        <a
          href="/market?window=30d#operations"
          className="inline-flex min-h-touch items-center rounded-md bg-primary px-intra text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Browse current Operations
        </a>
      </div>
    </div>
  )
}
