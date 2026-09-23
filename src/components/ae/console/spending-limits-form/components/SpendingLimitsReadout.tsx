import type { SpendingLimitsReadoutProps } from '../spending-limits-form.contracts'

export function SpendingLimitsReadout({
  perCallDisplay,
  dailyDisplay,
  monthlyDisplay,
}: SpendingLimitsReadoutProps) {
  return (
    <div className="grid min-h-[4.5rem] grid-cols-3 gap-2 text-xs">
      <div className="rounded border bg-background/50 p-2">
        <span className="block text-[11px] text-muted-foreground">Per call max</span>
        <span className="font-mono text-sm font-medium tabular-nums text-foreground">
          {perCallDisplay}
        </span>
      </div>
      <div className="rounded border bg-background/50 p-2">
        <span className="block text-[11px] text-muted-foreground">Daily budget</span>
        <span className="font-mono text-sm font-medium tabular-nums text-foreground">
          {dailyDisplay}
        </span>
      </div>
      <div className="rounded border bg-background/50 p-2">
        <span className="block text-[11px] text-muted-foreground">Monthly budget</span>
        <span className="font-mono text-sm font-medium tabular-nums text-foreground">
          {monthlyDisplay}
        </span>
      </div>
    </div>
  )
}
