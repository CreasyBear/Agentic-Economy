'use client'

import { useRef, useState } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'

import { Command, CommandEmpty, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import {
  searchMarketTools,
  type MarketToolSearchInput,
  type ToolChoiceSearchResult,
} from '../market-tools-client'
import { useRecentToolRefs } from '../recent-tools'

import { CommandNavGroup, CommandQuickActionsGroup } from './components/CommandNavGroup'
import { CommandPaletteInput } from './components/CommandPaletteInput'
import { ToolSearchStatus } from './components/ToolSearchStatus'
import { ToolsSearchResultsGroup } from './components/ToolsSearchResultsGroup'
import {
  COMMAND_QUICK_ACTIONS,
  deriveToolsSearchChoices,
  filterCommandPaletteEntries,
  toolSearchStatusMessage,
  type ToolSearchContinuation,
} from './tools-search-page.contracts'
import { useCommandPaletteSelection } from './useCommandPaletteSelection'
import { useMarketToolSearch } from './useMarketToolSearch'
import { useSavedMarketNeed } from './useSavedMarketNeed'

type ToolsSearchPageProps = Readonly<{
  isActive?: boolean
  query: string
  onQueryChange: (query: string) => void
  onSelectTool: (toolRef: string) => void
  onNavigate?: (href: string) => void
  onOpenSettings?: (scope: 'personal' | 'workspace') => void
  onToggleTheme?: () => void
  searchTools?: (
    input: MarketToolSearchInput,
  ) => Promise<ToolChoiceSearchResult>
}>

export function ToolsSearchPage({
  isActive = true,
  query,
  onQueryChange,
  onSelectTool,
  onNavigate,
  onOpenSettings,
  onToggleTheme,
  searchTools = searchMarketTools,
}: ToolsSearchPageProps) {
  const trimmedQuery = query.trim()
  const [searchAttempt, setSearchAttempt] = useState(0)
  const [continuation, setContinuation] = useState<ToolSearchContinuation>()
  const { status, navigationItems, saveNeed } = useMarketToolSearch({
    query, searchAttempt, searchTools, ...(continuation === undefined ? {} : { continuation }),
  })
  const statusQuery = status.kind === 'idle' ? undefined : status.query
  const { isSignedIn } = useAuth()
  const {
    savedNeed, checkedNeedQuery, saveBusy, saveError, saveCurrentNeed, withdrawCurrentNeed, clearSaveIntent,
  } = useSavedMarketNeed({ isSignedIn, saveNeed, statusKind: status.kind, statusQuery })
  const recentToolRefs = useRecentToolRefs()
  const inputRef = useRef<HTMLInputElement>(null)
  const matchingNavItems = filterCommandPaletteEntries(navigationItems, trimmedQuery)
  const matchingQuickActions = filterCommandPaletteEntries(COMMAND_QUICK_ACTIONS, trimmedQuery)
  const { choices, isAwaitingChoices } = deriveToolsSearchChoices(trimmedQuery, recentToolRefs, status)
  const navChoiceValues = matchingNavItems.map((item) => `ae-nav:${item.href}`)
  const quickChoiceValues = matchingQuickActions.map((action) => `ae-action:${action.id}`)
  const toolChoiceValues = choices.map((c) => (c.kind === 'recent' ? c.toolRef : c.item.toolRef))
  const selectListing = (refOrHref: string) => {
    if (refOrHref.startsWith('/')) {
      if (onNavigate === undefined) window.location.assign(refOrHref)
      else onNavigate(refOrHref)
      return
    }
    onSelectTool(refOrHref)
  }
  const choiceValues = [...navChoiceValues, ...quickChoiceValues, ...toolChoiceValues]
  const showCommandEmpty =
    matchingNavItems.length === 0 && matchingQuickActions.length === 0 && choices.length === 0
  const nextPage = status.kind === 'success' && status.query === trimmedQuery
    ? status.nextPage
    : undefined
  const selection = useCommandPaletteSelection({
    isActive,
    trimmedQuery,
    choices,
    isAwaitingChoices,
    toolChoiceValues,
    navChoiceValues,
    quickChoiceValues,
    choiceValues,
    choiceValuesKey: choiceValues.join('\u001f'),
    inputRef,
    status,
    onSelectTool: selectListing,
    onQueryInputChange: (value) => {
      if (value.trim() !== trimmedQuery) clearSaveIntent()
      setContinuation(undefined)
      onQueryChange(value)
    },
  })

  return (
    <Command
      label="Search Tools"
      shouldFilter={false}
      value={selection.selectedValue}
      onValueChange={selection.handleSelectedValueChange}
      onKeyDown={selection.handleKeyDown}
      className="min-h-0 flex-1 [&_[data-slot=command-input-wrapper]]:h-12 [&_[data-slot=command-input-wrapper]]:shrink-0 [&_[data-slot=command-input-wrapper]]:border-border [&_[data-slot=command-input-wrapper]]:px-gutter [&_[data-slot=command-input-wrapper]]:focus-within:border-foreground/25 [&_[data-slot=command-input]]:text-sm [&_[data-slot=command-item][data-selected=true]]:bg-accent/90"
    >
      <CommandPaletteInput
        inputRef={inputRef}
        isActive={isActive}
        query={query}
        onValueChange={selection.handleQueryInputChange}
      />
      <div role="status" className="sr-only">
        {toolSearchStatusMessage(status, trimmedQuery, choices.length)}
      </div>
      <CommandList
        label={trimmedQuery === '' ? 'Recently inspected Tools' : 'Matching Tools'}
        aria-busy={isAwaitingChoices}
        className="min-h-0 max-h-none flex-1 overscroll-contain"
      >
        <CommandNavGroup
          isActive={isActive}
          navItems={matchingNavItems}
          {...(onNavigate === undefined ? {} : { onNavigate })}
          {...(onOpenSettings === undefined ? {} : { onOpenSettings })}
          onClearPendingIntent={selection.clearPendingIntent}
        />
        <CommandQuickActionsGroup
          isActive={isActive}
          quickActions={matchingQuickActions}
          {...(onNavigate === undefined ? {} : { onNavigate })}
          {...(onToggleTheme === undefined ? {} : { onToggleTheme })}
          onClearPendingIntent={selection.clearPendingIntent}
        />
        <ToolsSearchResultsGroup
          isActive={isActive}
          trimmedQuery={trimmedQuery}
          recentCount={recentToolRefs.length}
          status={status}
          choices={choices}
          onSelectTool={selectListing}
          onClearPendingIntent={selection.clearPendingIntent}
        />
        {nextPage !== undefined ? (
          <div className="px-gutter py-intra">
            <Button type="button" size="sm" className="min-h-touch"
              onClick={() => setContinuation({ ...nextPage, forQuery: trimmedQuery })}>
              Next page
            </Button>
          </div>
        ) : null}
        {showCommandEmpty ? (
          <CommandEmpty>
            <ToolSearchStatus
              status={status}
              query={query}
              recentCount={recentToolRefs.length}
              onQueryChange={selection.handleQueryInputChange}
              onRetry={() => {
                setContinuation(undefined)
                setSearchAttempt((attempt) => attempt + 1)
              }}
              onContinue={(nextPage) => setContinuation({ ...nextPage, forQuery: trimmedQuery })}
            />
          </CommandEmpty>
        ) : null}
        {saveNeed !== undefined && status.kind === 'empty' && status.query === saveNeed.query ? (
          <div className="grid gap-intra px-gutter pb-section">
            {!showCommandEmpty ? <p className="text-sm text-muted-foreground">{status.message}</p> : null}
            {isSignedIn ? (
              savedNeed === undefined ? (
                <Button type="button" size="sm" className="min-h-touch w-fit"
                  disabled={saveBusy || checkedNeedQuery !== saveNeed.query}
                  onClick={() => { void saveCurrentNeed() }}>
                  {saveBusy ? 'Saving…' : checkedNeedQuery === saveNeed.query ? 'Save this need' : 'Checking saved needs…'}
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-intra text-sm">
                  <span>Saved need · {savedNeed.requestRef}{savedNeed.kind === 'matched' ? ` · ${savedNeed.matchedCount} matching Tools` : ''}</span>
                  <Button type="button" variant="outline" size="sm" className="min-h-touch"
                    disabled={saveBusy} onClick={() => { void withdrawCurrentNeed() }}>
                    {saveBusy ? 'Withdrawing…' : 'Withdraw'}
                  </Button>
                </div>
              )
            ) : isSignedIn === false ? (
              <a href="/sign-in" className="inline-flex min-h-touch w-fit items-center rounded-md px-3 text-sm font-medium text-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">
                Sign in to save this need
              </a>
            ) : null}
            {saveError !== undefined ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
            {saveError !== undefined && checkedNeedQuery !== saveNeed.query && !showCommandEmpty ? (
              <Button type="button" variant="outline" size="sm" className="min-h-touch w-fit"
                onClick={() => setSearchAttempt((attempt) => attempt + 1)}>Try again</Button>
            ) : null}
          </div>
        ) : null}
      </CommandList>
    </Command>
  )
}
