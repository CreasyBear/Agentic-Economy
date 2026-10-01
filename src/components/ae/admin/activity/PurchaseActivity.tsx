import { ErrorBoundary } from '@sentry/react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { useState } from 'react'
import { ArrowUpRightIcon, RefreshCwIcon } from 'lucide-react'
import { api } from '../../../../../convex/_generated/api'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { adminActivityHref, adminActivityWindow, type AdminActivitySearch, type AdminPurchaseRow } from '@/lib/operator/admin-console/activity'
import { formatPerthTimestamp } from '@/lib/ui/format-time'
import { formatCurrencyAmount } from '@/modules/money/public'

const STATUS_LABELS: Record<AdminPurchaseRow['state'], string> = {
  completed: 'Delivered', pending: 'Pending', refused: 'Refused',
  reconciliation_required: 'Needs reconciliation', cancelled: 'Cancelled',
}

export function PurchaseActivity({ search, compact = false }: Readonly<{ search: AdminActivitySearch; compact?: boolean }>) {
  return <ErrorBoundary fallback={<AePageState title="Purchase activity unavailable" description="The source could not provide a verified read. Reload this page to try again." tone="danger" />}>
    <PurchaseActivityQuery search={search} compact={compact} />
  </ErrorBoundary>
}

function PurchaseActivityQuery({ search, compact }: Readonly<{ search: AdminActivitySearch; compact: boolean }>) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const [now, setNow] = useState(() => Date.now())
  const range = search.range ?? 'today'
  const window = adminActivityWindow(range, now)
  const activity = usePaginatedQuery(api.adminConsoleActivity.listPurchases, access?.kind === 'allowed' ? {
    ...window, status: search.status ?? 'all', funding: search.funding ?? 'all',
    ...(search.account === undefined ? {} : { account: search.account }),
  } : 'skip', { initialNumItems: compact ? 6 : 25 })
  if (access?.kind === 'refused') return <AePageState title="Admin access required" description="Your current membership does not allow this read." tone="danger" />
  if (access === undefined || activity.status === 'LoadingFirstPage') return <Skeleton className="h-44 w-full" aria-label="Loading purchases" />
  return <AeSection title={compact ? 'Latest purchases' : 'Purchase activity'}
    description={range === 'today' ? 'Today in Perth · current payment and delivery evidence'
      : 'Purchases initiated in the selected completed Perth days · current status'}>
    <div className="mb-related flex flex-wrap items-center justify-between gap-related">
      <p className="text-xs text-muted-foreground">{activity.results.length} shown{activity.status === 'Exhausted' ? '' : ' · more records available'}</p>
      <div className="flex items-center gap-intra">
        {compact ? <a className="inline-flex min-h-touch items-center gap-1 text-sm underline underline-offset-4" href={adminActivityHref(search)}>View purchases <ArrowUpRightIcon className="size-3.5" /></a> : null}
        <Button size="sm" variant="ghost" onClick={() => setNow(Date.now())} aria-label="Refresh activity period"><RefreshCwIcon className="size-3.5" />Refresh</Button>
      </div>
    </div>
    {activity.results.length === 0 ? <div className="rounded-card border border-dashed p-6 text-sm text-muted-foreground">
      {activity.status === 'Exhausted' ? 'No purchases match this period and these filters.' : 'No matches in the purchases scanned so far. Continue to check the next source page.'}
    </div> : <PurchaseActivityTable rows={activity.results} showAccount={search.account === undefined} />}
    {!compact && activity.status !== 'Exhausted' ? <Button className="mt-related" variant="outline"
      disabled={activity.status !== 'CanLoadMore'} onClick={() => activity.loadMore(25)}>
      {activity.status === 'LoadingMore' ? 'Loading…' : 'Load more purchases'}
    </Button> : null}
  </AeSection>
}

export function PurchaseActivityTable({ rows, showAccount = true }: Readonly<{ rows: readonly AdminPurchaseRow[]; showAccount?: boolean }>) {
  return <Table>
    <TableHeader><TableRow><TableHead>Purchase</TableHead>{showAccount ? <TableHead>Account</TableHead> : null}
      <TableHead>Delivery</TableHead><TableHead>Payment</TableHead><TableHead className="hidden lg:table-cell">Started</TableHead>
    </TableRow></TableHeader>
    <TableBody>{rows.map(row => <TableRow key={row.callRef}>
      <TableCell className="max-w-64"><a className="font-medium underline-offset-4 hover:underline" href={`/admin/calls/${encodeURIComponent(row.callRef)}`}>
        {row.toolName ?? row.toolRef}</a><p className="mt-1 max-w-56 truncate text-xs text-muted-foreground" title={row.callRef}>{row.callRef}</p></TableCell>
      {showAccount ? <TableCell><a className="text-sm underline-offset-4 hover:underline" href={`/admin/workspaces/${encodeURIComponent(row.accountRef)}`}>
        {row.accountName ?? row.accountRef}</a></TableCell> : null}
      <TableCell><Badge variant={row.state === 'reconciliation_required' ? 'warning' : 'outline'}>{STATUS_LABELS[row.state]}</Badge>
        {row.recovery !== null ? <p className="mt-1 max-w-56 text-xs text-muted-foreground">{row.recovery.disposition === 'manual_review' ? 'Operator review required before retrying' : 'Automatic recovery requested; outcome not yet confirmed'}</p> : null}
      </TableCell>
      <TableCell><span className="whitespace-nowrap text-sm tabular-nums">{row.amount === null ? 'Not confirmed' : formatCurrencyAmount(row.amount)}</span>
        <p className="mt-1 text-xs text-muted-foreground">{fundingLabel(row)}</p></TableCell>
      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell"><time dateTime={new Date(row.createdAt).toISOString()}>{formatPerthTimestamp(row.createdAt)}</time></TableCell>
    </TableRow>)}</TableBody>
  </Table>
}

function fundingLabel(row: AdminPurchaseRow): string {
  const funding = row.funding
  if (funding.kind === 'refunded') return 'Refunded'
  if (funding.kind === 'unclassified') return 'Funding not classified'
  if (funding.kind === 'free') return 'Free usage'
  if (funding.kind === 'unsettled') return row.paymentState === 'insufficient_credit' ? 'Insufficient credit' : 'Not settled'
  if (BigInt(funding.purchasedUnits) === 0n) return 'Promotional credit'
  return BigInt(funding.promotionalUnits) > 0n ? 'Purchased + promotional credit' : 'Purchased credit'
}
