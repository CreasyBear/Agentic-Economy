import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { AdminWorkspaceView } from '@/lib/operator/admin-console/views'
import { timestampIso } from '@/lib/ui/format-time'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
import { ADMIN_OBJECT_PAGE_COPY, formatPerthTimestamp } from '../object-pages.contracts'
import { PurchaseActivity } from '../../activity/PurchaseActivity'

export type WorkspaceObjectViewProps = Readonly<{
  view: AdminWorkspaceView
  grant?: Readonly<{
    amount: string
    expiry: string
    canReview: boolean
    onAmountChange: (value: string) => void
    onExpiryChange: (value: string) => void
    onReview: () => void
  }> | null
}>

export function WorkspaceObjectView({ view, grant = null }: WorkspaceObjectViewProps) {
  const copy = ADMIN_OBJECT_PAGE_COPY.workspace
  const status = getStatusPresentation(view.lifecycle)

  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath={`/admin/workspaces/${view.ref}`}
      title={view.displayName ?? copy.title}
      description={copy.description}
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/accounts' },
        { label: view.ref },
      ]}
      actions={<Badge variant={aeStatusToneVariants[status.tone]}>{status.label}</Badge>}
      stickyHeader
    >
      <div className="flex min-w-0 flex-wrap items-center gap-intra text-sm text-muted-foreground">
        <span>{ADMIN_OBJECT_PAGE_COPY.referenceLabel}</span>
        <AeCopyReference label={ADMIN_OBJECT_PAGE_COPY.referenceLabel} value={view.ref} />
      </div>
      <div className="grid gap-section pb-page lg:grid-cols-[minmax(0,1fr)_20rem]">
        <AeSection title={ADMIN_OBJECT_PAGE_COPY.detailsTitle}>
          <AeFactList facts={[
            { label: copy.lifecycle, value: status.label },
            { label: copy.owners, value: String(view.ownerCount) },
            { label: copy.members, value: String(view.memberCount) },
            {
              label: copy.created,
              value: <time dateTime={timestampIso(view.createdAt)}>{formatPerthTimestamp(view.createdAt)}</time>,
            },
            {
              label: copy.externalOrganization,
              value: view.externalOrganizationBound ? ADMIN_OBJECT_PAGE_COPY.yes : ADMIN_OBJECT_PAGE_COPY.no,
            },
            {
              label: copy.spendingPolicy,
              value: view.hasActiveSpendingPolicy ? ADMIN_OBJECT_PAGE_COPY.yes : ADMIN_OBJECT_PAGE_COPY.no,
            },
          ]} />
        </AeSection>
        <AeSection title="Investigate this Account">
          <p className="text-sm text-muted-foreground">Review purchases, their funding and any recovery requiring attention.</p>
          <a className="mt-related inline-block text-sm underline underline-offset-4" href={`/admin/activity?account=${encodeURIComponent(view.ref)}&range=last_30`}>View all recent purchases</a>
        </AeSection>
        {grant === null ? null : (
          <AeSection title="Promotional credit" description="Grant expiring AUD credit to this Account after Admin review and ledger confirmation.">
            {view.paymentEnvironment === null ? (
              <p className="text-sm text-muted-foreground">Payment environment is unavailable for this deployment.</p>
            ) : (
              <div className="grid gap-intra">
                <p className="text-sm text-muted-foreground">Environment: {view.paymentEnvironment}</p>
                <label className="grid gap-1 text-sm font-medium">
                  Amount (AUD)
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="10.00"
                    value={grant.amount}
                    onChange={(event) => grant.onAmountChange(event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium">
                  Expiry (your local time)
                  <Input
                    type="datetime-local"
                    value={grant.expiry}
                    onChange={(event) => grant.onExpiryChange(event.target.value)}
                  />
                </label>
                <p className="text-xs text-muted-foreground">Enter a positive AUD amount with up to six decimal places and a future expiry.</p>
                <Button type="button" variant="outline" className="min-h-touch justify-self-start" disabled={!grant.canReview} onClick={grant.onReview}>
                  Review promotional credit grant
                </Button>
              </div>
            )}
          </AeSection>
        )}
      </div>
      <PurchaseActivity search={{ account: view.ref, range: 'last_30' }} compact />
    </AeOperatorPage>
  )
}
