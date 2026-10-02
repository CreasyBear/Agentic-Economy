'use client'

import { CommandGroup } from '@/components/ui/command'

import type { MarketToolSearchStatus, ToolSearchChoice } from '../tools-search-page.contracts'
import { toolSearchGroupHeading } from '../tools-search-page.contracts'

import { ToolSearchRecentRow, ToolSearchResultRow } from './ToolSearchResultRow'
import './CommandResultsComposition.css'

export type ToolsSearchResultsGroupProps = Readonly<{
  isActive: boolean
  trimmedQuery: string
  recentCount: number
  status: MarketToolSearchStatus
  choices: readonly ToolSearchChoice[]
  onSelectTool: (toolRef: string) => void
  onClearPendingIntent: () => void
}>

export function ToolsSearchResultsGroup({
  isActive,
  trimmedQuery,
  recentCount,
  status,
  choices,
  onSelectTool,
  onClearPendingIntent,
}: ToolsSearchResultsGroupProps) {
  if (choices.length === 0) return null
  const renderChoice = (choice: ToolSearchChoice) => choice.kind === 'recent' ? (
    <ToolSearchRecentRow key={choice.toolRef} isActive={isActive} toolRef={choice.toolRef}
      onSelect={onSelectTool} onClearPendingIntent={onClearPendingIntent} />
  ) : (
    <ToolSearchResultRow key={choice.item.toolRef} isActive={isActive} row={choice.item}
      onSelect={onSelectTool} onClearPendingIntent={onClearPendingIntent} />
  )
  return <CommandGroup className="arc-market arc-command-result-group" heading={toolSearchGroupHeading(trimmedQuery, recentCount, status)}>
    {choices.map(renderChoice)}
  </CommandGroup>
}
