import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import type { AdminWorkspaceView } from '@/lib/operator/admin-console/views'
import { timestampIso } from '@/lib/ui/format-time'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
import { ADMIN_OBJECT_PAGE_COPY, formatPerthTimestamp } from '../object-pages.contracts'

export type WorkspaceObjectViewProps = Readonly<{ view: AdminWorkspaceView }>

export function WorkspaceObjectView({ view }: WorkspaceObjectViewProps) {
  const copy = ADMIN_OBJECT_PAGE_COPY.workspace
  const status = getStatusPresentation(view.lifecycle)

  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath={`/admin/workspaces/${view.ref}`}
      title={copy.title}
      description={copy.description}
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/search?kind=workspace' },
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
        <AeSection title={ADMIN_OBJECT_PAGE_COPY.relatedTitle}>
          <p className="text-sm text-muted-foreground">{ADMIN_OBJECT_PAGE_COPY.noRelatedReferences}</p>
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
