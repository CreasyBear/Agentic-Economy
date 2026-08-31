import { createServerFn } from '@tanstack/react-start'

import { describeActionForAgent, listMcpActions } from '@/modules/actions'
import { loadSupplyLandingReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { readMarketRouteProjection } from '@/modules/market/server'

export const loadSupplyLandingReadbackServer = createServerFn({ method: 'GET' })
  .handler(async () => loadSupplyLandingReadback({
    listTools: () => listMcpActions()
      .filter((action) => (
        action.readOnly
        && action.credentialAdmission === undefined
        && action.id.startsWith('registry.operations.')
      ))
      .map(describeActionForAgent),
    listListings: async () => {
      const projection = await readMarketRouteProjection('30d')
      if (projection.catalog.kind === 'unavailable') throw new Error('operation_catalog_unavailable')
      return projection.catalog.kind === 'ok' ? projection.catalog.items : []
    },
  }))
