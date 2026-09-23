import { ArrowLeftIcon } from 'lucide-react'
import { Link, useLocation } from '@tanstack/react-router'

import { AeNotFound } from '@/components/ae/layout/AeNotFound'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { buttonVariants } from '@/components/ui/button-variants'
import { appDestination } from '@/lib/navigation/app-navigation'
import { operatorRoleForPath } from '@/lib/operator/roles'
import { cn } from '@/lib/utils'

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
      <Link
        to={recoveryHref}
        className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch w-fit')}
      >
        <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
        {recoveryLabel}
      </Link>
    </AeOperatorPage>
  )
}
