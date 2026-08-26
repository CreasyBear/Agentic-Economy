import { createFileRoute } from '@tanstack/react-router'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { Button } from '@/components/ui/button'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import { readOwnerStatusServer } from '@/lib/server/owner-status.functions'
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
    return { result }
  },
  head: () => ({
    meta: [
      { title: 'Supplier profile | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerStatusRoute,
})

function OwnerStatusRoute() {
  const { result } = Route.useLoaderData()
  const readback = result.kind === 'available' ? result.readback : undefined

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Supplier profile"
      description="Preview the Operations agents can find, then keep their access and public facts current."
      currentPath="/owner/status"
    >
      {readback === undefined ? (
        result.kind === 'not_found' ? (
          <AeEmptyState
            title="No supplier profile yet"
            description="Set up your supplier profile to publish Operations agents can inspect."
            role="status"
            action={
              <Button asChild className="min-h-11">
                <a href="/for-providers">Review supplier setup</a>
              </Button>
            }
          />
        ) : (
          <AeEmptyState
            title="Status unavailable"
            description="Try again in a moment. If this keeps happening, contact support through corrections."
            role="alert"
            action={
              <Button asChild variant="secondary" className="min-h-11">
                <a href="/owner/status">Try again</a>
              </Button>
            }
          />
        )
      ) : (
        <div className="grid gap-8">
          <AeStatusCard readback={readback} />
          <AeSection
            title="Operations"
            description="Published tools on this supplier. Open a row to edit."
          >
            <AeCapabilityList catalog={readback.catalog} />
          </AeSection>
        </div>
      )}
    </AeOperatorShell>
  )
}
