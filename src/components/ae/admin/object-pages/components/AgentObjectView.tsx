import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import type { AdminAgentView } from '@/lib/operator/admin-console/views'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
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
      description={copy.description}
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/search?kind=agent' },
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
                <ul className="grid gap-related">
                  {view.recentCallRefs.map((callRef) => (
                    <li key={callRef} className="grid gap-intra">
                      <a className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/calls/${callRef}`}>{copy.call}</a>
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
            <p className="text-sm text-muted-foreground">{ADMIN_OBJECT_PAGE_COPY.noRelatedReferences}</p>
          ) : (
            <div className="grid gap-intra">
              <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/workspaces/${view.workspaceRef}`}>{copy.workspace}</a>
              <AeCopyReference label={copy.workspace} value={view.workspaceRef} />
            </div>
          )}
        </AeSection>
      </div>
    </AeOperatorPage>
  )
}
