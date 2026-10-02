import { ArrowLeftIcon, ArrowUpRightIcon, BracesIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { ProviderIdentity } from '@/components/ae/shared/ProviderIdentity'
import { ProviderPortfolio } from '@/components/ae/shared/ProviderPortfolio'
import arcButtonStyles from '@/components/arc/button/button.module.css'
import '@/components/ae/shared/ProviderCatalogueComposition.css'
import { cn } from '@/lib/utils'
import { telUri } from '@/lib/ui/tel-uri'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { isPublicHttpsUrl } from '@/modules/catalog/public'
import { projectCatalogueEndpointListing, type PublicBusinessCatalogApiV2Dto, type ServiceDto } from '@/modules/registry/public'
import { projectToolObject } from '@/components/ae/shared/listing-family.view-model'
import type { PublicOfferingSupplyView } from '@/components/ae/offerings/offering-presentation'

export type AeProviderListingPageProps = Readonly<{
  catalog: PublicBusinessCatalogApiV2Dto
  agentJsonUrl: string
  service?: ServiceDto
  supply?: PublicOfferingSupplyView
  backFrom?: 'thread'
  backThreadId?: string
}>
export function AeProviderListingPage({ catalog, agentJsonUrl, service, supply, backFrom, backThreadId }: AeProviderListingPageProps) {
  const websiteHref = catalog.businessContext.kind === 'programmable_provider' && isPublicHttpsUrl(catalog.businessContext.website) ? catalog.businessContext.website : undefined
  const offerings = service?.endpoints.map(endpoint => {
    const listing = projectCatalogueEndpointListing(service, endpoint)
    const href = listing.canonicalToolRef.kind === 'present' ? `/tools/${encodeURIComponent(listing.canonicalToolRef.value)}` : ''
    return projectToolObject(listing, href)
  }) ?? []
  const otherOfferings = (supply?.offerings.map(item => item.offering) ?? service?.ae.offerings ?? catalog.offerings).filter(offering => !service?.endpoints.some(endpoint => endpoint.ae.offeringRef === offering.offeringRef)).map(offering => {
    const catalogOffering = catalog.offerings.find(item => item.offeringRef === offering.offeringRef)
    const suppliedPaths = supply?.offerings.find(item => item.offering.offeringRef === offering.offeringRef)?.accessPaths
    const disclosure = suppliedPaths?.find(path => path.descriptor.kind === 'human_request')?.descriptor
    const webPath = catalogOffering?.accessPaths.find(path => path.kind === 'human_request' && path.channel === 'website' && path.url !== undefined)
    const href = webPath?.kind === 'human_request' && webPath.url !== undefined && isPublicHttpsUrl(webPath.url) ? webPath.url : undefined
    return { name: offering.name, summary: [offering.summary, disclosure?.kind === 'human_request' ? disclosure.disclosure : undefined].filter(Boolean).join(' '), ...(href === undefined ? {} : { href }) }
  })
  const name = { kind: 'present' as const, value: catalog.name, sourceRef: catalog.businessId, provenance: 'business_published' as const, scope: 'business' as const }
  const summary = service?.description === undefined ? undefined : { ...name, value: service.description }
  return <article className="ae-rail arc-provider-catalogue">
    <nav aria-label="Breadcrumb"><ListingBackLink {...(backFrom === undefined ? {} : { from: backFrom })} {...(backThreadId === undefined ? {} : { threadId: backThreadId })} /></nav>
    <ProviderIdentity name={name} {...(summary === undefined ? {} : { summary })} {...(websiteHref === undefined ? {} : { href: websiteHref })} />
    <div className="arc-provider-layout">
      <ProviderPortfolio offerings={offerings} otherOfferings={otherOfferings} />
      <aside aria-label="Provider information" className="arc-provider-aside">
        <section><h2>About this Provider</h2><p>Published Business portfolio. A listed endpoint is not callable through AE unless it is exactly joined to an admitted Tool.</p>
          <AeFactList facts={[{ label: 'Category', value: catalog.category }, { label: 'Last indexed', value: <time dateTime={timestampIso(catalog.observedAt)}>{formatTimestamp(catalog.observedAt)}</time> }, ...(catalog.responseTimeMinutes === undefined ? [] : [{ label: 'Published response time', value: `${catalog.responseTimeMinutes} min` }])]} />
          {websiteHref === undefined ? null : <a href={websiteHref} target="_blank" rel="noreferrer" aria-label="Provider website (opens in a new tab)" className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md, 'justify-between text-left')}>Provider website<ArrowUpRightIcon className="shrink-0" aria-hidden="true" /></a>}
          {catalog.businessContext.kind !== 'local_human' || catalog.businessContext.publishedPhone === undefined ? null : <a href={telUri(catalog.businessContext.publishedPhone)} className={cn(arcButtonStyles.button, arcButtonStyles.secondary, arcButtonStyles.md)}>Phone provider</a>}
        </section>
        <details className="arc-provider-json"><summary><BracesIcon className="size-4" aria-hidden="true" />Agent-readable catalogue</summary><div><p>Inspect the public JSON projection without parsing this page.</p><AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} /></div></details>
        <Link to="/privacy/remove-business" className="arc-provider-text-link">Correct or remove this Provider</Link>
      </aside>
    </div>
  </article>
}

export function ListingFirstScreen({ catalog }: Readonly<{ catalog: PublicBusinessCatalogApiV2Dto }>) {
  return <AeFactList facts={[{ label: 'Category', value: catalog.category }, { label: 'Last indexed', value: <time dateTime={timestampIso(catalog.observedAt)}>{formatTimestamp(catalog.observedAt)}</time> }]} />
}

function ListingBackLink({ from, threadId }: Readonly<{ from?: 'thread'; threadId?: string }>) {
  if (from === 'thread' && threadId !== undefined) return <Link to="/t/$threadId" params={{ threadId }} className={cn(arcButtonStyles.button, arcButtonStyles.ghost, arcButtonStyles.md)}><ArrowLeftIcon aria-hidden="true" />Back to result</Link>
  return <Link to="/market" className={cn(arcButtonStyles.button, arcButtonStyles.ghost, arcButtonStyles.md)}><ArrowLeftIcon aria-hidden="true" />Browse Market</Link>
}
