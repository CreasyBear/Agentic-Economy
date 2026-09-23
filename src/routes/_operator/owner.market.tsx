import { createFileRoute, redirect } from '@tanstack/react-router'

import { operatorRouteOptions } from '@/lib/operator/route-options'
import { validateMarketSearch } from '@/modules/market/market.functions'

export const Route = createFileRoute('/_operator/owner/market')({
  ...operatorRouteOptions,
  validateSearch: validateMarketSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/market', search })
  },
})
