import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { AeDegradedState } from '@/components/ae/feedback/AeDegradedState'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOwnerProviderConnections } from '@/components/ae/supply/AeOwnerProviderConnections'
import { Button } from '@/components/ui/button'
import { readOwnerOfferingSupplyServer } from '@/components/ae/offerings/owner-offering.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readOwnerStatusServer } from '@/lib/server/owner-status.functions'
import {
  readOwnerProviderConnectionsServer,
  type OwnerProviderConnection,
} from '@/modules/capability-supply/supply-funnel.functions'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'

export const Route = createFileRoute('/_operator/owner/settings/connections')({
  ...operatorRouteOptions,
  loader: async (): Promise<ConnectionsLoaderResult> => {
    const [status, offerings, connections] = await Promise.all([
      readOwnerStatusServer({ data: {} }).catch((cause) => {
        captureRouteException(cause, { 'ae.surface': 'connections_identity_status' })
        return undefined
      }),
      readOwnerOfferingSupplyServer().catch((cause) => {
        captureRouteException(cause, { 'ae.surface': 'connections_identity_offerings' })
        return undefined
      }),
      readOwnerProviderConnectionsServer().catch((cause) => {
        captureRouteException(cause, { 'ae.surface': 'connections_read' })
        return undefined
      }),
    ])
    if (connections === undefined) return { kind: 'unavailable' }
    const identityReadUnavailable = status === undefined || offerings === undefined
    const businessId = status?.kind === 'available'
      ? status.readback.catalog.businessId
      : offerings?.kind === 'available'
        ? offerings.businessId
        : identityReadUnavailable
          ? undefined
          : connections[0]?.businessId
    const identity = businessId !== undefined
      ? 'available'
      : identityReadUnavailable
        ? 'unavailable'
        : 'not_found'
    return {
      kind: 'available',
      identity,
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

export type ConnectionsLoaderResult =
  | Readonly<{
      kind: 'available'
      identity: 'available' | 'not_found' | 'unavailable'
      businessId?: string
      connections: readonly OwnerProviderConnection[]
    }>
  | Readonly<{ kind: 'unavailable' }>

function OwnerSettingsConnectionsRoute() {
  const result = Route.useLoaderData()
  const router = useRouter()
  const [retryPending, setRetryPending] = useState(false)
  if (result.kind === 'unavailable') {
    return (
      <AeDegradedState
        title="Connections are temporarily unavailable"
        description="Your existing provider connections have not been changed. Try loading them again."
        action={(
          <Button
            type="button"
            variant="secondary"
            className="min-h-touch"
            disabled={retryPending}
            aria-busy={retryPending || undefined}
            onClick={() => {
              if (retryPending) return
              setRetryPending(true)
              void router.invalidate()
                .catch((cause) => captureClientExceptionOnClient(cause))
                .finally(() => setRetryPending(false))
            }}
          >
            {retryPending ? 'Trying again…' : 'Try again'}
          </Button>
        )}
      />
    )
  }
  if (result.identity === 'unavailable') {
    return (
      <div className="grid gap-section">
        <AeDegradedState
          title="Connection setup is temporarily unavailable"
          description="Existing connections loaded, but supplier identity could not be confirmed. Reload identity before changing provider connections."
          action={(
            <Button
              type="button"
              variant="secondary"
              className="min-h-touch"
              disabled={retryPending}
              aria-busy={retryPending || undefined}
              onClick={() => {
                if (retryPending) return
                setRetryPending(true)
                void router.invalidate()
                  .catch((cause) => captureClientExceptionOnClient(cause))
                  .finally(() => setRetryPending(false))
              }}
            >
              {retryPending ? 'Trying again…' : 'Reload identity'}
            </Button>
          )}
        />
        <AeOwnerProviderConnections connections={result.connections} readOnly />
      </div>
    )
  }
  if (result.identity === 'not_found') {
    return (
      <AeEmptyState
        title="Supplier identity required"
        description="Create an unpublished supplier workspace before connecting a provider endpoint."
        action={(
          <Button asChild className="min-h-touch">
            <Link to="/owner/offerings">Create supplier workspace</Link>
          </Button>
        )}
      />
    )
  }
  const { businessId, connections } = result
  return (
    <AeOwnerProviderConnections
      {...(businessId === undefined ? {} : { businessId })}
      connections={connections}
    />
  )
}
