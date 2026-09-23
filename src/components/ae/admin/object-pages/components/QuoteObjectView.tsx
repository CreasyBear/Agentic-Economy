import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Badge } from '@/components/ui/badge'
import { aeStatusToneVariants, getStatusPresentation } from '@/lib/ui/status-presentation'
import { timestampIso } from '@/lib/ui/format-time'
import type { AdminQuoteView } from '@/lib/operator/admin-console/views'
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
      description={copy.description}
      breadcrumbs={[
        { label: ADMIN_OBJECT_PAGE_COPY.adminBreadcrumb, href: '/admin' },
        { label: copy.section, href: '/admin/search?kind=quote' },
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
            <p className="text-sm text-muted-foreground">{ADMIN_OBJECT_PAGE_COPY.noRelatedReferences}</p>
          ) : (
            <div className="grid gap-related">
              {view.toolRef === null ? null : (
                <div className="grid gap-intra">
                  <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/tools/${view.toolRef}`}>{copy.tool}</a>
                  <AeCopyReference label={copy.tool} value={view.toolRef} />
                </div>
              )}
              {view.workspaceRef === null ? null : (
                <div className="grid gap-intra">
                  <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/workspaces/${view.workspaceRef}`}>{copy.workspace}</a>
                  <AeCopyReference label={copy.workspace} value={view.workspaceRef} />
                </div>
              )}
              {view.agentRef === null ? null : (
                <div className="grid gap-intra">
                  <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/agents/${view.agentRef}`}>{copy.agent}</a>
                  <AeCopyReference label={copy.agent} value={view.agentRef} />
                </div>
              )}
              {view.consumedCallRef === null ? null : (
                <div className="grid gap-intra">
                  <a className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline" href={`/admin/calls/${view.consumedCallRef}`}>{copy.consumedCall}</a>
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
