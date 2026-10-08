import { AdminInvestigationReturn, AdminInvestigationLink } from '../../exceptions/AdminInvestigationReturn'
import { Link } from '@tanstack/react-router'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeRecordPageHeader as PageHeader } from '@/components/ae/shared/record-page-header/AeRecordPageHeader'
import { Badge } from '@/components/arc/badge/badge'
import type { AdminToolVersionView } from '@/lib/operator/admin-console/views'
import { timestampIso } from '@/lib/ui/format-time'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import '../../RecordWorkspaceComposition.css'
import { ADMIN_OBJECT_PAGE_COPY, formatPerthTimestamp } from '../object-pages.contracts'

export type ToolVersionObjectViewProps = Readonly<{ view: AdminToolVersionView }>

export function ToolVersionObjectView({ view }: ToolVersionObjectViewProps) {
  const copy = ADMIN_OBJECT_PAGE_COPY.toolVersion
  const status = getStatusPresentation(view.disposition)
  const sourceAuthority = view.sourceAuthorityState === 'verified'
    ? copy.sourceAuthorityVerified
    : view.sourceAuthorityState === 'unset' ? copy.sourceAuthorityUnset : copy.sourceAuthorityReviewRequired

  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath={`/admin/tools/${view.ref}`}
      title={copy.title}
      description=""
      contentOwnsHeading
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/search?kind=tool_version' },
        { label: view.ref },
      ]}
      stickyHeader
    >
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumbs={[
          {
            id: 'admin',
            label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin" {...linkProps}>{children}</Link>,
          },
          {
            id: 'section',
            label: copy.section,
            renderLink: ({ children, ...linkProps }) => (
              <Link to="/admin/search" search={{ kind: 'tool_version' }} {...linkProps}>{children}</Link>
            ),
          },
          { id: 'record', label: view.ref },
        ]}
        actions={<><AdminInvestigationReturn /><Badge tone={status.tone}>{status.label}</Badge></>}
        detail={(
          <div className="arc-market arc-admin-object-reference">
            <span>{ADMIN_OBJECT_PAGE_COPY.referenceLabel}</span>
            <AeCopyReference label={ADMIN_OBJECT_PAGE_COPY.referenceLabel} value={view.ref} />
          </div>
        )}
      />
      <div className="arc-market arc-admin-object-layout">
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
          <div className="arc-admin-object-related-list">
            <div className="arc-admin-object-related-row">
              <AdminInvestigationLink className="arc-admin-record-link" href={`/admin/providers/${view.businessSlug}`}>{copy.provider}</AdminInvestigationLink>
              <AeCopyReference label={copy.provider} value={view.businessSlug} />
            </div>
            {view.admissionCaseRef === null ? null : (
              <div className="arc-admin-object-related-row">
                <a className="arc-admin-record-link" href="/admin/exceptions?kind=admission_case">{copy.admissionCase}</a>
                <AeCopyReference label={copy.admissionCase} value={view.admissionCaseRef} />
              </div>
            )}
          </div>
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
