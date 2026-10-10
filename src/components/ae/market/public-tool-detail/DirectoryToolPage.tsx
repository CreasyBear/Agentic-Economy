import { MarketBackButton } from './MarketBackButton'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { recordProductJourney } from '@/lib/observability/product-journey'

import { AePageState } from '@/components/ae/layout/AePageState'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { ToolFacts } from '@/components/ae/shared/ToolFacts'
import { alternativeToolSearchHref, projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import { ProductDetail, type DetailSlide } from '@/components/ae/shared/arc-pro/market/ProductDetail'
import { directoryTitle } from '@/modules/market/directory-card.view-model'
import type { X402DirectoryCatalogueResource } from '@/modules/market/x402-directory-catalogue'
import { projectDirectoryListing } from '@/modules/registry/public'
import type { ReferenceRate } from '@/modules/money/public'
import { TOOL_UNAVAILABLE_COPY } from './public-tool-detail.contracts'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

export type DirectoryToolPageProps = Readonly<{ metadata: X402DirectoryCatalogueResource; providerHost: string; slug: string; referenceRate?: ReferenceRate }>

export function DirectoryToolPage({ metadata, providerHost, slug, referenceRate }: DirectoryToolPageProps) {
  const [readAt] = useState(() => Date.now())
  useEffect(() => {
    recordProductJourney({ action: 'tool_viewed', phase: metadata.kind === 'found' || metadata.kind === 'found_upstream' ? 'observed' : 'failed', surface: 'tool', listingKind: 'external_listing' })
  }, [providerHost, slug, metadata.kind])
  if (metadata.kind !== 'found' && metadata.kind !== 'found_upstream') {
    const reason = metadata.kind === 'not_found' ? 'resource_not_found' : metadata.reason === 'query_invalid' ? 'query_invalid' : 'source_unavailable'
    const copy = TOOL_UNAVAILABLE_COPY[reason]
    return <AePageState tone="warning" title={copy.title} description={`${copy.cause} ${copy.nextStep}`} action={<Link to={copy.action.to} className={`${actionLinkClassName('primary', 'md')} min-h-touch`}>{copy.action.label}</Link>} />
  }
  const entry = metadata.item.entry
  const listing = projectDirectoryListing({ ...entry, title: directoryTitle(entry) })
  const view = projectToolObject(listing, `/tools/${encodeURIComponent(providerHost)}/${encodeURIComponent(slug)}`, readAt, referenceRate)
  const choice = metadata.kind === 'found' ? metadata.item.choice : undefined
  const callableRef = choice?.access === 'ae_callable' ? choice.toolRef : undefined
  const indexedSourceRouteRef = metadata.kind === 'found' ? choice?.sourceRouteRef ?? metadata.item.sourceRouteRef : undefined
  const capability = entry.description || entry.category || entry.tags?.join(' ') || ''
  const alternativeHref = alternativeToolSearchHref(listing, capability, indexedSourceRouteRef)
  const slides: DetailSlide[] = [{
    id: 'input-example', label: 'Input example',
    description: entry.input?.exampleJson === undefined ? 'No example input was published in this directory listing.' : 'Provider-published input',
    content: entry.input?.exampleJson === undefined
      ? <div className="arc-pdp-empty"><p>Inspect the published source contract under Technical. Examples are never inferred.</p></div>
      : <pre><code>{entry.input.exampleJson}</code></pre>,
  }]
  if (entry.output?.exampleJson !== undefined) slides.push({
    id: 'output-example', label: 'Output example', description: 'Provider-published output',
    content: <pre><code>{entry.output.exampleJson}</code></pre>,
  })
  return <AePublicPage>
    <div className="arc-pdp-page">
      <ProductDetail
        id={entry.resource}
        title={view.title}
        {...(view.outcome === undefined ? {} : { summary: view.outcome })}
        surfaceLabel="Directory listing"
        breadcrumb={<><MarketBackButton label="Back to results" className="min-h-touch" variant="ghost" /><span aria-hidden="true"> / </span><span aria-current="page">Tool</span></>}
        {...(view.price === undefined ? {} : { priceLabel: view.price.label })}
        facts={<>
          <ToolFacts view={{ title: view.title, listing, readiness: view.readiness }} />
          {view.identity === undefined ? null : <p>{view.identity.kind === 'verified_provider' ? 'Provider' : view.identity.kind === 'publisher' ? 'Publisher' : 'Directory Host'}: {view.identity.kind === 'publisher' ? <span>{view.identity.name}</span> : <a href={view.identity.href}>{view.identity.name}</a>}</p>}
          {view.identity?.kind === 'publisher' && listing.identity.hostName.kind === 'present' && listing.hostPage.kind === 'present' ? <p>Directory Host: <a href={listing.hostPage.value}>{listing.identity.hostName.value}</a></p> : null}
          <p>{callableRef === undefined
            ? `Currently unavailable. ${REASON_COPY[choice?.reason ?? 'fallback'] ?? REASON_COPY_FALLBACK}`
            : `Quote it with ref ${callableRef} through the ae CLI, MCP or HTTP.`}</p>
          <p className="arc-pdp-provenance">Title source: {listing.identity.title.provenance.replaceAll('_', ' ')}</p>
          {view.price === undefined ? null : <p className="arc-pdp-provenance">Price source: {listing.facts.price.provenance.replaceAll('_', ' ')}</p>}
          {view.readiness.source === undefined ? null : <p className="arc-pdp-provenance">Readiness source: {listing.facts.readiness.provenance.replaceAll('_', ' ')}</p>}
        </>}
        context={<>
          <p>Coinbase Bazaar directory listing. A Quote reads the live price, payee and network from the endpoint; nothing is charged until you Call.</p>
          {listing.facts.price.kind === 'present' && listing.facts.price.value.kind !== 'quote_required' && listing.facts.price.value.currency === 'USDC' ? <p>Provider-listed source price: {listing.facts.price.value.kind === 'range' ? `${listing.facts.price.value.minimum}–${listing.facts.price.value.maximum}` : listing.facts.price.value.amount} USDC per Call.</p> : null}
          {entry.output?.exampleJson === undefined ? <p>No example output was published.</p> : null}
        </>}
        primary={{ label: capability.trim().length === 0 ? 'Browse Market' : indexedSourceRouteRef === undefined ? 'Search for a similar Tool' : 'Search callable alternatives', onSelect: () => {
          recordProductJourney({ action: 'alternatives_requested', phase: 'attempted', surface: 'tool', listingKind: 'external_listing' })
          window.location.assign(alternativeHref)
        } }}
        slides={slides}
        sections={[{ id: 'technical', title: 'Technical · endpoint and source', content: <>
          <p>Source: Coinbase Bazaar</p><p>Endpoint: {entry.resource}</p>
          {entry.method === undefined ? null : <p>Method: {entry.method}</p>}
          {entry.input?.schemaJson === undefined ? null : <pre><code>{entry.input.schemaJson}</code></pre>}
        </> }]}
      />
    </div>
  </AePublicPage>
}
