import { ArrowLeftIcon } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

import { AeNotFound } from '@/components/ae/layout/AeNotFound'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { appDestination } from '@/lib/navigation/app-navigation'
import { operatorRoleForPath } from '@/lib/operator/roles'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './RouteRecoveryComposition.css'

export type OperatorRouteNotFoundProps = Readonly<{
  recoveryHref?: string
  recoveryLabel?: string
}>

export function RouteNotFound() {
  return <AeNotFound />
}

export function OperatorRouteNotFound() {
  return <OperatorRouteNotFoundRecovery />
}

export function OperatorRouteNotFoundRecovery({
  recoveryHref: recoveryHrefOverride,
  recoveryLabel: recoveryLabelOverride,
}: OperatorRouteNotFoundProps = {}) {
  const { pathname } = useLocation()
  const operatorRole = operatorRoleForPath(pathname) ?? 'owner'
  const isAssistantAccessPath = pathname.startsWith('/agent-access/')
  const defaultRecovery = operatorRole === 'owner'
    ? { href: appDestination('market').to, label: 'Back to Market' }
    : operatorRole === 'admin'
      ? { href: '/admin', label: 'Back to Admin overview' }
      : { href: '/developers/discovery', label: 'Back to Discovery' }
  const recoveryHref = recoveryHrefOverride ?? (isAssistantAccessPath ? '/agent-access' : defaultRecovery.href)
  const recoveryLabel = recoveryLabelOverride ?? (isAssistantAccessPath ? 'Back to Agents' : defaultRecovery.label)
  return (
    <AeOperatorPage
      operatorRole={operatorRole}
      title="Page not found"
      description="This page may have moved, or your account may not have access."
      currentPath={pathname}
    >
      <div className="arc-market arc-recovery-panel">
        <Link to={recoveryHref} className={actionLinkClassName('secondary', 'md')}>
          <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
          {recoveryLabel}
        </Link>
      </div>
    </AeOperatorPage>
  )
}
