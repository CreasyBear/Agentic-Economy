import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { Badge } from '@/components/ui/badge'
import { aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { providerPayoutLabel, providerStatusLabel, providerStatusPresentation } from '@/lib/operator/admin-console/status-adapter'
import { canAdminRolePerformAction } from '@/modules/security/public'
import { AdminProviderObjectSkeleton } from './AdminProviderObjectSkeleton'
import { ProviderAdmissionCasesTable } from './components/ProviderAdmissionCasesTable'
import { ProviderConnectionsTable } from './components/ProviderConnectionsTable'
import { ProviderRemovalDisputesTable } from './components/ProviderRemovalDisputesTable'
import { ProviderToolVersionsTable } from './components/ProviderToolVersionsTable'
import {
  PROVIDER_OBJECT_COPY,
  type AdminProviderObjectPageProps,
  type ProviderRemovalDisputeRow,
} from './provider-object.contracts'
import { providerTimestamp } from './provider-object.view-model'
import { SourceAuthorityReviewPanel } from './SourceAuthorityReviewPanel'
import { useAdminProviderObject } from './useAdminProviderObject'
import '../RecordWorkspaceComposition.css'

export function AdminProviderObjectPage(props: AdminProviderObjectPageProps) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const [suppressionOpen, setSuppressionOpen] = useState(false)
  const [selectedDispute, setSelectedDispute] = useState<ProviderRemovalDisputeRow | null>(null)
  const view = useAdminProviderObject(props)
  if (view === undefined) return <AdminProviderObjectSkeleton slug={props.slug} />
  if (view.kind === 'object_not_found') {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={PROVIDER_OBJECT_COPY.backToSearch}
      />
    )
  }
  if (view.kind === 'refused') {
    return (
      <AePageState
        title={PROVIDER_OBJECT_COPY.refusedTitle}
        description={PROVIDER_OBJECT_COPY.refusedDescription}
        tone="danger"
      />
    )
  }

  const status = providerStatusPresentation(view.publicStatus)
  const suppressedAt = view.suppressedAt === null ? null : providerTimestamp(view.suppressedAt)
  const canSuppress = access?.kind === 'allowed'
    && canAdminRolePerformAction(access.role, ADMIN_ACTION_PERMISSION.set_business_suppression)
  const suppressionIntent = view.suppressedAt === null ? 'suppress' : 'unsuppress'

  return (
    <AeOperatorPage
      operatorRole="admin"
      title={`${PROVIDER_OBJECT_COPY.title} ${view.slug}`}
      description={PROVIDER_OBJECT_COPY.description}
      currentPath={`/admin/providers/${view.slug}`}
      breadcrumbs={[
        { label: PROVIDER_OBJECT_COPY.breadcrumbs.admin, href: '/admin' },
        { label: PROVIDER_OBJECT_COPY.breadcrumbs.providers, href: '/admin/providers' },
        { label: view.slug },
      ]}
      actions={(
        <>
          <Badge variant={status === null ? 'outline' : aeStatusToneVariants[status.tone]}>
            {status === null ? providerStatusLabel(view.publicStatus) : status.label}
          </Badge>
          {suppressedAt === null ? null : (
            <Badge variant="outline">
              {PROVIDER_OBJECT_COPY.suppressedSince} <time dateTime={suppressedAt.iso}>{suppressedAt.label}</time>
            </Badge>
          )}
          {canSuppress ? (
            <Button type="button" variant="secondary" size="md" className="arc-market" onClick={() => setSuppressionOpen(true)}>
              {suppressionIntent === 'suppress' ? PROVIDER_OBJECT_COPY.suppress : PROVIDER_OBJECT_COPY.liftSuppression}
            </Button>
          ) : null}
        </>
      )}
      stickyHeader
    >
      <div className="flex min-w-0 flex-wrap items-center gap-intra text-sm text-muted-foreground">
        <span>{PROVIDER_OBJECT_COPY.referenceLabel}</span>
        <AeCopyReference label={PROVIDER_OBJECT_COPY.referenceLabel} value={view.slug} />
      </div>
      <div className="arc-market arc-admin-record-workspace">
        <AeSection title={PROVIDER_OBJECT_COPY.detailsTitle}>
          <AeFactList facts={[
            { label: PROVIDER_OBJECT_COPY.trustTier, value: providerStatusLabel(view.trustTier) },
            { label: PROVIDER_OBJECT_COPY.payout, value: providerPayoutLabel(view.payout) },
          ]} />
        </AeSection>
        <ProviderToolVersionsTable rows={view.publications} />
        <ProviderConnectionsTable rows={view.connections} />
        <ProviderAdmissionCasesTable rows={view.admissionCases} />
        <ProviderRemovalDisputesTable
          rows={view.removalDisputes}
          {...(access?.kind === 'allowed' && canAdminRolePerformAction(access.role, ADMIN_ACTION_PERMISSION.close_removal_dispute)
            ? { onCloseDispute: setSelectedDispute } : {})}
        />
        {view.publications.map((publication) => publication.sourceAuthorityReview === null ? null : (
          <SourceAuthorityReviewPanel
            key={publication.ref}
            review={publication.sourceAuthorityReview}
          />
        ))}
      </div>
      {canSuppress ? (
        <AdminActionSheet
          action="set_business_suppression"
          input={{ businessId: view.businessId, intent: suppressionIntent }}
          targetRefs={[
            { label: PROVIDER_OBJECT_COPY.title, value: view.slug },
            { label: PROVIDER_OBJECT_COPY.businessId, value: view.businessId },
          ]}
          open={suppressionOpen}
          onOpenChange={setSuppressionOpen}
          {...(suppressionIntent === 'unsuppress' ? { initialReasonCode: 'suppression_lifted_after_review' } : {})}
        />
      ) : null}
      {selectedDispute === null ? null : (
        <AdminActionSheet
          action="close_removal_dispute"
          input={{ disputeId: selectedDispute.disputeRef }}
          targetRefs={[{ label: PROVIDER_OBJECT_COPY.columns.removalDispute, value: selectedDispute.disputeRef }]}
          open
          onOpenChange={(open) => { if (!open) setSelectedDispute(null) }}
        />
      )}
    </AeOperatorPage>
  )
}
