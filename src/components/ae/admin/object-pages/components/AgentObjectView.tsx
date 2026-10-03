import { Link } from '@tanstack/react-router'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { PageHeader } from '@/components/arc/blocks/page-header/page-header'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import type { AdminAgentView } from '@/lib/operator/admin-console/views'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
import '../../RecordWorkspaceComposition.css'
import { ADMIN_OBJECT_PAGE_COPY } from '../object-pages.contracts'

export type AgentObjectViewProps = Readonly<{ view: AdminAgentView }>

export function AgentObjectView({ view }: AgentObjectViewProps) {
  const copy = ADMIN_OBJECT_PAGE_COPY.agent
  const status = getStatusPresentation(view.credentialLifecycle)

  return (
    <AeOperatorPage
      operatorRole="admin"
      currentPath={`/admin/agents/${view.ref}`}
      title={copy.title}
      description=""
      contentOwnsHeading
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/search?kind=agent' },
        { label: view.ref },
      ]}
      stickyHeader
    >
      <PageHeader
        title={copy.title}
        description={copy.description}
        breadcrumbs={[
          { id: 'admin', label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin" {...linkProps}>{children}</Link> },
          { id: 'section', label: copy.section,
            renderLink: ({ children, ...linkProps }) => <Link to="/admin/search" search={{ kind: 'agent' }} {...linkProps}>{children}</Link> },
          { id: 'record', label: view.ref },
        ]}
        actions={<Badge variant={aeStatusToneVariants[status.tone]}>{status.label}</Badge>}
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
            { label: copy.credentialLifecycle, value: status.label },
            {
              label: copy.workspace,
              value: view.workspaceRef === null
                ? ADMIN_OBJECT_PAGE_COPY.notRecorded
                : <AeCopyReference label={copy.workspace} value={view.workspaceRef} />,
            },
            {
              label: copy.spendingPolicy,
              value: view.spendingPolicyRef === null
                ? ADMIN_OBJECT_PAGE_COPY.notRecorded
                : <AeCopyReference label={copy.spendingPolicy} value={view.spendingPolicyRef} />,
            },
            {
              label: copy.recentCalls,
              value: view.recentCallRefs.length === 0 ? copy.noRecentCalls : (
                <ul className="arc-admin-object-call-list">
                  {view.recentCallRefs.map((callRef) => (
                    <li key={callRef} className="arc-admin-object-related-row">
                      <a className="arc-admin-record-link" href={`/admin/calls/${callRef}`}>{copy.call}</a>
                      <AeCopyReference label={copy.call} value={callRef} />
                    </li>
                  ))}
                </ul>
              ),
            },
          ]} />
        </AeSection>
        <AeSection title={ADMIN_OBJECT_PAGE_COPY.relatedTitle}>
          {view.workspaceRef === null ? (
            <p className="arc-admin-record-context">{ADMIN_OBJECT_PAGE_COPY.noRelatedReferences}</p>
          ) : (
            <div className="arc-admin-object-related-row">
              <a className="arc-admin-record-link" href={`/admin/workspaces/${view.workspaceRef}`}>{copy.workspace}</a>
              <AeCopyReference label={copy.workspace} value={view.workspaceRef} />
            </div>
          )}
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
