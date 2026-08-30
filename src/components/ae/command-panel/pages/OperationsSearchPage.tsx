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
  onSelectOperation,
  searchOperations = searchMarketOperations,
}: OperationsSearchPageProps) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const recentOperationRefs = useRecentOperationRefs()
  const [selectedId, setSelectedId] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxRef = useRef<HTMLUListElement>(null)
  const generatedListboxId = useId()
  const listboxId = `ae-command-panel-results${generatedListboxId}`
  const items = state.kind === 'done' && state.result.kind === 'ok' ? state.result.items : []
  const choices = query.trim() === ''
    ? recentOperationRefs.map((operationRef) => ({ kind: 'recent' as const, operationRef }))
    : items.map((item) => ({ kind: 'result' as const, item }))

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
    setSelectedId(0)
  }, [state])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

  function moveSelection(delta: number): void {
    if (choices.length === 0) return
    setSelectedId((current) => Math.min(choices.length - 1, Math.max(0, current + delta)))
  }
  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (choices.length === 0 && event.key !== 'Enter') return
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveSelection(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveSelection(-1)
        break
      case 'Home':
        event.preventDefault()
        setSelectedId(0)
        break
      case 'End':
        event.preventDefault()
        if (choices.length > 0) setSelectedId(choices.length - 1)
        break
      case 'Enter': {
        event.preventDefault()
        const selected = choices[selectedId]
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
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div aria-live="polite" className="min-h-0 flex-1 overflow-y-auto">
        {renderBody(state, query, recentOperationRefs.length)}
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
                    onClick={() => onSelectOperation(operationRef)}
                    onMouseMove={() => setSelectedId(index)}
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

function renderBody(state: SearchState, query: string, recentCount: number): ReactNode {
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
      <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
        The catalog declined this search. Try different wording.
      </p>
    )
  }
  if (state.result.kind !== 'ok') {
    return (
      <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
        No operations matched “{query}”.
      </p>
    )
  }
  if (state.result.items.length === 0) {
    return (
      <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
        No operations matched “{query}”.
      </p>
    )
  }
  return (
    <p className="border-b border-border px-gutter py-intra text-xs text-muted-foreground">
      {state.result.matchedCount} matched · showing {state.result.items.length}
    </p>
  )
}
