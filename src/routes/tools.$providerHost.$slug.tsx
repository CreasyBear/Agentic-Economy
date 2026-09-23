import { createFileRoute } from '@tanstack/react-router'

import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AeDirectoryToolCanonicalPage } from '@/components/ae/market/public-tool-detail/AeDirectoryToolCanonicalPage'
import { MarketBackButton } from '@/components/ae/market/public-tool-detail/MarketBackButton'
import { directoryTitle } from '@/modules/market/directory-card.view-model'
import { resolveDirectoryToolDetail } from '@/modules/market/tool-detail-presentation'
import { readX402DirectoryCatalogueBySlugServer, readX402DirectoryCatalogueServer } from '@/modules/market/x402-directory-index.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

const providerHostPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u

export const Route = createFileRoute('/tools/$providerHost/$slug')({
  loader: async ({ params }) => {
    if (!providerHostPattern.test(params.providerHost) || params.slug.length === 0 || params.slug.length > 200) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' }, admission: undefined }
    }
    const metadata = await readX402DirectoryCatalogueBySlugServer({ data: { providerKey: params.providerHost, slug: params.slug } })
    if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') return { metadata, admission: undefined }
    // Not awaited: the directory metadata below (title, Provider, price,
    // description) already renders from `metadata`, and this promise is
    // consumed by `<Await>` so the admitted Tool detail swaps in once ready
    // (or ToolUnavailable, on refusal) without blocking first content.
    const admission = resolveDirectoryToolDetail(metadata.item.entry.resource, metadata.kind === 'found' ? metadata.item.toolRef : undefined)
    const endpoints = await readProviderEndpoints(params.providerHost)
    return { metadata, admission, endpoints }
  },
  head: ({ params, loaderData }) => {
    if (loaderData?.metadata.kind !== 'found' && loaderData?.metadata.kind !== 'found_upstream') {
      return { meta: [{ title: 'Tool unavailable | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }
    }
    const entry = loaderData.metadata.item.entry
    return buildPublicPageHead({
      path: `/tools/${params.providerHost}/${params.slug}`,
      title: `${directoryTitle(entry)} | Agentic Economy`,
      description: entry.description,
    })
  },
  pendingComponent: () => <AePageSkeleton title="Loading this Tool…" description="Loading this Tool…" shape="detail" />,
  errorComponent: () => <AePageState tone="warning" title="Tool details are unavailable" description="Agentic Economy cannot verify this Tool right now." action={<MarketBackButton label="Browse Market" className="min-h-touch" />} />,
  component: DirectoryToolCanonicalRoute,
})

function DirectoryToolCanonicalRoute() {
  const data = Route.useLoaderData()
  return <AeDirectoryToolCanonicalPage data={data} />
}

async function readProviderEndpoints(provider: string) {
  try {
    const catalogue = await readX402DirectoryCatalogueServer({ data: { provider, sort: 'popular' } })
    if (catalogue.kind !== 'ok') return { entries: [], truncated: false }
    return { entries: catalogue.page.items, truncated: !catalogue.isDone }
  } catch (cause) {
    console.error('[tools] provider endpoints unavailable', { cause })
    return { entries: [], truncated: false }
  }
}
