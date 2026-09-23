import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import type { AdminToolVersionView } from '@/lib/operator/admin-console/views'
import { timestampIso } from '@/lib/ui/format-time'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
import { ADMIN_OBJECT_PAGE_COPY, formatPerthTimestamp } from '../object-pages.contracts'

export type ToolVersionObjectViewProps = Readonly<{ view: AdminToolVersionView }>

export function ToolVersionObjectView({ view }: ToolVersionObjectViewProps) {
  const copy = ADMIN_OBJECT_PAGE_COPY.toolVersion
  const status = getStatusPresentation(view.disposition)
  const sourceAuthority = view.sourceAuthorityState === 'verified'
    ? copy.sourceAuthorityVerified
    : copy.sourceAuthorityReviewRequired

  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath={`/admin/tools/${view.ref}`}
      title={copy.title}
      description={copy.description}
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/search?kind=tool_version' },
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
            { label: copy.publication, value: <AeCopyReference label={copy.publication} value={view.publicationRef} /> },
            { label: copy.revision, value: view.revision === null ? copy.currentRevision : String(view.revision) },
            { label: copy.disposition, value: status.label },
            { label: copy.sourceAuthority, value: sourceAuthority },
            {
              label: copy.admissionCase,
              value: view.admissionCaseRef === null
                ? ADMIN_OBJECT_PAGE_COPY.notRecorded
                : <AeCopyReference label={copy.admissionCase} value={view.admissionCaseRef} />,
            },
            {
              label: copy.readiness,
              value: view.readinessValidUntil === null
                ? ADMIN_OBJECT_PAGE_COPY.notRecorded
                : <time dateTime={timestampIso(view.readinessValidUntil)}>{formatPerthTimestamp(view.readinessValidUntil)}</time>,
            },
          ]} />
        </AeSection>
        <AeSection title={ADMIN_OBJECT_PAGE_COPY.relatedTitle}>
          <div className="grid gap-related">
            <div className="grid gap-intra">
              <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/providers/${view.businessSlug}`}>{copy.provider}</a>
              <AeCopyReference label={copy.provider} value={view.businessSlug} />
            </div>
            {view.admissionCaseRef === null ? null : (
              <div className="grid gap-intra">
                <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href="/admin/exceptions?kind=admission_case">{copy.admissionCase}</a>
                <AeCopyReference label={copy.admissionCase} value={view.admissionCaseRef} />
              </div>
            )}
          </div>
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
