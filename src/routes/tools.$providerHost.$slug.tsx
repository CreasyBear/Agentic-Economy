import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'

import { DirectoryToolPage } from '@/components/ae/market/public-tool-detail/DirectoryToolPage'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import { ToolPageSkeleton } from '@/components/ae/market/public-tool-detail/ToolPageSkeleton'
import { ToolPageState } from '@/components/ae/market/public-tool-detail/ToolPageState'
import { validateToolPageSearch, type ToolPageSearch } from '@/components/ae/market/public-tool-detail/tool-page-search'
import { Button } from '@/components/arc/button/button'
import { BRAND_NAME } from '@/content/brand-copy'
import { degrade } from '@/lib/observability/degrade'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { toDirectoryToolCardModel } from '@/modules/market/directory-card.view-model'
import { readDirectoryToolDetailRouteServer, readPublicToolDetailRouteServer } from '@/modules/market/tool-detail-route.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

const providerHostPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u

export const Route = createFileRoute('/tools/$providerHost/$slug')({
  validateSearch: validateToolPageSearch,
  loader: async ({ params, location }) => {
    if (!providerHostPattern.test(params.providerHost) || params.slug.length === 0 || params.slug.length > 200) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' }, baseUrl: undefined }
    }
    const [resolved, baseUrl] = await Promise.all([
      /^registry:[a-f0-9]{64}$/u.test(params.slug)
        ? readDirectoryToolDetailRouteServer({ data: { id: params.slug } })
        : readDirectoryToolDetailRouteServer({ data: { providerKey: params.providerHost, slug: params.slug } }),
      // Only the connect block needs the site URL; a missing one hides that block, never the Tool.
      readCanonicalBaseUrlServer()
        .catch(cause => degrade(cause, undefined, { site: 'toolCanonicalUrl', reason: 'source_unavailable' })),
    ])
    const { metadata, referenceRate } = resolved
    if ((metadata.kind === 'found' || metadata.kind === 'found_upstream') && directoryProviderKey(metadata.item.entry.provider) !== params.providerHost) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' }, baseUrl }
    }
    // A current publication can still be dropped by the detail projection; redirect only when the Tool page will render.
    const toolRef = metadata.kind === 'found' ? metadata.item.toolRef : undefined
    const detail = toolRef === undefined ? undefined : await readPublicToolDetailRouteServer({ data: { toolRef } }).catch(() => undefined)
    if (toolRef !== undefined && detail?.kind === 'found') {
      throw redirect({ to: '/tools/$toolRef', params: { toolRef }, replace: true, state: location.state.fromMarket === true ? { fromMarket: true } : {} })
    }
    return { metadata, referenceRate, baseUrl }
  },
  // Public browsing shares Market's short freshness window; Quote/Call authority is fetched separately.
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  head: ({ params, loaderData }) => {
    if (loaderData?.metadata.kind !== 'found' && loaderData?.metadata.kind !== 'found_upstream') {
      return { meta: [{ title: `Tool unavailable | ${BRAND_NAME}` }, { name: 'robots', content: 'noindex' }] }
    }
    const entry = loaderData.metadata.item.entry
    return buildPublicPageHead({ path: `/tools/${params.providerHost}/${params.slug}`, title: `${toDirectoryToolCardModel(entry).title} | ${BRAND_NAME}`, description: entry.description })
  },
  pendingComponent: ToolPageSkeleton,
  errorComponent: DirectoryToolError,
  component: DirectoryToolRoute,
})

function DirectoryToolRoute() {
  const { providerHost, slug } = Route.useParams()
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const onSearchChange = useCallback((next: ToolPageSearch) => { void navigate({ search: next, replace: true, resetScroll: false }) }, [navigate])
  return <DirectoryToolPage metadata={data.metadata} providerHost={providerHost} slug={slug} baseUrl={data.baseUrl} search={search} onSearchChange={onSearchChange} {...('referenceRate' in data && data.referenceRate !== undefined ? { referenceRate: data.referenceRate } : {})} />
}

function DirectoryToolError() {
  const router = useRouter()
  return <ToolPageState title="Tool details are unavailable" description={`${BRAND_NAME} can't read this directory listing right now.`} action={<><Button type="button" variant="primary" className="min-h-touch" onClick={() => { void router.invalidate() }}>Try again</Button><Link to="/market" className={`${actionLinkClassName('secondary', 'md')} min-h-touch`}>Browse tools</Link></>} />
}
