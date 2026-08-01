import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { AeOwnerStatusEmptyState } from '@/components/ae/status/AeOwnerStatusEmptyState'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { readPublicCatalogActivationRef } from '@/modules/catalog/public'
import { readOwnerStatusServer } from '@/modules/catalog/owner-claim.functions'
import { recordServerFunnelEventServer } from '@/modules/observability/funnel.functions'
import { readOwnerSearchGapsServer } from '@/modules/demand/demand.functions'
import type { OwnerSearchGapReadback } from '@/modules/demand/demand.functions'
import type { SearchGapFact } from '@/modules/demand/public'
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
    const [result, searchGaps] = await Promise.all([
      readOwnerStatusServer({ data: deps }),
      readOwnerSearchGapsServer()
        .catch((): OwnerSearchGapReadback => ({ kind: 'unavailable' })),
    ])
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
    return { result, searchGaps }
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
  const { result, searchGaps } = Route.useLoaderData()
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
            <OwnerSearchGapCard readback={searchGaps} />
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="default"><a href="/owner/offerings">Manage Offerings</a></Button>
            </div>
            <AeCapabilityList catalog={readback.catalog} />
          </>
        )}
      </div>
    </AeOperatorShell>
  )
}

/**
 * Every action must land on a surface that can actually change the fact.
 * `/claim/form` cannot: claiming rejects a slug this owner already owns, so
 * sending an existing owner there is a rejection funnel, not an edit.
 */
const ownerFactPresentation: Readonly<Record<SearchGapFact, {
  label: string
  action: string
  href: '/owner/offerings' | '/help'
}>> = {
  price: { label: 'price', action: 'Add prices', href: '/owner/offerings' },
  availability: { label: 'opening hours', action: 'Update hours', href: '/owner/offerings' },
  contact: { label: 'a way to contact you', action: 'Add a contact option', href: '/owner/offerings' },
  service_detail: { label: 'what you offer', action: 'Describe your services', href: '/owner/offerings' },
  location: { label: 'your location', action: 'Ask us to update it', href: '/help' },
}

function OwnerSearchGapCard({ readback }: Readonly<{ readback: OwnerSearchGapReadback }>) {
  if (readback.kind === 'denied') {
    return null
  }

  if (readback.kind === 'unavailable') {
    return (
      <Card className="p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            Details customers searched for
          </h2>
          <p className="text-muted-foreground">
            We could not load recent search details. Refresh to try again.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6" aria-labelledby="owner-search-gap-heading">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground" id="owner-search-gap-heading">
            Details customers searched for
          </h2>
          <p className="text-sm text-muted-foreground">Last 30 days.</p>
        </div>
        {readback.byFact.length === 0 ? (
          <p className="text-muted-foreground">
            No search history yet. When your business appears in customer searches, the details they looked for will show here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="m-0 grid list-none gap-3 p-0">
              {readback.byFact.map(({ fact, searches }) => {
                const presentation = ownerFactPresentation[fact]
                return (
                  <li key={fact} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <p className="text-foreground">
                      Your business appeared in {searches} {searches === 1 ? 'search' : 'searches'} that mentioned {presentation.label}.
                    </p>
                    <Button asChild variant="secondary" size="sm"><a href={presentation.href}>{presentation.action}</a></Button>
                  </li>
                )
              })}
            </ul>
            {readback.truncated ? (
              <p className="text-sm text-muted-foreground">
                Showing patterns from the 100 most recent matches.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </Card>
  )
}
