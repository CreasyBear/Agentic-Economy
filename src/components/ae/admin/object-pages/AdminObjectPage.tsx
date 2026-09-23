import { AePageState } from '@/components/ae/layout/AePageState'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { AgentObjectView } from './components/AgentObjectView'
import { QuoteObjectView } from './components/QuoteObjectView'
import { ToolVersionObjectView } from './components/ToolVersionObjectView'
import { WorkspaceObjectView } from './components/WorkspaceObjectView'
import { AdminObjectPageSkeleton } from './AdminObjectPageSkeleton'
import { ADMIN_OBJECT_PAGE_COPY, type AdminObjectPageRef } from './object-pages.contracts'
import { useAdminObjectPage } from './useAdminObjectPage'

export type AdminObjectPageProps = AdminObjectPageRef

export function AdminObjectPage(props: AdminObjectPageProps) {
  const view = useAdminObjectPage(props)

  if (view === undefined) return <AdminObjectPageSkeleton />
  if (view.kind === 'object_not_found') {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch}
      />
    )
  }
  if (view.kind === 'refused') {
    return (
      <AePageState
        title={ADMIN_OBJECT_PAGE_COPY.refusedTitle}
        description={ADMIN_OBJECT_PAGE_COPY.refusedDescription}
        tone="danger"
      />
    )
  }
  if (view.kind !== props.kind) {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch}
      />
    )
  }

  switch (view.kind) {
    case 'quote':
      return <QuoteObjectView view={view} />
    case 'tool_version':
      return <ToolVersionObjectView view={view} />
    case 'workspace':
      return <WorkspaceObjectView view={view} />
    case 'agent':
      return <AgentObjectView view={view} />
    default:
      return (
        <OperatorRouteNotFoundRecovery
          recoveryHref="/admin/search"
          recoveryLabel={ADMIN_OBJECT_PAGE_COPY.backToSearch}
        />
      )
  }
}
