import { createFileRoute, redirect } from '@tanstack/react-router'

import { operatorRouteOptions } from '@/lib/operator/route-options'

export const Route = createFileRoute('/_operator/owner/')({
  ...operatorRouteOptions,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/market', search })
  },
})
