import { useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ADMIN_ACCESS_REFUSED_COPY } from '@/lib/operator/admin-console/contracts'
import { formatRelativeTime, formatTimestamp } from '@/lib/ui/format-time'
import { api } from '../../../../../convex/_generated/api'
import { TREASURY_SNAPSHOT_MAX_AGE_MS } from '@/modules/money/treasury-report'
import { TreasuryMetrics } from './TreasuryMetrics'
import { TreasuryActions } from './TreasuryActions'
import { TREASURY_ALERT_LABELS } from './treasury-view-model'

export const TREASURY_PAGE_DESCRIPTION = 'Company USDC float, customer credit coverage and payment controls.'
const chrome = { operatorRole: 'admin' as const, title: 'Treasury', description: TREASURY_PAGE_DESCRIPTION,
  currentPath: '/admin/treasury', breadcrumbs: [{ label: 'Admin', href: '/admin' }, { label: 'Treasury' }], stickyHeader: true }
export function AdminTreasuryPageSkeleton() {
  return <AeOperatorPage {...chrome} pending><div className="grid gap-section" aria-busy="true" aria-label="Loading treasury">{['Float', 'Runway', 'Coverage', 'In flight', 'Actions'].map(label => <Skeleton key={label} className="h-32 rounded-card" />)}</div></AeOperatorPage>
}
export function AdminTreasuryPage() {
  const view = useQuery(api.adminConsoleTreasury.read, {})
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  if (view === undefined) return <AdminTreasuryPageSkeleton />
  return <AeOperatorPage {...chrome}>
    {view.kind === 'refused' ? <AePageState title="Admin access required" description={ADMIN_ACCESS_REFUSED_COPY} tone="danger" /> : <div className="grid gap-section pb-page">
      <div className="flex flex-wrap items-center gap-related">
        <Badge variant="outline">{view.environment === 'production' ? 'Production · Base' : 'Sandbox · Base Sepolia'}</Badge>
        <Badge variant={view.controls.paymentsOpenTo === 'none' ? 'warning' : 'secondary'}>{view.controls.paymentsOpenTo === 'none' ? 'Payments paused' : view.controls.paymentsOpenTo === 'admins' ? 'Payments open to admins' : 'Payments open to everyone'}</Badge>
        {view.snapshot === null ? <AeInlineState state="unavailable" label="Reconciliation snapshot unavailable" description="Individual sources and controls remain visible below." /> : <p className="text-xs text-muted-foreground" title={formatTimestamp(view.snapshot.snapshotAt)}>Report {formatRelativeTime(view.snapshot.snapshotAt)}</p>}
      </div>
      {view.observation !== null && now - view.observation.observedAt >= 10 * 60_000 ? <AeInlineState state="stale" label="Wallet observation is stale" description="The displayed balance is over ten minutes old." /> : null}
      {view.snapshot !== null && now - view.snapshot.snapshotAt >= TREASURY_SNAPSHOT_MAX_AGE_MS ? <AeInlineState state="stale" label="Reconciliation report is stale" description="The checks below describe an older report, not current reconciliation." /> : null}
      {view.alerts.length === 0 ? null : <Alert role="status" variant={view.alerts.some(alert => alert.severity === 'critical') ? 'destructive' : 'default'}>
        <AlertTitle>Treasury needs attention</AlertTitle><AlertDescription><ul className="grid gap-intra">{view.alerts.map(alert => <li key={alert.alertRef}>{TREASURY_ALERT_LABELS[alert.code]}</li>)}</ul></AlertDescription>
      </Alert>}
      <TreasuryMetrics view={view} />
      <TreasuryActions view={view} />
    </div>}
  </AeOperatorPage>
}
