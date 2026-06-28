import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { SearchIcon } from 'lucide-react'
import { z } from 'zod'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeStatusBadge } from '@/components/ae/status/AeStatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { PublicBusinessCatalogApiDto, PublicBusinessCatalogApiPage } from '@/modules/registry/public'
import { readPublicRegistryCatalogPage, readPublicRegistrySearchPage } from './api.businesses'

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
      { title: 'Registry | Agentic Economy' },
      {
        name: 'description',
        content: 'Search published local service catalog facts from Agentic Economy source-owned registry state.',
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
        eyebrow="Registry"
        title="Search published service catalog facts."
        description="The registry lists public, non-suppressed service facts from the same catalog DTO as business pages and JSON routes."
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <RegistrySearchForm query={query} limit={limit} />
        {isEmpty && !hasQuery ? (
          <AeEmptyState
            title="No public catalog records"
            description="Published, non-suppressed service catalogs will appear here after projection readback."
            action={
              <Button asChild>
                <Link to="/claim">Claim your service page</Link>
              </Button>
            }
          />
        ) : null}
        {isEmpty && hasQuery ? (
          <AeEmptyState
            title="No registry results"
            description="No published, non-suppressed service catalog matches this search."
            action={
              <Button asChild variant="outline">
                <Link to="/registry" search={{ q: '', limit }}>
                  Clear search
                </Link>
              </Button>
            }
          />
        ) : null}
        {!isEmpty ? (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {hasQuery ? `${result.pagination.total} result for "${query}".` : `${result.pagination.total} public catalog record.`}
              </p>
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
    <Card>
      <CardHeader>
        <CardTitle>Registry search</CardTitle>
        <CardDescription>Matches business name, service name, category, suburb, state, postcode, and service-area text.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/registry" method="get" className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="grid gap-2">
            <span className="text-sm font-medium text-foreground">Search registry</span>
            <Input name="q" defaultValue={query} placeholder="emergency plumber parramatta" />
          </label>
          <input type="hidden" name="limit" value={String(limit)} />
          <Button type="submit" className="self-end">
            <SearchIcon data-icon="inline-start" />
            Search
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function RegistryResultList({ items }: { items: readonly PublicBusinessCatalogApiDto[] }) {
  return (
    <ul className="grid gap-4" aria-label="Registry results">
      {items.map((item) => (
        <li key={item.slug}>
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="grid gap-1">
                  <CardTitle>{item.name}</CardTitle>
                  <CardDescription>
                    {item.category} in {item.suburb}, {item.stateTerritory}
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to="/$slug" params={{ slug: item.slug }}>
                    Open page
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2 md:grid-cols-2">
                <AeStatusBadge status={item.indexStatus} />
                <AeStatusBadge status={item.discoveryStatus} />
              </div>
              <div className="grid gap-3">
                {item.services.map((service) => (
                  <div key={service.slug} className="rounded-md bg-muted/40 p-3">
                    <p className="font-medium text-foreground">{service.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{service.summary}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{service.serviceArea}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  )
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
    <nav aria-label="Registry pagination" className="flex flex-wrap items-center justify-between gap-3">
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
      <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-6">
        <Alert variant="destructive">
          <AlertTitle>Registry unavailable</AlertTitle>
          <AlertDescription>Registry readback could not be rendered from source-owned catalog state.</AlertDescription>
        </Alert>
      </section>
    </AePublicShell>
  )
}
