import { createServerFn } from '@tanstack/react-start'

import { describeActionForAgent, listMcpActions } from '@/modules/actions'
import { loadSupplyLandingReadback } from '@/modules/capability-supply/supply-funnel.functions'
import { registryServicesListAction } from '@/modules/registry/registry.actions'

export const loadSupplyLandingReadbackServer = createServerFn({ method: 'GET' })
  .handler(async () => loadSupplyLandingReadback({
    listTools: () => listMcpActions()
      .filter((action) => action.readOnly && action.credentialAdmission === undefined)
      .map(describeActionForAgent),
    listServices: () => registryServicesListAction.run({
      data: registryServicesListAction.schema.parse({ limit: 10 }),
      context: { caller: 'ui' },
    }),
  }))
