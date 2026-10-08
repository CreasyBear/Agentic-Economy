import type { ReactNode } from 'react'
import { Wallet } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/arc/button/button'

/** Licensed ReUI profile-8/plan-summary-card grammar; no subscription or calculated totals. */
export function CreditBalanceCard({ label, value, busy, status, children, onRefresh, refreshLabel = 'Refresh balance' }: Readonly<{
  label: string; value?: string; busy: boolean; status?: string; children: ReactNode
  refreshLabel?: string
  onRefresh?: () => void | Promise<void>
}>) {
  return <Card className="min-w-0 gap-0 p-0" aria-busy={busy}>
    <CardHeader className="gap-6 px-5 py-5 sm:px-6">
      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 gap-4"><span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60"><Wallet className="size-5" aria-hidden="true" /></span>
          <div className="grid min-w-0 gap-2"><h3 className="text-base font-semibold">{label}</h3>
            {value === undefined ? null : <p className="break-words font-mono text-3xl font-semibold tabular-nums">{value}</p>}
            <p className="text-sm text-muted-foreground">AUD Account credit for admitted paid Calls.</p>
          </div></div>
        {status === undefined ? null : <span className="rounded-full border border-border px-3 py-1 text-xs font-medium">{status}</span>}
      </div>
    </CardHeader>
    <CardContent className="grid gap-3 px-5 pb-5 sm:px-6">{children}</CardContent>
    <CardFooter className="flex-col items-start justify-between gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:px-6">
      <p className="max-w-xl text-sm text-muted-foreground">Reading this balance does not approve a Call or change an Agent’s spending policy.</p>
      {onRefresh === undefined ? null : <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => { void onRefresh() }}>{busy ? 'Refreshing…' : refreshLabel}</Button>}
    </CardFooter>
  </Card>
}
