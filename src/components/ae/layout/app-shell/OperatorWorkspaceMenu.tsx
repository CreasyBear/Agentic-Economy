import { ErrorBoundary } from '@sentry/react'

import type { OperatorRole } from '@/lib/operator/roles'

import { useOperatorEntitlement } from './useOperatorEntitlement'
import { WorkspaceMenu } from './WorkspaceMenu'

export type OperatorWorkspaceMenuProps = Readonly<{ operatorRole: OperatorRole }>

function EntitledWorkspaceMenu({ operatorRole }: OperatorWorkspaceMenuProps) {
  const canAccessAdmin = useOperatorEntitlement()
  return <WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={canAccessAdmin} />
}

export function OperatorWorkspaceMenu({ operatorRole }: OperatorWorkspaceMenuProps) {
  return (
    <ErrorBoundary fallback={<WorkspaceMenu operatorRole={operatorRole} canAccessAdmin={false} />}>
      <EntitledWorkspaceMenu operatorRole={operatorRole} />
    </ErrorBoundary>
  )
}
