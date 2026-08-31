import { createFileRoute, redirect } from '@tanstack/react-router'

import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/settings/members')({
  ...operatorRouteOptions,
  beforeLoad: () => {
    throw redirect({ to: '/agent-access', replace: true })
  },
})
