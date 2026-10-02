import { createFileRoute, Link } from '@tanstack/react-router'

import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { HostGrouping } from '@/components/ae/shared/HostGrouping'
import { projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import '@/components/ae/shared/ProviderCatalogueComposition.css'
import { cn } from '@/lib/utils'
import { directoryTitle } from '@/modules/market/directory-card.view-model'
import { directoryProviderKey, directorySlugBase } from '@/modules/market/x402-directory-index'
import { readX402DirectoryCatalogueServer } from '@/modules/market/x402-directory-index.functions'
import { x402DirectoryFilterSchema } from '@/modules/market/x402-directory'
import { projectDirectoryListing } from '@/modules/registry/public'

export const Route = createFileRoute('/providers/$providerHost')({
  loader: async ({ params }) => {
    const parsed = x402DirectoryFilterSchema.pick({ provider: true }).safeParse({ provider: params.providerHost })
    if (!parsed.success || parsed.data.provider !== params.providerHost) return { kind: 'invalid' as const }
    const catalogue = await readX402DirectoryCatalogueServer({ data: { provider: params.providerHost, sort: 'popular' } })
    return { kind: 'found' as const, catalogue }
  },
  head: ({ params }) => ({ meta: [{ title: `${params.providerHost} · directory Host | Agentic Economy` }, { name: 'description', content: `Directory listings from ${params.providerHost}. This Host is not a verified Provider identity.` }] }),
  pendingComponent: () => <AePageSkeleton title="Loading directory Host…" description="Loading sourced listings…" shape="detail" />,
  errorComponent: HostError,
  component: HostPage,
})

function HostPage() {
  const result = Route.useLoaderData()
  const { providerHost } = Route.useParams()
  if (result.kind !== 'found' || result.catalogue.kind !== 'ok') return <HostError />
  const views = result.catalogue.page.items.map(entry => {
    const listing = projectDirectoryListing({ ...entry, title: directoryTitle(entry) })
    const href = `/tools/${encodeURIComponent(directoryProviderKey(entry.provider))}/${encodeURIComponent(entry.slug ?? directorySlugBase(entry.resource))}`
    return projectToolObject(listing, href)
  })
  const hostname = views[0]?.listing.identity.hostName ?? { kind: 'present' as const, value: providerHost, sourceRef: `Coinbase Bazaar:${providerHost}`, provenance: 'directory_reported' as const, scope: 'directory_resource' as const }
  return <AePublicPage><article className="ae-rail arc-provider-catalogue"><nav aria-label="Breadcrumb"><Link to="/market" className="min-h-touch content-center text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Market</Link><span aria-hidden="true"> / </span>Directory Host</nav><HostGrouping hostname={hostname} listings={views} />{result.catalogue.isDone ? null : <p className="text-sm text-muted-foreground">Showing the first page of this Host’s directory listings. Browse Market for further results.</p>}</article></AePublicPage>
}

function HostError() {
  return <AePageState tone="warning" title="Directory Host unavailable" description="This Host's sourced listings cannot be checked right now. Try again or browse the Market." action={<Link to="/market" className={cn(arcButtonStyles.button, arcButtonStyles.primary, arcButtonStyles.md)}>Browse Market</Link>} />
}
