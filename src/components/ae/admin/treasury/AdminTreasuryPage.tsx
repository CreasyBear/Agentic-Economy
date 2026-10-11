import { useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeInlineState } from '@/components/ae/feedback/AeInlineState'
import { AeAlert as Alert } from '@/components/ae/shared/alert/AeAlert'
import { Badge } from '@/components/arc/badge/badge'
import { ADMIN_ACCESS_REFUSED_COPY } from '@/lib/operator/admin-console/contracts'
import { formatRelativeTime, formatTimestamp } from '@/lib/ui/format-time'
import { api } from '../../../../../convex/_generated/api'
import { TREASURY_SNAPSHOT_MAX_AGE_MS } from '@/modules/money/treasury-report'
import { TreasuryMetrics } from './TreasuryMetrics'
import { TreasuryActions } from './TreasuryActions'
import { CommercialPolicyActions } from './CommercialPolicyActions'
import { TREASURY_ALERT_LABELS } from './treasury-view-model'
import { AdminTreasuryPageSkeleton, TREASURY_PAGE_CHROME } from './AdminTreasuryPageState'

export { AdminTreasuryPageSkeleton, TREASURY_PAGE_DESCRIPTION } from './AdminTreasuryPageState'

export function AdminTreasuryPage() {
  const view = useQuery(api.adminConsoleTreasury.read, {})
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  if (view === undefined) return <AdminTreasuryPageSkeleton />
  return <AeOperatorPage {...TREASURY_PAGE_CHROME}>
    {view.kind === 'refused' ? <AePageState title="Admin access required" description={ADMIN_ACCESS_REFUSED_COPY} tone="danger" /> : <div className="grid gap-section pb-page">
      <div className="flex flex-wrap items-center gap-related">
        <Badge tone="neutral">{view.environment === 'production' ? 'Production · Base' : 'Sandbox · Base Sepolia'}</Badge>
        <Badge tone={view.controls.paymentsOpenTo === 'none' ? 'warning' : 'neutral'}>{view.controls.paymentsOpenTo === 'none' ? 'Payments paused' : view.controls.paymentsOpenTo === 'admins' ? 'Paid calls off: trial credit only' : 'Paid calls on'}</Badge>
        {view.snapshot === null ? <AeInlineState state="unavailable" label="Reconciliation snapshot unavailable" description="Individual sources and controls remain visible below." /> : <p className="text-xs text-muted-foreground" title={formatTimestamp(view.snapshot.snapshotAt)}>Report {formatRelativeTime(view.snapshot.snapshotAt)}</p>}
      </div>
      {view.observation !== null && now - view.observation.observedAt >= 10 * 60_000 ? <AeInlineState state="stale" label="Wallet observation is stale" description="The displayed balance is over ten minutes old." /> : null}
      {view.snapshot !== null && now - view.snapshot.snapshotAt >= TREASURY_SNAPSHOT_MAX_AGE_MS ? <AeInlineState state="stale" label="Reconciliation report is stale" description="The checks below describe an older report, not current reconciliation." /> : null}
      {view.alerts.length === 0 ? null : <Alert role="status" title="Treasury needs attention" tone={view.alerts.some(alert => alert.severity === 'critical') ? 'danger' : 'warning'}>
        <ul className="grid gap-intra">{view.alerts.map(alert => <li key={alert.alertRef}>{TREASURY_ALERT_LABELS[alert.code]}</li>)}</ul>
      </Alert>}
      <TreasuryMetrics view={view} />
      <TreasuryActions view={view} />
      <CommercialPolicyActions environment={view.environment} />
    </div>}
  </AeOperatorPage>
}
