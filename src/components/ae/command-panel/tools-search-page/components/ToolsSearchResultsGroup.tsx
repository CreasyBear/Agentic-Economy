'use client'

import { CommandGroup } from '@/components/ui/command'

import type { MarketToolSearchStatus, ToolSearchChoice } from '../tools-search-page.contracts'
import { toolSearchGroupHeading } from '../tools-search-page.contracts'

import { ToolSearchRecentRow, ToolSearchResultRow } from './ToolSearchResultRow'

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
  if (status.kind === 'success' && status.groups !== undefined && trimmedQuery !== '') {
    const buy = choices.filter(choice => choice.kind === 'result' && choice.item.sourceKind === 'admitted')
    const elsewhere = choices.filter(choice => choice.kind === 'result' && choice.item.sourceKind !== 'admitted')
    return <>
      <p className="px-gutter py-2 text-xs text-muted-foreground" role="status">
        {toolSearchGroupHeading(trimmedQuery, recentCount, status)} on this source page
      </p>
      {buy.length === 0 ? null : <CommandGroup heading={`Buy through AE · ${status.groups.buyThroughAe} matched · showing ${buy.length}`}>
        {buy.map(renderChoice)}
      </CommandGroup>}
      {elsewhere.length === 0 ? null : <CommandGroup heading={`Listed elsewhere · ${status.groups.listedElsewhere} matched · showing ${elsewhere.length}`}>
        {elsewhere.map(renderChoice)}
      </CommandGroup>}
    </>
  }
  return <CommandGroup heading={toolSearchGroupHeading(trimmedQuery, recentCount, status)}>
    {choices.map(renderChoice)}
  </CommandGroup>
}
