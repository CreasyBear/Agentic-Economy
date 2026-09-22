import { Badge } from '@/components/ui/badge'
import { AeOperatorBreadcrumbs } from '@/components/ae/layout/AeOperatorBreadcrumbs'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AePageState } from '@/components/ae/layout/AePageState'
import { OperatorRouteNotFoundRecovery } from '@/components/ae/layout/AeRouteNotFound'
import { aeStatusToneVariants } from '@/lib/ui/status-presentation'
import { AdminCallActivity } from './components/AdminCallActivity'
import { AdminCallEvidence } from './components/AdminCallEvidence'
import { AdminCallReferences } from './components/AdminCallReferences'
import {
  ADMIN_CALL_OBJECT_COPY,
  type AdminCallLoaderResult,
  type AdminCallObjectFoundProps,
} from './call-object.contracts'
import { useAdminCallObject } from './useAdminCallObject'

export type AdminCallObjectPageProps = Readonly<{
  result: AdminCallLoaderResult
}>

export function AdminCallObjectPage({ result }: AdminCallObjectPageProps) {
  if (result.kind === 'malformed' || result.kind === 'object_not_found') {
    return (
      <OperatorRouteNotFoundRecovery
        recoveryHref="/admin/search"
        recoveryLabel={ADMIN_CALL_OBJECT_COPY.backToSearch}
      />
    )
  }
  if (result.kind === 'refused') {
    return (
      <AePageState
        title={ADMIN_CALL_OBJECT_COPY.refusedTitle}
        description={ADMIN_CALL_OBJECT_COPY.refusedDescription}
        tone="danger"
      />
    )
  }
  return <AdminCallObjectFound view={result} />
}

function AdminCallObjectFound({ view }: AdminCallObjectFoundProps) {
  const model = useAdminCallObject(view)
  return (
    <AeOperatorPage
      operatorRole="admin"
      title={view.ref}
      description={ADMIN_CALL_OBJECT_COPY.description}
      currentPath={`/admin/calls/${encodeURIComponent(view.ref)}`}
      stickyHeader
      actions={(
        <Badge variant={aeStatusToneVariants[model.status.tone]}>
          {model.status.compactLabel}
        </Badge>
      )}
      secondaryBar={(
        <AeOperatorBreadcrumbs items={[
          { label: ADMIN_CALL_OBJECT_COPY.adminBreadcrumb, href: '/admin' },
          { label: ADMIN_CALL_OBJECT_COPY.callsBreadcrumb, href: '/admin/search' },
          { label: view.ref },
        ]} />
      )}
    >
      <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_20rem]">
        <AdminCallEvidence model={model} />
        <AdminCallReferences refs={model.relatedRefs} />
      </div>
      <AdminCallActivity rows={model.activity} />
    </AeOperatorPage>
  )
}
