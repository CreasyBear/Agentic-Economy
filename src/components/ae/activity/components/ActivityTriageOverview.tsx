import { ClipboardList, ReceiptText, TriangleAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/** Adapted from licensed ReUI solution-agents-7 failed-run-header/support-cards.
 * Counts describe the currently loaded Call view; no exposure or retry authority is inferred. */
export function ActivityTriageOverview({ attentionCount, recentCount, loadedCount, filtered }: Readonly<{
  attentionCount: number; recentCount: number; loadedCount: number; filtered: boolean
}>) {
  const metrics = [
    { id: 'attention', label: 'Needs attention', value: attentionCount, detail: 'Review the recorded payment and delivery state.', Icon: TriangleAlert },
    { id: 'recent', label: 'Recent outcomes', value: recentCount, detail: 'Completed and refused Calls in this view.', Icon: ReceiptText },
    { id: 'loaded', label: 'Loaded history', value: loadedCount, detail: 'All loaded Calls before the status filter.', Icon: ClipboardList },
  ] as const
  return <section aria-label="Loaded Call overview" className="grid min-w-0 gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid gap-1"><h2 className="text-lg font-semibold">Review your Calls</h2>
        <p className="text-sm text-muted-foreground">Start with work that needs attention, then inspect recorded outcomes.</p></div>
      <p className="text-xs text-muted-foreground">{filtered ? 'Filtered loaded Calls' : 'Loaded Calls'} · full period totals are below</p>
    </div>
    <div className="grid min-w-0 grid-cols-3 gap-2 sm:gap-4">{metrics.map(({ id, label, value, detail, Icon }) =>
      <Card key={id} className="min-w-0 gap-0"><CardContent className="flex h-full flex-col gap-2 px-3 py-3 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-3"><span className="hidden size-9 shrink-0 items-center justify-center sm:flex rounded-lg border border-border bg-muted/60"><Icon className="size-4" aria-hidden="true" /></span>
          <p className="text-xs font-medium sm:text-sm">{label}</p></div>
        <p className="font-mono text-2xl font-semibold tabular-nums">{value}</p>
        <p className="hidden text-sm text-muted-foreground sm:block">{detail}</p>
      </CardContent></Card>)}</div>
    <p className="text-xs text-muted-foreground sm:hidden">Counts cover loaded records. History is counted before the status filter.</p>
  </section>
}
