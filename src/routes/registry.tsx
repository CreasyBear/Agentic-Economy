import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { AeRegistrySearchPanel } from '@/components/ae/forms/AeRegistrySearchPanel'
import { AeRegistryCard } from '@/components/ae/registry/AeRegistryCard'
import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeRegistryFunnelBoot } from '@/components/ae/layout/AeRegistryFunnelBoot'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { FirstRequestMode } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiPage } from '@/modules/registry/public'
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
    }),
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
      <AeRegistryFunnelBoot query={query} />
      <section className="ae-public-page ae-registry-page mx-auto w-full max-w-6xl">
        <div className="ae-registry-search-hero">
          <h1 className="ae-registry-search-hero__title">
            {hasQuery ? `Results for “${query}”` : 'Find business details companies can stand behind.'}
          </h1>
          <p className="ae-registry-search-hero__lede">
            Browse claimed service pages. For a cited answer to a specific need, start from Ask on the home page.
          </p>
          <AeRegistrySearchPanel query={query} limit={limit} />
        </div>

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
            <div className="ae-registry-results-meta">
              <p className="text-sm text-muted-foreground">
                <span data-numeric>{result.pagination.total}</span> {resultSummary(result.pagination.total, query)}
              </p>
              <RegistryClaimPrompt />
            </div>
            <ul className="ae-registry-grid" aria-label="Business results">
              {result.items.map((item) => (
                <li key={item.slug}>
                  <AeRegistryCard item={item} />
                </li>
              ))}
            </ul>
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

function RegistryClaimPrompt() {
  return (
    <div className="ae-registry-claim-strip">
      <p className="max-w-2xl text-pretty text-sm leading-6 text-muted-foreground">
        Own one of these businesses? Claim your page so customers see the details you approve.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link to="/claim">Claim your business page</Link>
      </Button>
    </div>
  )
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
      <div className="min-h-10 flex items-center">
        {cursor !== undefined ? (
          <Button asChild variant="outline">
            <Link to="/registry" search={{ q: query, limit }}>
              Back to start
            </Link>
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">First page</span>
        )}
      </div>
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
      <section className="ae-public-page ae-registry-page mx-auto w-full max-w-6xl">
        <p className="text-sm leading-6 text-muted-foreground">Loading business listings.</p>
        <Skeleton className="h-10 w-64" />
        <div className="ae-registry-grid">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </section>
    </AePublicShell>
  )
}

function RegistryError() {
  return (
    <AePublicShell>
      <section className="ae-public-page ae-registry-page mx-auto w-full max-w-6xl">
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
