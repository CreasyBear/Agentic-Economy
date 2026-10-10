import { ErrorBoundary } from '@sentry/react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { ArrowUpRightIcon, RefreshCwIcon, ShoppingBagIcon } from 'lucide-react'

import { api } from '../../../../../convex/_generated/api'
import { AeAlert as Alert } from '@/components/ae/shared/alert/AeAlert'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/arc/badge/badge'
import { AeEmptyState } from '@/components/ae/shared/empty-state/AeEmptyState'
import { AeSortableDataTable } from '@/components/ae/shared/sortable-data-table/AeSortableDataTable'
import type { AeDataColumn } from '@/components/ae/shared/sortable-data-table/sortable-data-table.contracts'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/ui/skeleton'
import { adminActivityHref, adminActivityWindow, type AdminActivitySearch, type AdminPurchaseRow } from '@/lib/operator/admin-console/activity'
import { RecordTime } from '@/components/ae/operator/RecordTime'
import { formatCurrencyAmount } from '@/modules/money/public'

const STATUS_LABELS: Record<AdminPurchaseRow['state'], string> = {
  completed: 'Delivered',
  pending: 'Pending',
  refused: 'Refused',
  reconciliation_required: 'Needs reconciliation',
  cancelled: 'Cancelled',
}

type PurchaseActivityProps = Readonly<{ search: AdminActivitySearch; compact?: boolean }>
type PurchaseTableRow = AdminPurchaseRow & Readonly<{ purchase: string; account: string }>

export function PurchaseActivity({ search, compact = false }: PurchaseActivityProps) {
  return (
    <ErrorBoundary fallback={
      <div className="ae-arc"><Alert title="Purchase activity unavailable" tone="danger">The source could not provide a verified read. Reload this page to try again.</Alert></div>
    }>
      <PurchaseActivityQuery search={search} compact={compact} />
    </ErrorBoundary>
  )
}

function PurchaseActivityQuery({ search, compact = false }: PurchaseActivityProps) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => setNow(Date.now()), [])
  const range = search.range ?? 'today'
  const activity = usePaginatedQuery(
    api.adminConsoleActivity.listPurchases,
    access?.kind === 'allowed' && now !== null ? {
      ...adminActivityWindow(range, now),
      status: search.status ?? 'all',
      funding: search.funding ?? 'all',
      ...(search.account === undefined ? {} : { account: search.account }),
    } : 'skip',
    { initialNumItems: compact ? 6 : 25 },
  )

  if (access?.kind === 'refused') {
    return <div className="ae-arc"><Alert title="Admin access required" tone="danger">Your current membership does not allow this read.</Alert></div>
  }
  if (access === undefined || now === null || activity.status === 'LoadingFirstPage') {
    return <Skeleton className="h-44 w-full" role="status" aria-label="Loading purchases" />
  }

  const exhausted = activity.status === 'Exhausted'
  const loadMore = !compact && !exhausted ? (
    <Button variant="secondary" disabled={activity.status !== 'CanLoadMore'} onClick={() => activity.loadMore(25)}>
      {activity.status === 'LoadingMore' ? 'Loading…' : 'Load more purchases'}
    </Button>
  ) : undefined

  return (
    <AeSection
      title={compact ? 'Latest purchases' : 'Purchase activity'}
      description={range === 'today'
        ? 'Today in Perth · current payment and delivery evidence'
        : 'Purchases initiated in the selected completed Perth days · current status'}
    >
      <div className="mb-related flex flex-wrap items-center justify-between gap-related">
        <p className="text-xs text-muted-foreground">
          {activity.results.length} loaded{exhausted ? '' : ' · more records available'}. Sorting applies to loaded purchases.
        </p>
        <div className="flex items-center gap-intra">
          {compact ? (
            <a className="inline-flex min-h-touch items-center gap-1 text-sm underline underline-offset-4" href={adminActivityHref(search)}>
              View purchases <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setNow(Date.now())} aria-label="Refresh activity period">
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />Refresh
          </Button>
        </div>
      </div>
      {activity.results.length === 0 ? (
        <div className="ae-arc rounded-lg border border-border bg-card">
          <AeEmptyState
            icon={<ShoppingBagIcon size={24} />}
            title={exhausted ? 'No matching purchases' : 'No matches in the records scanned'}
            description={exhausted
              ? 'No purchases match this period and these filters. Choose another period or clear a filter.'
              : 'More source records are available. Continue to check the next page before drawing a conclusion.'}
            action={loadMore}
          />
        </div>
      ) : (
        <div className="grid gap-related justify-items-start">
          <PurchaseActivityTable rows={activity.results} showAccount={search.account === undefined} />
          {loadMore}
        </div>
      )}
    </AeSection>
  )
}

const PURCHASE_COLUMNS: AeDataColumn<PurchaseTableRow>[] = [
  {
    key: 'purchase', label: 'Purchase',
    render: (_value, row) => (
      <div className="min-w-0">
        <a className="font-medium underline-offset-4 hover:underline" href={`/admin/calls/${encodeURIComponent(row.callRef)}`}>
          {row.purchase}
        </a>
        <p className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={row.callRef}>{row.callRef}</p>
      </div>
    ),
  },
  {
    key: 'account', label: 'Account',
    render: (_value, row) => (
      <a className="text-sm underline-offset-4 hover:underline" href={`/admin/workspaces/${encodeURIComponent(row.accountRef)}`}>
        {row.account}
      </a>
    ),
  },
  {
    key: 'state', label: 'Status',
    render: (_value, row) => (
      <div>
        <Badge tone={row.state === 'reconciliation_required' ? 'warning' : row.state === 'completed' ? 'success' : 'neutral'}>
          {STATUS_LABELS[row.state]}
        </Badge>
        {row.recovery === null ? null : (
          <p className="mt-1 max-w-56 text-xs text-muted-foreground">
            {row.recovery.disposition === 'manual_review'
              ? 'Operator review required before retrying'
              : 'Automatic recovery requested; outcome not yet confirmed'}
          </p>
        )}
      </div>
    ),
  },
  {
    key: 'amount', label: 'Amount', sortable: false, numeric: true,
    render: (_value, row) => (
      <div>
        <span className="whitespace-nowrap text-sm">
          {row.amount === null ? 'Not confirmed' : formatCurrencyAmount(row.amount)}
        </span>
        <p className="mt-1 text-xs text-muted-foreground">{fundingLabel(row)}</p>
      </div>
    ),
  },
  {
    key: 'createdAt', label: 'Started', numeric: false,
    render: (_value, row) => (
      <RecordTime at={row.createdAt} />
    ),
  },
]

/** Read-only sorting of the loaded page; exact currency is never coerced for comparison. */
export function PurchaseActivityTable({ rows, showAccount = true }: Readonly<{ rows: readonly AdminPurchaseRow[]; showAccount?: boolean }>) {
  const records = rows.map(row => ({ ...row, purchase: row.toolName ?? row.toolRef, account: row.accountName ?? row.accountRef }))
  return (
    <div className="ae-arc w-full min-w-0">
      <AeSortableDataTable
        rows={records}
        columns={showAccount ? PURCHASE_COLUMNS : PURCHASE_COLUMNS.filter(column => column.key !== 'account')}
        rowKey="callRef"
        caption="Loaded purchases"
      />
    </div>
  )
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
