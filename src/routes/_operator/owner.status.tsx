import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@astryxdesign/core/Button'

import { AeOwnerStatusEmptyState } from '@/components/ae/status/AeOwnerStatusEmptyState'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import { readOwnerStatusServer } from '@/modules/catalog/owner-claim.functions'
import { recordServerFunnelEventServer } from '@/modules/observability/funnel.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'

type OwnerStatusSearch = {
  slug?: string
}

export const Route = createFileRoute('/_operator/owner/status')({
  ...operatorRouteOptions,
  validateSearch: (search: Record<string, unknown>): OwnerStatusSearch => {
    const slug = typeof search.slug === 'string' && search.slug.trim().length > 0 ? search.slug.trim() : undefined
    return slug === undefined ? {} : { slug }
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const result = await readOwnerStatusServer({ data: deps })
    if (result.kind === 'available') {
      const businessId = readPublicCatalogActivationRef(result.readback.catalog)
      const payload = { slug: result.readback.catalog.slug }
      void recordServerFunnelEventServer({
        data: {
          eventType: 'owner_status_viewed',
          source: 'owner-status-route',
          stage: 'published',
          pseudonymousSessionId: 'server-owner-status',
          correlationId: `owner-status:${businessId}`,
          consentFlag: false,
          businessId,
          payload,
        },
      }).catch(() => undefined)
      void recordServerFunnelEventServer({
        data: {
          eventType: 'capability_status_viewed',
          source: 'owner-status-route',
          stage: 'published',
          pseudonymousSessionId: 'server-owner-status',
          correlationId: `capability-status:${businessId}`,
          consentFlag: false,
          businessId,
          payload,
        },
      }).catch(() => undefined)
    }
    return result
  },
  head: () => ({
    meta: [
      { title: 'Business page | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerStatusRoute,
})

function OwnerStatusRoute() {
  const result = Route.useLoaderData()
  const readback = result.kind === 'available' ? result.readback : undefined

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Business page"
      description="Preview what customers and agents can see, then keep your Offerings and contact paths current."
      currentPath="/owner/status"
    >
      <div className="grid gap-6">
        {readback === undefined ? (
          <AeOwnerStatusEmptyState kind={result.kind === 'not_found' ? 'not_found' : 'unavailable'} />
        ) : (
          <>
            <AeStatusCard readback={readback} />
            <div className="flex flex-wrap gap-3">
              <Button href="/owner/offerings" label="Manage Offerings" variant="primary" />
            </div>
            <AeCapabilityList catalog={readback.catalog} />
          </>
        )}
      </div>
    </AeOperatorShell>
  )
}
