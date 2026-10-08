import { directoryProviderKey } from '@/modules/market/x402-directory-index'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { DirectoryToolPage } from '@/components/ae/market/public-tool-detail/DirectoryToolPage'
import { MarketBackButton } from '@/components/ae/market/public-tool-detail/MarketBackButton'
import { directoryTitle } from '@/modules/market/directory-card.view-model'
import { readDirectoryToolDetailRouteServer } from '@/modules/market/tool-detail-route.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

const providerHostPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u

export const Route = createFileRoute('/tools/$providerHost/$slug')({
  loader: async ({ params, location }) => {
    if (!providerHostPattern.test(params.providerHost) || params.slug.length === 0 || params.slug.length > 200) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' } }
    }
    const resolved = /^registry:[a-f0-9]{64}$/u.test(params.slug)
      ? await readDirectoryToolDetailRouteServer({ data: { id: params.slug } })
      : await readDirectoryToolDetailRouteServer({ data: { providerKey: params.providerHost, slug: params.slug } })
    const { metadata, referenceRate } = resolved
    if ((metadata.kind === 'found' || metadata.kind === 'found_upstream') && directoryProviderKey(metadata.item.entry.provider) !== params.providerHost) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' } }
    }
    if (metadata.kind === 'found' && metadata.item.toolRef !== undefined) {
      throw redirect({ to: '/tools/$toolRef', params: { toolRef: metadata.item.toolRef }, replace: true, state: location.state.fromMarket === true ? { fromMarket: true } : {} })
    }
    return { metadata, referenceRate }
  },
  // Public browsing shares Market's short freshness window; Quote/Call authority is fetched separately.
  staleTime: 30_000,
  preloadStaleTime: 30_000,
  head: ({ params, loaderData }) => {
    if (loaderData?.metadata.kind !== 'found' && loaderData?.metadata.kind !== 'found_upstream') {
      return { meta: [{ title: 'Tool unavailable | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }
    }
    const entry = loaderData.metadata.item.entry
    return buildPublicPageHead({ path: `/tools/${params.providerHost}/${params.slug}`, title: `${directoryTitle(entry)} | Agentic Economy`, description: entry.description })
  },
  pendingComponent: () => <AePageSkeleton title="Loading this Tool…" description="Loading this Tool…" shape="detail" />,
  errorComponent: () => <AePageState tone="warning" title="Tool details are unavailable" description="Agentic Economy cannot verify this directory listing right now." action={<MarketBackButton label="Browse Market" className="min-h-touch" />} />,
  component: DirectoryToolRoute,
})

function DirectoryToolRoute() {
  const { providerHost, slug } = Route.useParams()
  const { metadata, referenceRate } = Route.useLoaderData()
  return <DirectoryToolPage metadata={metadata} providerHost={providerHost} slug={slug} {...(referenceRate === undefined ? {} : { referenceRate })} />
}
