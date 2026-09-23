export function AeConnectAgentWizardDialogSkeleton() {
  return (
    <div className="grid gap-5 py-4" aria-hidden data-slot="connect-agent-wizard-skeleton">
      <div className="h-20 animate-pulse rounded-md bg-muted/40" />
      <div className="grid gap-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-10 animate-pulse rounded-md border bg-muted/30" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/50" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-h-touch animate-pulse rounded-md border bg-muted/30" />
        <div className="min-h-touch animate-pulse rounded-md border bg-muted/30" />
      </div>
      <div className="grid gap-2">
        <div className="min-h-touch animate-pulse rounded-md border bg-muted/30" />
        <div className="min-h-touch animate-pulse rounded-md border bg-muted/30" />
        <div className="min-h-touch animate-pulse rounded-md border bg-muted/30" />
      </div>
      <div className="rounded-md border p-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="h-16 animate-pulse rounded bg-muted/30" />
          <div className="h-16 animate-pulse rounded bg-muted/30" />
          <div className="h-16 animate-pulse rounded bg-muted/30" />
        </div>
        <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-muted/50" />
      </div>
    </div>
  )
}
