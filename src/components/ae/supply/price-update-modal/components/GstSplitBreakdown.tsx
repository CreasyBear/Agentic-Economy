import type { GstSplitBreakdownProps } from '../price-update-modal.contracts'

export function GstSplitBreakdown({ baseText, gstText, totalText }: GstSplitBreakdownProps) {
  return (
    <div className="grid gap-1 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Base price</span>
        <span className="font-mono tabular-nums">{baseText}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">GST (10%)</span>
        <span className="font-mono tabular-nums">{gstText}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Total Buyer Consideration</span>
        <span className="font-mono tabular-nums font-semibold">{totalText}</span>
      </div>
    </div>
  )
}
