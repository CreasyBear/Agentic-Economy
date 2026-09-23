import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { AdminAuditPageSkeleton } from './AdminAuditPageSkeleton'
import { AdminMembershipActions } from './AdminMembershipActions'
import {
  AUDIT_COPY,
  type AdminAuditPageProps,
} from './audit.contracts'
import { AuditEventsTable } from './components/AuditEventsTable'
import { AuditFilterChips } from './components/AuditFilterChips'
import { PendingApprovalsPanel } from './components/PendingApprovalsPanel'
import { useAdminAudit } from './useAdminAudit'

export function AdminAuditPage(props: AdminAuditPageProps) {
  const audit = useAdminAudit(props)
  if (audit.data.kind === 'loading') return <AdminAuditPageSkeleton />

  const page = (children: ReactNode) => (
    <AeOperatorPage
      operatorRole="admin"
      title={AUDIT_COPY.title}
      description={AUDIT_COPY.description}
      currentPath="/admin/audit-events"
      breadcrumbs={[
        { label: AUDIT_COPY.breadcrumbs.admin, href: '/admin' },
        { label: AUDIT_COPY.breadcrumbs.audit },
      ]}
      stickyHeader
    >
      {children}
    </AeOperatorPage>
  )

  if (audit.data.kind === 'refused') {
    return page(
      <AePageState
        title={AUDIT_COPY.accessDeniedTitle}
        description={AUDIT_COPY.accessDeniedDescription}
        tone="danger"
        action={
          <Link
            to="/admin"
            className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch')}
          >
            Return to Overview
          </Link>
        }
      />,
    )
  }

  return page(
    <div className="grid gap-section">
      <AeSection title={AUDIT_COPY.filtersTitle} description={AUDIT_COPY.filtersDescription}>
        <AuditFilterChips
          chips={audit.chips}
          draft={audit.draft}
          onDraftChange={audit.onDraftChange}
          onApply={audit.onApply}
          onRemove={audit.onRemove}
          onClear={audit.onClear}
        />
      </AeSection>
      <PendingApprovalsPanel rows={audit.data.proposals} />
      <AdminMembershipActions />
      <AuditEventsTable
        rows={audit.data.events}
        filtered={audit.filtered}
        paginationStatus={audit.data.paginationStatus}
        onLoadMore={audit.data.loadMore}
      />
    </div>,
  )
}
