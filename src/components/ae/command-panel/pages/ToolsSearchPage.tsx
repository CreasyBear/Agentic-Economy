'use client'

import { ToolPriceText } from "@/components/ae/market/AeToolPrice"

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  TOOL_SEARCH_RESULT_LIMIT,
  searchMarketTools,
  type MarketToolSearchInput,
  type ToolChoiceSearchResult,
} from '../market-tools-client'
import { useRecentToolRefs } from '../recent-tools'

type SearchState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'failed'; message: string }>
  | Readonly<{ kind: 'done'; result: ToolChoiceSearchResult; query: string }>

type PendingSelectionIntent = Readonly<{
  query: string
  edge: 'start' | 'end'
  offset: number
  activate: boolean
}>

/** Production debounce for catalog keystrokes. */
export const TOOLS_SEARCH_DEBOUNCE_MS = 200
const NO_MOUNTED_CHOICE_VALUE = '__ae_no_mounted_choice__'

type ToolsSearchPageProps = Readonly<{
  isActive?: boolean
  query: string
  onQueryChange: (query: string) => void
  onSelectTool: (toolRef: string) => void
  searchTools?: (
    input: MarketToolSearchInput,
  ) => Promise<ToolChoiceSearchResult>
}>

/**
 * Root layer of the command panel: a debounced, keyboard-navigable search
 * over the public Tool market. The list is an honest projection of the
 * live endpoint — no local filtering, no invented results.
 */
export function ToolsSearchPage({
  isActive = true,
  query,
  onQueryChange,
  onSelectTool,
  searchTools = searchMarketTools,
}: ToolsSearchPageProps) {
  const trimmedQuery = query.trim()
  const [state, setState] = useState<SearchState>({ kind: 'idle' })
  const [searchAttempt, setSearchAttempt] = useState(0)
  const recentToolRefs = useRecentToolRefs()
  const [selectedValue, setSelectedValue] = useState('')
  const selectedValueRef = useRef('')
  const pendingSelectionIntentRef = useRef<PendingSelectionIntent | null>(null)
  const latestLiveQueryRef = useRef(trimmedQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = state.kind === 'done' && state.query === trimmedQuery && state.result.kind === 'ok'
    ? state.result.items
    : []
  const choices = trimmedQuery === ''
    ? recentToolRefs.map((toolRef) => ({ kind: 'recent' as const, toolRef }))
    : items.map((item) => ({ kind: 'result' as const, item }))
  const isAwaitingChoices = trimmedQuery !== '' && choices.length === 0 && (
    state.kind === 'idle'
    || state.kind === 'loading'
    || (state.kind === 'done' && state.query !== trimmedQuery)
  )
  const choiceValues = choices.map((choice) => (
    choice.kind === 'recent' ? choice.toolRef : choice.item.toolRef
  ))
  const choiceValuesKey = choiceValues.join('\u001f')

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
          const result = await searchTools({
            query: trimmed,
            limit: TOOL_SEARCH_RESULT_LIMIT,
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
    }, TOOLS_SEARCH_DEBOUNCE_MS)

    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchAttempt, searchTools])

  useEffect(() => {
    // Input events reset synchronously. An older rendered query may commit its
    // effect after a newer keystroke; never let that stale effect erase the
    // newer query's pending keyboard intent. Empty is the external Escape/
    // clear boundary and must always reset.
    if (trimmedQuery !== '' && trimmedQuery !== latestLiveQueryRef.current) return
    latestLiveQueryRef.current = trimmedQuery
    if (pendingSelectionIntentRef.current?.query === trimmedQuery) return
    pendingSelectionIntentRef.current = null
  }, [trimmedQuery])

  useEffect(() => {
    if (!isActive) {
      pendingSelectionIntentRef.current = null
      return
    }
    if (state.kind === 'failed') {
      if (pendingSelectionIntentRef.current?.query === trimmedQuery) {
        pendingSelectionIntentRef.current = null
      }
      return
    }
    if (state.kind !== 'done' || state.query !== trimmedQuery) return
    if (state.result.kind !== 'ok' || state.result.items.length === 0) {
      if (pendingSelectionIntentRef.current?.query === trimmedQuery) {
        pendingSelectionIntentRef.current = null
      }
      return
    }

    const intent = pendingSelectionIntentRef.current
    if (intent?.query !== trimmedQuery) return
    const lastIndex = state.result.items.length - 1
    const nextIndex = intent.edge === 'start'
      ? Math.min(lastIndex, intent.offset)
      : Math.max(0, lastIndex - intent.offset)
    const selected = state.result.items[nextIndex]
    pendingSelectionIntentRef.current = null
    if (selected === undefined) return
    selectedValueRef.current = selected.toolRef
    setSelectedValue(selected.toolRef)
    if (!intent.activate) return
    onSelectTool(selected.toolRef)
  }, [isActive, onSelectTool, state, trimmedQuery])

  useEffect(() => {
    if (isActive) inputRef.current?.focus()
  }, [isActive])

  useEffect(() => {
    const nextChoiceValues = choiceValuesKey === '' ? [] : choiceValuesKey.split('\u001f')
    setSelectedValue(() => {
      // Changing the controlled value while no options are mounted keeps
      // cmdk's internal store from auto-selecting the first row of a later
      // authoritative replacement before AE can reconnect a surviving value.
      if (nextChoiceValues.length === 0) return NO_MOUNTED_CHOICE_VALUE
      const nextValue = nextChoiceValues.includes(selectedValueRef.current)
        ? selectedValueRef.current
        : (nextChoiceValues[0] ?? '')
      selectedValueRef.current = nextValue
      return nextValue
    })
  }, [choiceValuesKey])

  function consumeNavigationKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.stopPropagation()
  }
  function preparePendingIntent(liveQuery: string): PendingSelectionIntent {
    const currentIntent = pendingSelectionIntentRef.current
    if (currentIntent?.query === liveQuery) return currentIntent
    const nextIntent: PendingSelectionIntent = {
      query: liveQuery,
      edge: 'start',
      offset: 0,
      activate: false,
    }
    pendingSelectionIntentRef.current = nextIntent
    return nextIntent
  }
  function updatePendingIntent(
    liveQuery: string,
    update: (intent: PendingSelectionIntent) => PendingSelectionIntent,
  ): void {
    pendingSelectionIntentRef.current = update(preparePendingIntent(liveQuery))
  }
  function handleQueryInputChange(nextQuery: string): void {
    latestLiveQueryRef.current = nextQuery.trim()
    pendingSelectionIntentRef.current = null
    onQueryChange(nextQuery)
  }
  function handleSelectedValueChange(nextValue: string): void {
    // cmdk briefly reports an empty value while the prior server result set is
    // unmounted, then proposes the first item while mounting its replacement.
    // Retain a surviving real selection across that replacement; once the new
    // collection has settled, pointer and keyboard changes flow through cmdk.
    if (!choiceValues.includes(nextValue)) return
    selectedValueRef.current = nextValue
    setSelectedValue(nextValue)
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
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          offset: intent.edge === 'start' ? intent.offset + 1 : 0,
        }))
        break
      }
      case 'ArrowUp': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          offset: intent.edge === 'start' ? Math.max(0, intent.offset - 1) : intent.offset + 1,
        }))
        break
      }
      case 'Home': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          edge: 'start',
          offset: 0,
        }))
        break
      }
      case 'End': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({
          ...intent,
          edge: 'end',
          offset: 0,
        }))
        break
      }
      case 'Enter': {
        if (liveChoices.length > 0 || !awaitingLiveChoices) return
        consumeNavigationKey(event)
        updatePendingIntent(liveQuery, (intent) => ({ ...intent, activate: true }))
        break
      }
      default:
        break
    }
  }

  const statusMessage = getStatusMessage(state, trimmedQuery, choices.length)
  const groupHeading = trimmedQuery === ''
    ? `Recently inspected · ${recentToolRefs.length}`
    : state.kind === 'done' && state.query === trimmedQuery && state.result.kind === 'ok'
      ? `${state.result.count} matched · showing ${state.result.items.length}`
      : 'Matching Tools'

  return (
    <Command
      label="Search Tools"
      shouldFilter={false}
      value={selectedValue}
      onValueChange={handleSelectedValueChange}
      onKeyDown={handleKeyDown}
      className="min-h-0 flex-1"
    >
      <CommandInput
        ref={inputRef}
        disabled={!isActive}
        aria-label="Search Tools"
        placeholder="Search Tools…"
        value={query}
        onValueChange={handleQueryInputChange}
      />
      <div role="status" className="sr-only">
        {statusMessage}
      </div>
      <CommandList
        label={trimmedQuery === '' ? 'Recently inspected Tools' : 'Matching Tools'}
        aria-busy={isAwaitingChoices}
        className="min-h-0 max-h-none flex-1 overscroll-contain"
      >
        {choices.length > 0 ? (
          <CommandGroup heading={groupHeading}>
            {choices.map((choice) => {
              const toolRef = choice.kind === 'recent' ? choice.toolRef : choice.item.toolRef
              return (
                <CommandItem
                  key={toolRef}
                  value={toolRef}
                  disabled={!isActive}
                  onSelect={(selectedToolRef) => {
                    pendingSelectionIntentRef.current = null
                    onSelectTool(selectedToolRef)
                  }}
                  className="min-h-touch gap-intra px-gutter py-intra"
                >
                  {choice.kind === 'recent' ? (
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-sm font-medium text-foreground">Inspect recent Tool</span>
                      <span dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
                        {choice.toolRef}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm font-medium text-foreground">{choice.item.title}</span>
                        <span className="truncate font-mono text-xs text-muted-foreground">
                          {choice.item.provider.name} · {choice.item.capabilityId}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {choice.item.healthStatus === 'operational'
                            ? 'Operational'
                            : choice.item.healthStatus === 'degraded'
                              ? 'Degraded'
                              : 'Unverified'}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        <ToolPriceText price={choice.item.priceLabel} {...(choice.item.displayPrice?.kind === 'indicative' ? { validUntil: choice.item.displayPrice.validUntil } : {})} />
                      </span>
                    </>
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : (
          <CommandEmpty>
            <EmptySearchState
              state={state}
              query={query}
              recentCount={recentToolRefs.length}
              onQueryChange={handleQueryInputChange}
              onRetry={() => setSearchAttempt((attempt) => attempt + 1)}
            />
          </CommandEmpty>
        )}
      </CommandList>
    </Command>
  )
}

function EmptySearchState({
  state,
  query,
  recentCount,
  onQueryChange,
  onRetry,
}: Readonly<{
  state: SearchState
  query: string
  recentCount: number
  onQueryChange: (query: string) => void
  onRetry: () => void
}>): ReactNode {
  if (state.kind === 'idle') {
    return (
      <p className="px-gutter py-section text-sm text-muted-foreground">
        {recentCount > 0
          ? `Recently inspected · ${recentCount}`
          : 'Search the Tool catalog by job, provider, or capability.'}
      </p>
    )
  }
  if (state.kind === 'loading') {
    return (
      <p className="px-gutter py-section text-sm text-muted-foreground">
        Searching…
      </p>
    )
  }
  if (state.kind === 'failed') {
    return (
      <SearchRecovery
        message={state.message}
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
        isError
      />
    )
  }
  if (state.result.kind === 'unavailable') {
    return (
      <SearchRecovery
        message="This search could not run. Try different wording or browse the current catalogue."
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
      />
    )
  }
  if (state.result.kind !== 'ok') {
    return (
      <SearchRecovery
        message={`No Tools matched “${query}”.`}
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
      />
    )
  }
  if (state.result.items.length === 0) {
    return (
      <SearchRecovery
        message={`No Tools matched “${query}”.`}
        onRetry={onRetry}
        onClear={() => onQueryChange('')}
      />
    )
  }
  return null
}

function getStatusMessage(state: SearchState, query: string, choiceCount: number): string {
  if (state.kind === 'loading') return 'Searching Tools…'
  if (state.kind === 'failed') return 'Tool search failed. Recovery options are available.'
  if (query === '') return choiceCount > 0 ? `${choiceCount} recently inspected Tools.` : ''
  if (state.kind !== 'done' || state.query !== query) return ''
  if (state.result.kind !== 'ok') return 'No matching Tools.'
  return `${state.result.count} Tools matched. Showing ${state.result.items.length}.`
}

function SearchRecovery({
  message,
  onRetry,
  onClear,
  isError = false,
}: Readonly<{ message: string; onRetry: () => void; onClear: () => void; isError?: boolean }>) {
  return (
    <div className="grid gap-intra px-gutter py-section">
      <p role={isError ? 'alert' : undefined} className="text-sm text-muted-foreground">{message}</p>
      <div className="flex flex-wrap gap-intra">
        <Button type="button" size="sm" className="min-h-touch" onClick={onRetry}>
          Try again
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="min-h-touch"
        >
          Clear search
        </Button>
        <Button asChild variant="secondary" size="sm" className="min-h-touch">
          <a href="/market?window=30d#tools">Browse current Tools</a>
        </Button>
      </div>
    </div>
  )
}
