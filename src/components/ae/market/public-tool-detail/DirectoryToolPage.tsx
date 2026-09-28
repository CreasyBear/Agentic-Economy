import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { AePageState } from '@/components/ae/layout/AePageState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { ToolDetailFacts } from '@/components/ae/shared/ToolDetailFacts'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { buttonVariants } from '@/components/ui/button-variants'
import { directoryTitle } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'
import { projectDirectoryListing } from '@/modules/registry/public'
import type { ReferenceRate } from '@/modules/money/public'
import { TOOL_UNAVAILABLE_COPY } from './public-tool-detail.contracts'

export type DirectoryToolPageProps = Readonly<{ metadata: X402DirectoryCatalogueResource; providerHost: string; slug: string; referenceRate?: ReferenceRate }>

export function DirectoryToolPage({ metadata, providerHost, slug, referenceRate }: DirectoryToolPageProps) {
  const [readAt] = useState(() => Date.now())
  if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') {
    const reason = metadata.kind === 'not_found' ? 'resource_not_found' : metadata.reason === 'query_invalid' ? 'query_invalid' : 'source_unavailable'
    const copy = TOOL_UNAVAILABLE_COPY[reason]
    return <AePageState tone="warning" title={copy.title} description={`${copy.cause} ${copy.nextStep}`} action={<Link to={copy.action.to} className={buttonVariants({ className: 'min-h-touch' })}>{copy.action.label}</Link>} />
  }
  const entry = metadata.item.entry
  const listing = projectDirectoryListing({ ...entry, title: directoryTitle(entry) })
  const view = projectToolObject(listing, `/tools/${encodeURIComponent(providerHost)}/${encodeURIComponent(slug)}`, readAt, referenceRate)
  const indexedSourceRouteRef = metadata.kind === 'found' ? metadata.item.choice?.sourceRouteRef ?? metadata.item.sourceRouteRef : undefined
  const capability = entry.description || entry.category || entry.tags?.join(' ') || ''
  const alternativeHref = alternativeToolSearchHref(listing, capability, indexedSourceRouteRef)
  return <AePublicPage>
    <article className="ae-rail grid min-w-0 gap-section pb-page pt-section">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground"><Link to="/market" className="min-h-touch content-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">Market</Link><span aria-hidden="true"> / </span>Tool</nav>
      <ToolDetailFacts view={view} hideTechnicalRefs primary={{ label: indexedSourceRouteRef === undefined || capability.trim().length === 0 ? 'Browse Market' : 'Search callable alternatives', onSelect: () => { window.location.assign(alternativeHref) } }} />
      <p className="text-sm text-muted-foreground">Coinbase Bazaar directory listing only. No admitted AE Tool or verified execution Provider is attached to this listing. Inspect its source input before use; no AE Quote or Call is available here.</p>
      {listing.facts.price.kind === 'present' && listing.facts.price.value.kind !== 'quote_required' && listing.facts.price.value.currency === 'USDC' ? <p className="text-sm text-muted-foreground">Provider-listed source price: {listing.facts.price.value.kind === 'range' ? `${listing.facts.price.value.minimum}–${listing.facts.price.value.maximum}` : listing.facts.price.value.amount} USDC per Call.</p> : null}
      <section aria-labelledby="example-heading" className="grid min-w-0 gap-related border-t border-border pt-section">
        <h2 id="example-heading" className="text-title font-medium">Example</h2>
        {entry.input?.exampleJson === undefined ? <p className="text-sm text-muted-foreground">No example input was published in this directory listing.</p> : <div className="grid min-w-0 gap-intra"><p className="text-sm text-muted-foreground">Provider-published input</p><pre className="max-w-full overflow-x-auto rounded-card bg-muted p-gutter text-xs"><code>{entry.input.exampleJson}</code></pre></div>}
        {entry.output?.exampleJson === undefined ? <p className="text-sm text-muted-foreground">No example output was published.</p> : <div className="grid min-w-0 gap-intra"><p className="text-sm text-muted-foreground">Provider-published output</p><pre className="max-w-full overflow-x-auto rounded-card bg-muted p-gutter text-xs"><code>{entry.output.exampleJson}</code></pre></div>}
      </section>
      <details className="min-w-0 rounded-card border border-border"><summary className="min-h-touch cursor-pointer px-gutter py-related font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Technical · endpoint and source</summary><div className="grid min-w-0 gap-intra border-t border-border p-gutter text-sm"><p className="break-all">Source: Coinbase Bazaar</p><p className="break-all">Endpoint: {entry.resource}</p>{entry.method === undefined ? null : <p>Method: {entry.method}</p>}{entry.input?.schemaJson === undefined ? null : <pre className="max-w-full overflow-x-auto rounded-card bg-muted p-related text-xs"><code>{entry.input.schemaJson}</code></pre>}</div></details>
    </article>
  </AePublicPage>
}
