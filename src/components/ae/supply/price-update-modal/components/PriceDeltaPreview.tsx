import { ArrowRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import type { PriceDeltaPreviewProps } from '../price-update-modal.contracts'
import { GstSplitBreakdown } from './GstSplitBreakdown'

export function PriceDeltaPreview({
  formattedCurrent,
  formattedNew,
  deltaText,
  baseText,
  gstText,
  totalText,
}: PriceDeltaPreviewProps) {
  return (
    <div className="min-h-[8.5rem] rounded-lg border border-border bg-muted/30 p-3 grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Current Price:</span>
        <span className="font-mono tabular-nums">{formattedCurrent}</span>
        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
        <span className="text-muted-foreground">New Price:</span>
        <span className="font-mono tabular-nums">{formattedNew}</span>
        <Badge variant="outline" className="font-mono tabular-nums text-xs">
          {deltaText}
        </Badge>
      </div>
      <GstSplitBreakdown baseText={baseText} gstText={gstText} totalText={totalText} />
    </div>
  )
}
