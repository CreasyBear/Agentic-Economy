import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import type { OperatorRole } from '@/lib/operator/roles'

import { useOperatorEntitlement } from './useOperatorEntitlement'
import { WorkspaceMenu } from './WorkspaceMenu'

export type OperatorWorkspaceMenuProps = Readonly<{ operatorRole: OperatorRole }>

function EntitledWorkspaceMenu({ operatorRole }: OperatorWorkspaceMenuProps) {
  const canAccessAdmin = useOperatorEntitlement()
  return <WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={canAccessAdmin} />
}

export function OperatorWorkspaceMenu({ operatorRole }: OperatorWorkspaceMenuProps) {
  if (!import.meta.env.VITE_CONVEX_URL?.trim()) {
    return <WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={false} />
  }
  return (
    <AeRenderErrorBoundary fallback={<WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={false} />}>
      <EntitledWorkspaceMenu operatorRole={operatorRole} />
    </AeRenderErrorBoundary>
  )
}
