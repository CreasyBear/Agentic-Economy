export function AeAgentSpendingLimitsFormSkeleton() {
  return (
    <div
      className="grid min-h-[24.5rem] gap-4 rounded-md border bg-muted/20 p-3"
      aria-hidden
    >
      <div className="flex items-center justify-between gap-2">
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-9 w-48 animate-pulse rounded bg-muted" />
      </div>
      <div className="min-h-[2.75rem]" />
      <div className="min-h-[4.75rem] animate-pulse rounded-md bg-muted/40" />
      <div className="grid min-h-[4.5rem] grid-cols-3 gap-2">
        <div className="h-16 animate-pulse rounded border bg-muted/30" />
        <div className="h-16 animate-pulse rounded border bg-muted/30" />
        <div className="h-16 animate-pulse rounded border bg-muted/30" />
      </div>
      <div className="min-h-[2.75rem] animate-pulse rounded bg-muted/30" />
    </div>
  )
}
