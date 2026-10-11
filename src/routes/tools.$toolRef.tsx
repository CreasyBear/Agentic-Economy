import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { useCallback } from 'react'

import { PublicToolDetail } from '@/components/ae/market/public-tool-detail/PublicToolDetail'
import { ToolPageSkeleton } from '@/components/ae/market/public-tool-detail/ToolPageSkeleton'
import { validateToolPageSearch, type ToolPageSearch } from '@/components/ae/market/public-tool-detail/tool-page-search'
import { BRAND_NAME } from '@/content/brand-copy'
import { degrade } from '@/lib/observability/degrade'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { toolDisplayTitle } from '@/modules/market/tool-view-model'
import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import {
  readDirectoryToolDetailRouteServer,
  readPublicToolDetailRouteServer,
  type PublicToolDetailRouteResult,
} from '@/modules/market/tool-detail-route.functions'

export { PublicToolDetail } from '@/components/ae/market/public-tool-detail/PublicToolDetail'

export const Route = createFileRoute('/tools/$toolRef')({
  validateSearch: validateToolPageSearch,
  loader: async ({ params }) => {
    // Registry listings render on the provider-host route; resolve the bare id there.
    if (/^registry:[a-f0-9]{64}$/u.test(params.toolRef)) {
      const { metadata } = await readDirectoryToolDetailRouteServer({ data: { id: params.toolRef } })
      if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') throw notFound({ data: { kind: 'not_found', toolRef: params.toolRef } })
      throw redirect({ to: '/tools/$providerHost/$slug', params: { providerHost: directoryProviderKey(metadata.item.entry.provider), slug: params.toolRef }, replace: true })
    }
    if (!isPublicToolRef(params.toolRef)) {
      throw notFound({ data: { kind: 'invalid_ref', toolRef: params.toolRef } })
    }
    const [result, baseUrl] = await Promise.all([
      readPublicToolDetailRouteServer({ data: { toolRef: params.toolRef } })
        .catch((): PublicToolDetailRouteResult => ({ kind: 'source_unavailable', toolRef: params.toolRef })),
      // Only the connect block needs the site URL; a missing one hides that block, never the Tool.
      readCanonicalBaseUrlServer()
        .catch(cause => degrade(cause, undefined, { site: 'toolCanonicalUrl', reason: 'source_unavailable' })),
    ])
    if (result.kind === 'not_found') throw notFound({ data: result })
    const evidence = result.kind === 'found' ? result.evidence : undefined
    return { result, evidence, baseUrl }
  },
  // Public browsing shares Market's short freshness window; Quote/Call authority is fetched separately.
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  head: ({ loaderData }) => {
    if (loaderData?.result.kind !== 'found') {
      return { meta: [
        { title: `Tool unavailable | ${BRAND_NAME}` },
        { name: 'robots', content: 'noindex' },
      ] }
    }
    return { meta: [
      { title: `${toolDisplayTitle(loaderData.result.tool)} | ${BRAND_NAME}` },
      { name: 'description', content: loaderData.result.tool.summary },
    ] }
  },
  pendingComponent: ToolPageSkeleton,
  errorComponent: ToolDetailError,
  notFoundComponent: ToolDetailNotFound,
  component: ToolDetailRoute,
})

function ToolDetailRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange = useCallback((next: ToolPageSearch) => { void navigate({ search: next, replace: true, resetScroll: false }) }, [navigate])
  return <PublicToolDetail result={data.result} baseUrl={data.baseUrl} search={search} onSearchChange={onSearchChange} />
}

function ToolDetailError() {
  const { toolRef } = Route.useParams()
  return <PublicToolDetail result={{ kind: 'source_unavailable', toolRef }} baseUrl={undefined} />
}

function ToolDetailNotFound({ data }: { data?: unknown }) {
  const { toolRef } = Route.useParams()
  const result = (data ?? { kind: 'invalid_ref', toolRef }) as Extract<PublicToolDetailRouteResult, { kind: 'invalid_ref' | 'not_found' }>
  return <PublicToolDetail result={result} baseUrl={undefined} />
}
