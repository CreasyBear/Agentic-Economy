import { Link } from '@tanstack/react-router'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeRecordPageHeader as PageHeader } from '@/components/ae/shared/record-page-header/AeRecordPageHeader'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/arc/badge/badge'
import { getStatusPresentation } from '@/lib/ui/status-presentation'
import { timestampIso } from '@/lib/ui/format-time'
import type { AdminQuoteView } from '@/lib/operator/admin-console/views'
import '../../RecordWorkspaceComposition.css'
import { ADMIN_OBJECT_PAGE_COPY, formatPerthTimestamp } from '../object-pages.contracts'

export type QuoteObjectViewProps = Readonly<{ view: AdminQuoteView }>

export function QuoteObjectView({ view }: QuoteObjectViewProps) {
  const copy = ADMIN_OBJECT_PAGE_COPY.quote
  const status = getStatusPresentation(view.state)
  const hasRelated = view.toolRef !== null || view.workspaceRef !== null
    || view.agentRef !== null || view.consumedCallRef !== null

  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath={`/admin/quotes/${view.ref}`}
      title={copy.title}
      description=""
      contentOwnsHeading
    >
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumbs={[
          { id: 'admin', label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin" {...linkProps}>{children}</Link> },
          { id: 'section', label: copy.section,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin/search" search={{ kind: 'quote' }} {...linkProps}>{children}</Link> },
          { id: 'record', label: view.ref },
        ]}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
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
            { label: copy.state, value: status.label },
            {
              label: copy.created,
              value: <time dateTime={timestampIso(view.createdAt)}>{formatPerthTimestamp(view.createdAt)}</time>,
            },
            {
              label: copy.expires,
              value: view.expiresAt === null
                ? ADMIN_OBJECT_PAGE_COPY.notRecorded
                : <time dateTime={timestampIso(view.expiresAt)}>{formatPerthTimestamp(view.expiresAt)}</time>,
            },
            {
              label: copy.consumedCall,
              value: view.consumedCallRef === null
                ? ADMIN_OBJECT_PAGE_COPY.notRecorded
                : <AeCopyReference label={copy.consumedCall} value={view.consumedCallRef} />,
            },
          ]} />
        </AeSection>
        <AeSection title={ADMIN_OBJECT_PAGE_COPY.relatedTitle}>
          {!hasRelated ? (
            <p className="arc-admin-record-context">{ADMIN_OBJECT_PAGE_COPY.noRelatedReferences}</p>
          ) : (
            <div className="arc-admin-object-related-list">
              {view.toolRef === null ? null : (
                <div className="arc-admin-object-related-row">
                  <a className="arc-admin-record-link" href={`/admin/tools/${view.toolRef}`}>{copy.tool}</a>
                  <AeCopyReference label={copy.tool} value={view.toolRef} />
                </div>
              )}
              {view.workspaceRef === null ? null : (
                <div className="arc-admin-object-related-row">
                  <a className="arc-admin-record-link" href={`/admin/workspaces/${view.workspaceRef}`}>{copy.workspace}</a>
                  <AeCopyReference label={copy.workspace} value={view.workspaceRef} />
                </div>
              )}
              {view.agentRef === null ? null : (
                <div className="arc-admin-object-related-row">
                  <a className="arc-admin-record-link" href={`/admin/agents/${view.agentRef}`}>{copy.agent}</a>
                  <AeCopyReference label={copy.agent} value={view.agentRef} />
                </div>
              )}
              {view.consumedCallRef === null ? null : (
                <div className="arc-admin-object-related-row">
                  <a className="arc-admin-record-link" href={`/admin/calls/${view.consumedCallRef}`}>{copy.consumedCall}</a>
                  <AeCopyReference label={copy.consumedCall} value={view.consumedCallRef} />
                </div>
              )}
            </div>
          )}
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
