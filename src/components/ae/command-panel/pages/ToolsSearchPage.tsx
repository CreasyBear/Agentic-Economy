'use client'

import { ToolPriceText } from "@/components/ae/market/AeToolPrice"

import {
  Activity,
  CheckCircle2,
  Compass,
  CreditCard,
  Key,
  Server,
  Settings,
  SunMoon,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
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

export type CommandNavigationItem = Readonly<{
  href: string
  label: string
  keywords: readonly string[]
  icon: LucideIcon
}>

export type CommandQuickAction = Readonly<{
  id: string
  label: string
  description: string
  keywords: readonly string[]
  icon: LucideIcon
  href?: string
}>

export const COMMAND_NAVIGATION_ITEMS: readonly CommandNavigationItem[] = [
  {
    href: '/market',
    label: 'Tools Market',
    keywords: ['market', 'catalogue', 'catalog', 'browse', 'tools'],
    icon: Compass,
  },
  {
    href: '/activity',
    label: 'Calls & Activity',
    keywords: ['activity', 'calls', 'history', 'runs', 'executions'],
    icon: Activity,
  },
  {
    href: '/owner/operations',
    label: 'Tools Operations',
    keywords: ['operations', 'supply', 'provider', 'offerings', 'publish'],
    icon: Wrench,
  },
  {
    href: '/owner/credit',
    label: 'Balance & Credit',
    keywords: ['credit', 'balance', 'billing', 'top up', 'funds', 'money'],
    icon: CreditCard,
  },
  {
    href: '/owner/settings',
    label: 'Account & Settings',
    keywords: ['settings', 'account', 'security', 'profile', 'keys', 'team'],
    icon: Settings,
  },
  {
    href: '/agent-access',
    label: 'Agent Access & Keys',
    keywords: ['agent', 'access', 'principal', 'tokens', 'keys', 'credentials'],
    icon: Key,
  },
  {
    href: '/for-providers',
    label: 'Provider Workspace',
    keywords: ['providers', 'host', 'api', 'monetize', 'seller'],
    icon: Server,
  },
] as const

export const COMMAND_QUICK_ACTIONS: readonly CommandQuickAction[] = [
  {
    id: 'toggle-theme',
    label: 'Toggle Theme',
    description: 'Switch between light and dark appearance',
    keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
    icon: SunMoon,
  },
  {
    id: 'status',
    label: 'Check System Status',
    description: 'View platform health and uptime',
    href: '/status',
    keywords: ['status', 'health', 'uptime', 'operational'],
    icon: CheckCircle2,
  },
] as const

export function filterCommandPaletteEntries<
  T extends Readonly<{ label: string; keywords: readonly string[]; href?: string }>,
>(entries: readonly T[], trimmedQuery: string): T[] {
  if (trimmedQuery === '') return [...entries]
  const query = trimmedQuery.toLowerCase()
  return entries.filter(
    (entry) =>
      entry.label.toLowerCase().includes(query)
      || (entry.href !== undefined && entry.href.toLowerCase().includes(query))
      || entry.keywords.some((keyword) => keyword.toLowerCase().includes(query)),
  )
}

type ToolsSearchPageProps = Readonly<{
  isActive?: boolean
  query: string
  onQueryChange: (query: string) => void
  onSelectTool: (toolRef: string) => void
  onNavigate?: (href: string) => void
  onToggleTheme?: () => void
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
  onNavigate,
  onToggleTheme,
  searchTools = searchMarketTools,
}: ToolsSearchPageProps) {
  const trimmedQuery = query.trim()
  const matchingNavItems = filterCommandPaletteEntries(COMMAND_NAVIGATION_ITEMS, trimmedQuery)
  const matchingQuickActions = filterCommandPaletteEntries(COMMAND_QUICK_ACTIONS, trimmedQuery)
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
  const toolChoiceValues = choices.map((choice) => (
    choice.kind === 'recent' ? choice.toolRef : choice.item.toolRef
  ))
  const navChoiceValues = matchingNavItems.map((item) => `ae-nav:${item.href}`)
  const quickChoiceValues = matchingQuickActions.map((action) => `ae-action:${action.id}`)
  const choiceValues = [...navChoiceValues, ...quickChoiceValues, ...toolChoiceValues]
  const choiceValuesKey = choiceValues.join('\u001f')
  const showCommandEmpty =
    matchingNavItems.length === 0
    && matchingQuickActions.length === 0
    && choices.length === 0

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
      case 'Tab': {
        const groups: string[][] = []
        if (navChoiceValues.length > 0) groups.push(navChoiceValues)
        if (quickChoiceValues.length > 0) groups.push(quickChoiceValues)
        if (toolChoiceValues.length > 0) groups.push(toolChoiceValues)

        if (groups.length > 1) {
          event.preventDefault()
          const currentGroupIndex = groups.findIndex((group) => group.includes(selectedValue))
          const direction = event.shiftKey ? -1 : 1
          const nextGroupIndex = currentGroupIndex === -1
            ? (direction === 1 ? 0 : groups.length - 1)
            : (currentGroupIndex + direction + groups.length) % groups.length

          const targetValue = groups[nextGroupIndex]?.[0]
          if (targetValue) {
            pendingSelectionIntentRef.current = null
            selectedValueRef.current = targetValue
            setSelectedValue(targetValue)
          }
        }
        break
      }
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
      className="min-h-0 flex-1 [&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]]:shrink-0 [&_[data-slot=command-input-wrapper]]:border-border [&_[data-slot=command-input-wrapper]]:px-gutter [&_[data-slot=command-input-wrapper]]:focus-within:border-foreground/25 [&_[data-slot=command-input]]:text-sm [&_[data-slot=command-item][data-selected=true]]:bg-accent/90"
    >
      <CommandInput
        ref={inputRef}
        disabled={!isActive}
        aria-label="Search Tools"
        placeholder="Search Tools…"
        value={query}
        onValueChange={handleQueryInputChange}
        className="h-12 py-0"
      />
      <div role="status" className="sr-only">
        {statusMessage}
      </div>
      <CommandList
        label={trimmedQuery === '' ? 'Recently inspected Tools' : 'Matching Tools'}
        aria-busy={isAwaitingChoices}
        className="min-h-0 max-h-none flex-1 overscroll-contain"
      >
        {matchingNavItems.length > 0 ? (
          <CommandGroup heading="Navigation">
            {matchingNavItems.map((item) => {
              const Icon = item.icon
              const value = `ae-nav:${item.href}`
              return (
                <CommandItem
                  key={value}
                  value={value}
                  disabled={!isActive}
                  onSelect={() => {
                    pendingSelectionIntentRef.current = null
                    onNavigate?.(item.href)
                  }}
                  className="min-h-touch gap-intra px-gutter py-intra"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{item.label}</span>
                    <span className="truncate font-mono text-xs text-muted-foreground">{item.href}</span>
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
        {matchingQuickActions.length > 0 ? (
          <CommandGroup heading="Quick Actions">
            {matchingQuickActions.map((action) => {
              const Icon = action.icon
              const value = `ae-action:${action.id}`
              return (
                <CommandItem
                  key={value}
                  value={value}
                  disabled={!isActive}
                  onSelect={() => {
                    pendingSelectionIntentRef.current = null
                    if (action.id === 'toggle-theme') onToggleTheme?.()
                    else if (action.href !== undefined) onNavigate?.(action.href)
                  }}
                  className="min-h-touch gap-intra px-gutter py-intra"
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{action.label}</span>
                    <span className="truncate text-xs text-muted-foreground">{action.description}</span>
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
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
        ) : null}
        {showCommandEmpty ? (
          <CommandEmpty>
            <EmptySearchState
              state={state}
              query={query}
              recentCount={recentToolRefs.length}
              onQueryChange={handleQueryInputChange}
              onRetry={() => setSearchAttempt((attempt) => attempt + 1)}
            />
          </CommandEmpty>
        ) : null}
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
        <Link
          to="/market"
          className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-touch')}
        >
          Browse current Tools
        </Link>
      </div>
    </div>
  )
}
