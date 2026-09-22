import { SourceAuthorityReviewPanel } from '@/components/ae/admin/catalog-health/SourceAuthorityReviewPanel'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { AdminProviderObjectSkeleton } from './AdminProviderObjectSkeleton'
import { ProviderAdmissionCasesTable } from './components/ProviderAdmissionCasesTable'
import { ProviderConnectionsTable } from './components/ProviderConnectionsTable'
import { ProviderRemovalDisputesTable } from './components/ProviderRemovalDisputesTable'
import { ProviderToolVersionsTable } from './components/ProviderToolVersionsTable'
import {
  PROVIDER_OBJECT_COPY,
  type AdminProviderObjectPageProps,
} from './provider-object.contracts'
import {
  providerPayoutLabel,
  providerStatusLabel,
  providerStatusPresentation,
  providerTimestamp,
} from './provider-object.view-model'
import { useAdminProviderObject } from './useAdminProviderObject'

export function AdminProviderObjectPage(props: AdminProviderObjectPageProps) {
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
  const sourceAuthorityReview = view.publications.find(
    (publication) => publication.sourceAuthorityReview !== null,
  )?.sourceAuthorityReview ?? null

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
        </>
      )}
      stickyHeader
    >
      <div className="grid gap-section pb-page">
        <AeSection title={PROVIDER_OBJECT_COPY.detailsTitle}>
          <AeFactList facts={[
            { label: PROVIDER_OBJECT_COPY.trustTier, value: providerStatusLabel(view.trustTier) },
            { label: PROVIDER_OBJECT_COPY.payout, value: providerPayoutLabel(view.payout) },
          ]} />
        </AeSection>
        <ProviderToolVersionsTable rows={view.publications} />
        <ProviderConnectionsTable rows={view.connections} />
        <ProviderAdmissionCasesTable rows={view.admissionCases} />
        <ProviderRemovalDisputesTable rows={view.removalDisputes} />
        {sourceAuthorityReview === null ? null : (
          <SourceAuthorityReviewPanel review={sourceAuthorityReview} />
        )}
      </div>
    </AeOperatorPage>
  )
}
