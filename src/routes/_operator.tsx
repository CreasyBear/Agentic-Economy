import { Outlet, createFileRoute } from '@tanstack/react-router'

import { TermsAcceptanceGate } from '@/components/ae/layout/TermsAcceptanceGate'
import { OperatorRouteForbidden } from '@/components/ae/layout/AeRouteError'
import { operatorLayoutRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator')({
  staticData: { shell: 'operator' },
  ...operatorLayoutRouteOptions,
  component: OperatorLayoutRoute,
})

function OperatorLayoutRoute() {
  const operatorContext = Route.useRouteContext()
  if (operatorContext.kind === 'forbidden') {
    return <OperatorRouteForbidden surface={operatorContext.surface} />
  }

  return (
    <TermsAcceptanceGate>
      <Outlet />
    </TermsAcceptanceGate>
  )
}
