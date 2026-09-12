import { Await, createFileRoute } from '@tanstack/react-router'

import { AePageSkeleton, AePageState } from '@/components/ae/layout/AePageState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { directoryNetworkLabel, directoryPrice, directoryTitle } from '@/components/ae/market/directory-presentation'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import { readX402DirectoryCatalogueBySlugServer } from '@/modules/market/x402-directory-index.functions'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'
import { buildPublicPageHead } from '@/modules/seo/public'
import { MarketBackButton, PublicToolDetail, resolveDirectoryToolDetail, type ToolDetailPresentation } from './tools.$toolRef'

const providerHostPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u

export const Route = createFileRoute('/tools/$providerHost/$slug')({
  loader: async ({ params }) => {
    if (!providerHostPattern.test(params.providerHost) || params.slug.length === 0 || params.slug.length > 200) {
      return { metadata: { kind: 'unavailable' as const, reason: 'query_invalid' }, admission: undefined }
    }
    const metadata = await readX402DirectoryCatalogueBySlugServer({ data: { providerKey: params.providerHost, slug: params.slug } })
    if (metadata.kind !== 'found') return { metadata, admission: undefined }
    // Not awaited: the directory metadata below (title, Provider, price,
    // description) already renders from `metadata`, and this promise is
    // consumed by `<Await>` so the admitted Tool detail swaps in once ready
    // (or ToolUnavailable, on refusal) without blocking first content.
    const admission = resolveDirectoryToolDetail(metadata.item.entry.resource, metadata.item.toolRef)
    return { metadata, admission }
  },
  head: ({ params, loaderData }) => {
    if (loaderData?.metadata.kind !== 'found') {
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
  errorComponent: () => <AePageState tone="warning" title="Tool details are unavailable" description="AE cannot verify the current descriptor right now." action={<MarketBackButton label="Browse current Tools" className="min-h-touch" />} />,
  component: DirectoryToolCanonicalRoute,
})

function DirectoryToolCanonicalRoute() {
  const data = Route.useLoaderData()
  if (data.metadata.kind !== 'found') {
    return <DirectoryEntryUnavailable metadata={data.metadata} />
  }
  const { admission, metadata } = data
  // The loader only omits `admission` alongside a non-'found' metadata, so
  // this is unreachable in practice; kept for type soundness.
  if (admission === undefined) {
    return <DirectoryEntryUnavailable metadata={{ kind: 'unavailable', reason: 'source_unavailable' }} />
  }
  return (
    <Await promise={admission} fallback={<DirectoryEntrySummaryPage entry={metadata.item.entry} />}>
      {(resolved: ToolDetailPresentation) => <PublicToolDetail result={resolved.result} {...(resolved.evidence === undefined ? {} : { evidence: resolved.evidence })} />}
    </Await>
  )
}

/** Renders at once from the indexed lookup, before the admission promise resolves - title, Provider, price and description, per the design's "no blank first content" requirement. */
function DirectoryEntrySummaryPage({ entry }: Readonly<{ entry: X402DirectoryEntry }>) {
  const network = directoryNetworkLabel(entry)
  return (
    <AePublicPage
      kind="workspace"
      title={directoryTitle(entry)}
      description={entry.provider}
      actions={<MarketBackButton label="Catalog" className="min-h-touch" variant="ghost" />}
    >
      <div className="grid max-w-2xl gap-related">
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.description}</p>
        <div>
          <p className="text-lg font-semibold tabular-nums">{directoryPrice(entry)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{network ?? 'Provider price'}{entry.prices.length > 1 ? ` · ${entry.prices.length} payment options` : ' · per Call'}</p>
        </div>
        <p role="status" className="text-sm text-muted-foreground">Checking whether this Tool is ready to call…</p>
      </div>
    </AePublicPage>
  )
}

function DirectoryEntryUnavailable({ metadata }: Readonly<{ metadata: Exclude<X402DirectoryCatalogueResource, { kind: 'found' }> }>) {
  const presentation = metadata.kind === 'not_found'
    ? { tone: 'neutral' as const, title: 'This Tool is unknown or no longer listed', description: 'AE has no current directory entry for this reference.' }
    : { tone: 'warning' as const, title: 'Tool details are unavailable', description: metadata.reason === 'query_invalid' ? 'The Tool reference is malformed.' : 'AE cannot verify the current directory entry right now.' }
  return (
    <AePageState
      tone={presentation.tone}
      title={presentation.title}
      description={presentation.description}
      action={<MarketBackButton label="Browse current Tools" className="min-h-touch" />}
    />
  )
}
