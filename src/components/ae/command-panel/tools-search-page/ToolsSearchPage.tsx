'use client'

import { useRef, useState } from 'react'

import { Command, CommandEmpty, CommandList } from '@/components/ui/command'
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
  COMMAND_NAVIGATION_ITEMS,
  COMMAND_QUICK_ACTIONS,
  deriveToolsSearchChoices,
  filterCommandPaletteEntries,
  toolSearchStatusMessage,
} from './tools-search-page.contracts'
import { useCommandPaletteSelection } from './useCommandPaletteSelection'
import { useMarketToolSearch } from './useMarketToolSearch'

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
  const [searchAttempt, setSearchAttempt] = useState(0)
  const { status } = useMarketToolSearch({ query, searchAttempt, searchTools })
  const recentToolRefs = useRecentToolRefs()
  const inputRef = useRef<HTMLInputElement>(null)
  const matchingNavItems = filterCommandPaletteEntries(COMMAND_NAVIGATION_ITEMS, trimmedQuery)
  const matchingQuickActions = filterCommandPaletteEntries(COMMAND_QUICK_ACTIONS, trimmedQuery)
  const { choices, isAwaitingChoices } = deriveToolsSearchChoices(trimmedQuery, recentToolRefs, status)
  const navChoiceValues = matchingNavItems.map((item) => `ae-nav:${item.href}`)
  const quickChoiceValues = matchingQuickActions.map((action) => `ae-action:${action.id}`)
  const toolChoiceValues = choices.map((c) => (c.kind === 'recent' ? c.toolRef : c.item.toolRef))
  const choiceValues = [...navChoiceValues, ...quickChoiceValues, ...toolChoiceValues]
  const showCommandEmpty =
    matchingNavItems.length === 0 && matchingQuickActions.length === 0 && choices.length === 0
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
    onSelectTool,
    onQueryInputChange: onQueryChange,
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
          onSelectTool={onSelectTool}
          onClearPendingIntent={selection.clearPendingIntent}
        />
        {showCommandEmpty ? (
          <CommandEmpty>
            <ToolSearchStatus
              status={status}
              query={query}
              recentCount={recentToolRefs.length}
              onQueryChange={selection.handleQueryInputChange}
              onRetry={() => setSearchAttempt((attempt) => attempt + 1)}
            />
          </CommandEmpty>
        ) : null}
      </CommandList>
    </Command>
  )
}
