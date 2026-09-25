import { createFileRoute, redirect } from '@tanstack/react-router'

import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { DirectoryToolPage } from '@/components/ae/market/public-tool-detail/DirectoryToolPage'
import { MarketBackButton } from '@/components/ae/market/public-tool-detail/MarketBackButton'
import { directoryTitle } from '@/modules/market/directory-card.view-model'
import { readX402DirectoryCatalogueBySlugServer } from '@/modules/market/x402-directory-index.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

const providerHostPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u

export const Route = createFileRoute('/tools/$providerHost/$slug')({
  loader: async ({ params }) => {
    if (!providerHostPattern.test(params.providerHost) || params.slug.length === 0 || params.slug.length > 200) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' } }
    }
    const metadata = await readX402DirectoryCatalogueBySlugServer({ data: { providerKey: params.providerHost, slug: params.slug } })
    if (metadata.kind === 'found' && metadata.item.toolRef !== undefined) {
      throw redirect({ to: '/tools/$toolRef', params: { toolRef: metadata.item.toolRef }, replace: true })
    }
    return { metadata }
  },
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
  const { metadata } = Route.useLoaderData()
  return <DirectoryToolPage metadata={metadata} providerHost={providerHost} slug={slug} />
}
