import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'
import { z } from 'zod'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  plainAvailabilityLabel,
  type PlainAvailabilityInput,
} from '@/lib/ui/status-presentation'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'
import {
  readPublicRegistryCatalogPage,
  readPublicRegistrySearchPage,
} from '@/modules/registry/registry.functions'

type RegistrySearchParams = {
  q: string
  limit: number
  cursor?: string
}

type RegistryRouteReadback = {
  result: PublicBusinessCatalogApiPage
  query: string
  limit: number
}

const registrySearchParamsSchema = z.object({
  q: z.string(),
  limit: z.number(),
  cursor: z.string().optional(),
})

export const readRegistryRouteServer = createServerFn()
  .validator((data) => registrySearchParamsSchema.parse(data))
  .handler(({ data }) =>
    loadRegistryRouteReadback({
      q: data.q,
      limit: data.limit,
      ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
    })
  )

export const Route = createFileRoute('/registry')({
  validateSearch: (search: Record<string, unknown>): RegistrySearchParams => {
    const q = typeof search.q === 'string' ? search.q.trim().slice(0, 120) : ''
    const limitValue = typeof search.limit === 'string' ? Number(search.limit) : Number(search.limit ?? 10)
    const limit = Number.isFinite(limitValue) ? Math.min(Math.max(Math.trunc(limitValue), 1), 20) : 10
    const cursor = typeof search.cursor === 'string' && search.cursor.trim().length > 0 ? search.cursor.trim() : undefined

    return {
      q,
      limit,
      ...(cursor === undefined ? {} : { cursor }),
    }
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => readRegistryRouteServer({ data: deps }),
  pendingComponent: RegistryLoading,
  errorComponent: RegistryError,
  head: () => ({
    meta: [
      { title: 'Local business discovery | Agentic Economy' },
      {
        name: 'description',
        content: 'Find claimed local service businesses and see the details they have published for customers.',
      },
    ],
  }),
  component: RegistryRoute,
})

export async function loadRegistryRouteReadback(deps: RegistrySearchParams): Promise<RegistryRouteReadback> {
  const result =
    deps.q.length === 0
      ? await readPublicRegistryCatalogPage({
          limit: deps.limit,
          ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }),
        })
      : await readPublicRegistrySearchPage({
          query: deps.q,
          limit: deps.limit,
          ...(deps.cursor === undefined ? {} : { cursor: deps.cursor }),
        })

  return { result, query: deps.q, limit: deps.limit }
}

function RegistryRoute() {
  const { result, query, limit } = Route.useLoaderData()
  const hasQuery = query.length > 0
  const isEmpty = result.items.length === 0

  return (
    <AePublicShell>
      <AePageHeader
        title="Find business details companies can stand behind."
        description="Search by name, service, or place. See what is published, what is still missing, and the right way to contact the business."
      />
      <section className="ae-public-page mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <RegistrySearchForm query={query} limit={limit} />
        {isEmpty && !hasQuery ? (
          <AeEmptyState
            title="No businesses published yet"
            description="Claimed business pages will appear here once owners publish customer-ready details."
            action={
              <Button asChild>
                <Link to="/claim">Claim your business page</Link>
              </Button>
            }
          />
        ) : null}
        {isEmpty && hasQuery ? (
          <AeEmptyState
            title="No matching business yet"
            description="Try a business name, suburb, or service. If this is your business, claim the page so customers can find the right details."
            action={
              <>
                <Button asChild>
                  <Link to="/claim">Claim your business page</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/registry" search={{ q: '', limit: 10 }}>
                    Clear search
                  </Link>
                </Button>
              </>
            }
          />
        ) : null}
        {!isEmpty ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                <span data-numeric>{result.pagination.total}</span> {resultSummary(result.pagination.total, query)}
              </p>
              <RegistryClaimPrompt />
              <RegistryResultList items={result.items} />
            </div>
            <RegistryPagination
              query={query}
              limit={limit}
              {...(result.pagination.cursor === undefined ? {} : { cursor: result.pagination.cursor })}
              {...(result.pagination.nextCursor === undefined ? {} : { nextCursor: result.pagination.nextCursor })}
              hasMore={result.pagination.hasMore}
            />
          </>
        ) : null}
      </section>
    </AePublicShell>
  )
}

function RegistrySearchForm({ query, limit }: { query: string; limit: number }) {
  return (
    <Card className="ae-public-route-card ae-public-route-search-card">
      <CardHeader>
        <CardTitle>Find a local business</CardTitle>
        <CardDescription>Use a business name, service, suburb, postcode, or service area.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/registry" method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Business, service, or place</span>
            <Input name="q" defaultValue={query} placeholder="emergency plumber parramatta" />
          </label>
          <input type="hidden" name="limit" value={String(limit)} />
          <Button type="submit" className="self-end">
            <SearchIcon data-icon="inline-start" />
            Search businesses
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function RegistryClaimPrompt() {
  return (
    <div className="ae-public-route-card ae-public-claim-strip flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
        Own one of these businesses? Claim your page so customers see the details you approve.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/claim">Claim your business page</Link>
      </Button>
    </div>
  )
}

function RegistryResultList({ items }: { items: readonly PublicBusinessCatalogApiDto[] }) {
  return (
    <ul className="grid gap-3" aria-label="Business results">
      {items.map((item) => (
        <li key={item.slug}>
          <article className="ae-public-route-card ae-public-result-card overflow-hidden">
            <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="grid content-start gap-2">
                <p className="text-sm font-medium leading-6 text-muted-foreground">Listed business</p>
                <h2 className="font-heading text-xl font-semibold leading-tight text-foreground">{item.name}</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  {item.category}, {item.suburb}, {item.stateTerritory}
                  {item.postcode === undefined ? '' : ` ${item.postcode}`}
                </p>
              </div>
              <div className="grid content-start gap-2 lg:items-start lg:justify-end">
                <p className="text-xs font-medium leading-5 text-muted-foreground">Published details</p>
                <RegistryAvailabilityPill item={item} />
                <Button asChild variant="outline" size="sm" className="w-full lg:w-auto">
                  <Link to="/$slug" params={{ slug: item.slug }}>
                    View details
                  </Link>
                </Button>
              </div>
            </div>
            <div className="border-t border-[var(--ae-public-line)]/80" aria-label={`${item.name} service facts`}>
              <ul className="divide-y divide-[var(--ae-public-line)]/80">
                {item.services.map((service) => (
                  <li
                    key={service.slug}
                    className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,1.1fr)_minmax(14rem,0.8fr)]"
                  >
                    <div className="grid content-start gap-2">
                      <div className="grid gap-1">
                        <h3 className="text-balance font-heading text-base font-medium leading-snug text-foreground">
                          {service.name}
                        </h3>
                        <p className="text-sm leading-6 text-muted-foreground">{service.category}</p>
                      </div>
                      <p className="text-pretty text-sm leading-6 text-muted-foreground">{service.summary}</p>
                    </div>
                    <dl className="grid gap-3 sm:grid-cols-3">
                      <RegistryFact label="Service area">{service.serviceArea}</RegistryFact>
                      <RegistryFact label="Hours">{service.hoursOrUnknown}</RegistryFact>
                      <RegistryFact label="Contact option">{contactOptionLabel(service.firstRequest.mode)}</RegistryFact>
                    </dl>
                    <div className="grid content-start gap-1">
                      <p className="text-sm font-medium leading-6 text-foreground">Best next step:</p>
                      <p className="text-pretty text-sm leading-6 text-muted-foreground">
                        {service.firstRequest.noContactReason ?? service.firstRequest.publicDisclosure}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        </li>
      ))}
    </ul>
  )
}

function RegistryAvailabilityPill({ item }: { item: PublicBusinessCatalogApiDto }) {
  const input: PlainAvailabilityInput = {
    discoveryStatus: item.discoveryStatus,
    firstRequestMode: businessFirstRequestMode(item),
  }
  const label = plainAvailabilityLabel(input)
  const tone = availabilityTone(item.discoveryStatus)

  return (
    <Badge className="ae-status-badge" data-tone={tone} variant="secondary">
      {label}
    </Badge>
  )
}

function businessFirstRequestMode(item: PublicBusinessCatalogApiDto): FirstRequestMode {
  if (item.services.length === 0) {
    return 'not_available_yet'
  }
  const modes = item.services.map((service) => service.firstRequest.mode)
  if (modes.includes('inquiry_available')) {
    return 'inquiry_available'
  }
  if (modes.includes('quote_request_available')) {
    return 'quote_request_available'
  }
  return 'not_available_yet'
}

function availabilityTone(discoveryStatus: PublicBusinessCatalogApiDto['discoveryStatus']): 'neutral' | 'warning' | 'success' {
  if (discoveryStatus === 'unavailable') {
    return 'neutral'
  }
  if (discoveryStatus === 'degraded' || discoveryStatus === 'stale') {
    return 'warning'
  }
  return 'success'
}

function RegistryFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-sm font-medium leading-6 text-foreground">{label}</dt>
      <dd className="text-pretty text-sm leading-6 text-muted-foreground">{children}</dd>
    </div>
  )
}

function contactOptionLabel(mode: PublicBusinessCatalogApiDto['services'][number]['firstRequest']['mode']): string {
  if (mode === 'quote_request_available') {
    return 'Quote details supplied'
  }

  if (mode === 'inquiry_available') {
    return 'Contact instructions supplied'
  }

  return 'No contact option published yet'
}

function resultSummary(total: number, query: string): string {
  const label = total === 1 ? 'matching business' : 'matching businesses'
  if (query.length > 0) {
    return `${label} for "${query}".`
  }

  return total === 1 ? 'published business.' : 'published businesses.'
}

function RegistryPagination({
  query,
  limit,
  cursor,
  nextCursor,
  hasMore,
}: {
  query: string
  limit: number
  cursor?: string
  nextCursor?: string
  hasMore: boolean
}) {
  return (
    <nav aria-label="Business results pagination" className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="outline" disabled={cursor === undefined}>
        Previous
      </Button>
      {hasMore && nextCursor !== undefined ? (
        <Button asChild variant="outline">
          <Link to="/registry" search={{ q: query, limit, cursor: nextCursor }}>
            Next
          </Link>
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled>
          Next
        </Button>
      )}
    </nav>
  )
}

function RegistryLoading() {
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-16 md:px-6">
        <p className="text-sm leading-6 text-muted-foreground">Loading business listings.</p>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    </AePublicShell>
  )
}

function RegistryError() {
  return (
    <AePublicShell>
      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-16 md:px-6">
        <Alert variant="destructive">
          <AlertTitle>Business listings could not load</AlertTitle>
          <AlertDescription>
            Refresh the page. If your business is missing after it loads, claim your page so customers can find it.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/registry" search={{ q: '', limit: 10 }}>
              Try again
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/claim">Claim your business page</Link>
          </Button>
        </div>
      </section>
    </AePublicShell>
  )
}
