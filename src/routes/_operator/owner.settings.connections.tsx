import { createFileRoute } from '@tanstack/react-router'

import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { readOwnerOfferingSupplyServer } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerStatusServer } from '@/lib/server/owner-status.functions'
import {
  readOwnerProviderConnectionsServer,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'

export const Route = createFileRoute('/_operator/owner/settings/connections')({
  ...operatorRouteOptions,
  loader: async (): Promise<ConnectionsLoaderResult> => {
    const [status, offerings, connections] = await Promise.all([
      readOwnerStatusServer({ data: {} }),
      readOwnerOfferingSupplyServer(),
      readOwnerProviderConnectionsServer(),
    ])
    const businessId = status.kind === 'available'
      ? status.readback.catalog.businessId
      : offerings.kind === 'available'
        ? offerings.businessId
        : connections[0]?.businessId
    return {
      ...(businessId === undefined ? {} : { businessId }),
      connections,
    }
  },
  head: () => ({
    meta: [
      { title: 'Connections | Agentic Economy' },
      { name: 'description', content: 'Provider connections this supplier uses to route paid calls.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerSettingsConnectionsRoute,
})

type ConnectionsLoaderResult = Readonly<{
  businessId?: string
  connections: readonly OwnerProviderConnection[]
}>

function OwnerSettingsConnectionsRoute() {
  const { businessId, connections } = Route.useLoaderData()
  return (
    <AeOwnerProviderConnections
      {...(businessId === undefined ? {} : { businessId })}
      connections={connections}
    />
  )
}
