'use client'

import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { CommandItem } from '@/components/ui/command'

import type { ToolSearchResultRowModel } from '../tools-search-page.contracts'

import './CommandResultsComposition.css'

export type ToolSearchResultRowProps = Readonly<{
  isActive: boolean
  row: ToolSearchResultRowModel
  onSelect: (toolRef: string) => void
  onClearPendingIntent: () => void
}>

export function ToolSearchResultRow({
  isActive,
  row,
  onSelect,
  onClearPendingIntent,
}: ToolSearchResultRowProps) {
  return (
    <CommandItem
      key={row.toolRef}
      value={row.toolRef}
      disabled={!isActive}
      onSelect={(selectedToolRef) => {
        onClearPendingIntent()
        onSelect(selectedToolRef)
      }}
      className="arc-command-result-row arc-command-result-row--tool"
    >
      <span className="arc-command-result-copy">
        <span className="arc-command-result-title">{row.title}</span>
        <span className="arc-command-result-meta arc-command-result-reference">{row.providerLine}</span>
        <span className="arc-command-result-meta">{row.healthLabel}</span>
      </span>
      <span className="arc-command-result-price">
        <ToolPriceText
          price={row.priceLabel}
          {...(row.priceValidUntil !== undefined ? { validUntil: row.priceValidUntil } : {})}
        />
      </span>
    </CommandItem>
  )
}

export type ToolSearchRecentRowProps = Readonly<{
  isActive: boolean
  toolRef: string
  onSelect: (toolRef: string) => void
  onClearPendingIntent: () => void
}>

export function ToolSearchRecentRow({
  isActive,
  toolRef,
  onSelect,
  onClearPendingIntent,
}: ToolSearchRecentRowProps) {
  return (
    <CommandItem
      key={toolRef}
      value={toolRef}
      disabled={!isActive}
      onSelect={(selectedToolRef) => {
        onClearPendingIntent()
        onSelect(selectedToolRef)
      }}
      className="arc-command-result-row arc-command-result-row--recent"
    >
      <span className="arc-command-result-copy">
        <span className="arc-command-result-title">Inspect recent Tool</span>
        <span dir="ltr" className="arc-command-result-meta arc-command-result-reference">
          {toolRef}
        </span>
      </span>
    </CommandItem>
  )
}
