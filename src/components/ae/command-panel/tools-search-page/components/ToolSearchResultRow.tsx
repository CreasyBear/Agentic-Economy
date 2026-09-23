'use client'

import { ToolPriceText } from '@/components/ae/market/AeToolPrice'
import { CommandItem } from '@/components/ui/command'

import type { ToolSearchResultRowModel } from '../tools-search-page.contracts'

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
      className="min-h-touch gap-intra px-gutter py-intra"
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{row.title}</span>
        <span className="truncate font-mono text-xs text-muted-foreground">{row.providerLine}</span>
        <span className="truncate text-xs text-muted-foreground">{row.healthLabel}</span>
      </span>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">
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
      className="min-h-touch gap-intra px-gutter py-intra"
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium text-foreground">Inspect recent Tool</span>
        <span dir="ltr" className="truncate font-mono text-xs text-muted-foreground">
          {toolRef}
        </span>
      </span>
    </CommandItem>
  )
}
