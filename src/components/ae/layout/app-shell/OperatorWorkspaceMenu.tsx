import { AeRenderErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'

import { useOperatorEntitlement } from './useOperatorEntitlement'
import { WorkspaceMenu, type WorkspaceMenuProps } from './WorkspaceMenu'

export type OperatorWorkspaceMenuProps = Omit<WorkspaceMenuProps, 'canAccessAdmin'>

function EntitledWorkspaceMenu(props: OperatorWorkspaceMenuProps) {
  const canAccessAdmin = useOperatorEntitlement()
  return <WorkspaceMenu {...props} canAccessAdmin={canAccessAdmin} />
}

export function OperatorWorkspaceMenu(props: OperatorWorkspaceMenuProps) {
  if (!import.meta.env.VITE_CONVEX_URL?.trim()) {
    return <WorkspaceMenu {...props} canAccessAdmin={false} />
  }
  return (
    <AeRenderErrorBoundary fallback={<WorkspaceMenu {...props} canAccessAdmin={false} />}>
      <EntitledWorkspaceMenu {...props} />
    </AeRenderErrorBoundary>
  )
}
