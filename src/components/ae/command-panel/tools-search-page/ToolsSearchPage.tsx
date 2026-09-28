'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/tanstack-react-start'

import { Command, CommandEmpty, CommandList } from '@/components/ui/command'
import { Button } from '@/components/ui/button'
import {
  searchMarketTools,
  type MarketToolSearchInput,
  type ToolChoiceSearchResult,
} from '../market-tools-client'
import { useRecentToolRefs } from '../recent-tools'
import {
  getOwnerMarketDemandStatus,
  findOwnerActiveMarketDemand,
  recordOwnerMarketDemand,
  withdrawOwnerMarketDemand,
  type OwnerMarketDemandStatusResult,
} from '@/modules/market-demand/market-demand.functions'

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
  const [savedNeed, setSavedNeed] = useState<Extract<OwnerMarketDemandStatusResult, { kind: 'open' | 'matched' }>>()
  const [checkedNeedQuery, setCheckedNeedQuery] = useState<string>()
  const [saveBusy, setSaveBusy] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const saveIntent = useRef<{ query: string; key: string } | undefined>(undefined)

  useEffect(() => {
    if (!isSignedIn || saveNeed === undefined || status.kind !== 'empty' || statusQuery !== saveNeed.query) {
      setCheckedNeedQuery(undefined)
      setSavedNeed(undefined)
      setSaveError(undefined)
      return
    }
    let current = true
    setCheckedNeedQuery(undefined)
    setSavedNeed(undefined)
    void (async () => {
      try {
        const found = await findOwnerActiveMarketDemand({ data: { query: saveNeed.query } })
        if (!current) return
        if (found.kind === 'error') {
          setSaveError('Saved needs are unavailable. Try again.')
          return
        }
        if (found.kind === 'not_found') {
          setCheckedNeedQuery(saveNeed.query)
          return
        }
        const currentStatus = await getOwnerMarketDemandStatus({ data: { requestRef: found.request.requestRef } })
        if (!current) return
        if (currentStatus.kind === 'open' || currentStatus.kind === 'matched') {
          setSavedNeed(currentStatus)
          setCheckedNeedQuery(saveNeed.query)
        } else if (currentStatus.kind === 'not_found') {
          saveIntent.current = undefined
          setCheckedNeedQuery(saveNeed.query)
        } else setSaveError('Saved need status is unavailable. Try again.')
      } catch {
        if (current) setSaveError('Saved needs are unavailable. Try again.')
      }
    })()
    return () => { current = false }
  }, [isSignedIn, saveNeed, status.kind, statusQuery])

  const saveCurrentNeed = async () => {
    if (!isSignedIn || saveNeed === undefined || saveBusy || checkedNeedQuery !== saveNeed.query) return
    const intent = saveIntent.current?.query === saveNeed.query
      ? saveIntent.current
      : { query: saveNeed.query, key: globalThis.crypto.randomUUID() }
    saveIntent.current = intent
    setSaveBusy(true)
    setSaveError(undefined)
    try {
      const result = await recordOwnerMarketDemand({ data: { query: intent.query, idempotencyKey: intent.key } })
      if (saveIntent.current !== intent) return
      if (result.kind === 'recorded' || result.kind === 'replayed') {
        const currentStatus = await getOwnerMarketDemandStatus({ data: { requestRef: result.requestRef } })
        if (saveIntent.current !== intent) return
        if (currentStatus.kind === 'open' || currentStatus.kind === 'matched') setSavedNeed(currentStatus)
        else if (currentStatus.kind === 'not_found') {
          saveIntent.current = undefined
          setSaveError('That saved need has expired. Save again to start a new request.')
        } else setSaveError('Saved, but status is unavailable. Try again.')
      } else if (result.kind === 'refused') {
        setSaveError(result.code === 'current_match_exists'
          ? 'A Tool now matches this need. Search again.'
          : result.code === 'unauthenticated'
            ? 'Sign in to save this need.'
            : 'This need could not be saved. Try again.')
      }
    } catch {
      if (saveIntent.current === intent) setSaveError('This need could not be saved. Try again.')
    } finally {
      setSaveBusy(false)
    }
  }

  const withdrawCurrentNeed = async () => {
    if (savedNeed === undefined || saveBusy) return
    setSaveBusy(true)
    setSaveError(undefined)
    try {
      const result = await withdrawOwnerMarketDemand({ data: { requestRef: savedNeed.requestRef } })
      if (result.kind === 'withdrawn' || result.kind === 'not_found') {
        setSavedNeed(undefined)
        saveIntent.current = undefined
      } else setSaveError('This need could not be withdrawn. Try again.')
    } catch {
      setSaveError('This need could not be withdrawn. Try again.')
    } finally {
      setSaveBusy(false)
    }
  }
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
      if (value.trim() !== trimmedQuery) saveIntent.current = undefined
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
