import { ArrowLeftIcon, ArrowUpRightIcon, BracesIcon, Globe2Icon, PhoneIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { telUri } from '@/lib/ui/tel-uri'
import { formatOfferingPrice } from '@/modules/catalog/public'
import type { PublicBusinessCatalogApiV2Dto, PublicOfferingDto } from '@/modules/registry/public'
import type { PublicOfferingSupplyView } from '@/components/ae/offerings/offering-presentation'

export type AeProviderListingPageProps = {
  catalog: PublicBusinessCatalogApiV2Dto
  agentJsonUrl: string
  supply?: PublicOfferingSupplyView
  backFrom?: 'thread'
  backThreadId?: string
}

export function AeProviderListingPage({
  catalog,
  agentJsonUrl,
  supply,
  backFrom,
  backThreadId,
}: AeProviderListingPageProps) {
  const offerings = supply === undefined ? catalog.offerings : supply.offerings.map(supplyOfferingToDto)
  const readyCount = offerings.filter((offering) => offering.support.aeSupportedAction).length

  return (
    <div className="grid gap-section pb-page">
      <AePageHeader
        eyebrow="Supplier"
        title={catalog.name}
        description="Compare this supplier’s listed tools, exact prices, and access paths."
        actions={
          <nav aria-label="Breadcrumb">
            <ListingBackLink
              {...(backFrom === undefined ? {} : { from: backFrom })}
              {...(backThreadId === undefined ? {} : { threadId: backThreadId })}
            />
          </nav>
        }
        meta={`${offerings.length} listed · ${readyCount} ready now`}
      />
      <article className="ae-rail grid gap-section">
        <ListingFirstScreen catalog={catalog} offerings={offerings} />

        <div className="grid gap-section lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <section aria-labelledby="supplier-operations-title" className="overflow-hidden rounded-card border border-border bg-card">
            <div className="grid gap-intra border-b border-border p-gutter">
              <h2 id="supplier-operations-title" className="text-lg font-semibold text-foreground">Listed tools</h2>
              <p className="text-sm text-muted-foreground">Inspect the price, access path, and current readiness before calling.</p>
            </div>

          {offerings.length === 0 ? (
            <div className="grid gap-intra px-gutter py-section">
              <p className="font-medium text-foreground">No tools listed</p>
              <p className="text-sm text-muted-foreground">This supplier profile remains visible while its catalogue is prepared.</p>
            </div>
          ) : (
            <ul className="m-0 divide-y divide-border p-0" aria-label={`${catalog.name} tools`}>
              {offerings.map((offering) => (
                <OperationRow key={offering.offeringRef} offering={offering} catalog={catalog} />
              ))}
            </ul>
          )}
        </section>

        <aside className="grid gap-section lg:sticky lg:top-20" aria-label="Supplier information">
          <section aria-labelledby="supplier-details-title" className="grid gap-related">
            <div className="grid gap-intra">
              <h2 id="supplier-details-title" className="text-base font-medium text-foreground">Supplier details</h2>
              <p className="text-sm text-muted-foreground">Facts published with this catalogue entry.</p>
            </div>
            <AeFactList
              facts={[
                {
                  label: 'Supplier type',
                  value: catalog.businessContext.kind === 'programmable_provider' ? 'Programmable provider' : 'Human-operated supplier',
                },
                { label: 'Catalogue status', value: catalog.disposition === 'current' ? 'Current' : catalog.disposition },
                {
                  label: 'Observed',
                  value: <time dateTime={timestampIso(catalog.observedAt)}>{formatTimestamp(catalog.observedAt)}</time>,
                },
                ...(catalog.responseTimeMinutes === undefined
                  ? []
                  : [{ label: 'Published response time', value: `${catalog.responseTimeMinutes} min` }]),
                ...(catalog.businessContext.kind === 'programmable_provider'
                  ? [{ label: 'Provider ID', value: catalog.businessContext.providerIdentifier, mono: true }]
                  : [{ label: 'Location', value: `${catalog.businessContext.suburb}, ${catalog.businessContext.stateTerritory}` }]),
              ]}
            />
            {catalog.businessContext.kind !== 'programmable_provider' ? null : (
              <Button asChild variant="outline" className="min-h-touch w-full justify-between">
                <a href={catalog.businessContext.website} target="_blank" rel="noreferrer">
                  Supplier website <ArrowUpRightIcon aria-hidden="true" />
                </a>
              </Button>
            )}
          </section>

          <details className="rounded-card border border-border bg-card">
            <summary className="flex min-h-touch cursor-pointer items-center gap-intra px-gutter py-related text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <BracesIcon className="size-4" aria-hidden="true" /> Agent-readable catalogue
            </summary>
            <div className="grid gap-intra border-t border-border px-gutter py-related">
              <p className="text-sm text-muted-foreground">Use the public JSON projection to inspect this supplier without parsing the page.</p>
              <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
            </div>
          </details>

          <Link
            to="/privacy/remove-business"
            className="inline-flex min-h-touch items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Correct or remove this supplier
          </Link>
        </aside>
      </div>
    </article>
    </div>
  )
}

export function ListingFirstScreen({
  catalog,
  offerings = catalog.offerings,
}: {
  catalog: PublicBusinessCatalogApiV2Dto
  offerings?: readonly PublicOfferingDto[]
}) {
  const readyCount = offerings.filter((offering) => offering.support.aeSupportedAction).length

  return (
    <header className="grid gap-4" aria-label="Supplier facts">
      <p className="text-sm text-muted-foreground">{catalog.category}</p>
      <AeFactList
        className="sm:grid-cols-3"
        facts={[
          { label: 'Tools', value: String(offerings.length), mono: true },
          { label: 'Ready now', value: String(readyCount), mono: true },
          {
            label: 'Last indexed',
            value: <time dateTime={timestampIso(catalog.observedAt)}>{formatTimestamp(catalog.observedAt)}</time>,
          },
        ]}
      />
    </header>
  )
}

function OperationRow({ offering, catalog }: { offering: PublicOfferingDto; catalog: PublicBusinessCatalogApiV2Dto }) {
  const operationPath = offering.accessPaths.find((path) => path.kind === 'external_operation')
  const webPath = offering.accessPaths.find((path) => path.kind === 'human_request' && path.channel === 'website' && path.url !== undefined)
  const phone = catalog.businessContext.kind === 'local_human' ? catalog.businessContext.publishedPhone : undefined
  const phoneHref = phone === undefined ? undefined : telUri(phone)
  const accessNote = offering.accessPaths.find((path) => path.kind === 'human_request')?.disclosure
  const price = offering.price === undefined
    ? offering.pricingSummary ?? 'Price unknown'
    : formatOfferingPrice(offering.price)

  return (
    <li className="grid gap-related px-gutter py-gutter sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start sm:gap-section">
      <div className="grid min-w-0 gap-related">
        <div className="grid gap-intra">
          <div className="flex flex-wrap items-center gap-intra">
            <h3 className="text-base font-semibold text-foreground">{offering.name}</h3>
            <Badge variant={offering.support.aeSupportedAction ? 'success' : offering.support.integrated ? 'warning' : 'secondary'}>
              {offering.support.aeSupportedAction ? 'Ready now' : offering.support.integrated ? 'Setup required' : 'Inspect only'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{offering.summary}</p>
        </div>
        <AeFactList
          className="gap-related sm:grid-cols-3"
          facts={[
            { label: 'Category', value: offering.category },
            { label: 'Price', value: price, mono: true },
            { label: 'Availability', value: offering.availabilitySummary ?? 'Not published', muted: offering.availabilitySummary === undefined },
          ]}
        />
        {accessNote === undefined ? null : <p className="text-xs text-muted-foreground">{accessNote}</p>}
      </div>
      <div className="grid content-start gap-intra sm:self-center">
        {operationPath === undefined ? null : (
          <Button asChild size="sm" className="min-h-touch justify-between">
            <a href={operationPath.documentationUrl ?? operationPath.url} target="_blank" rel="noreferrer">
              Open provider route <ArrowUpRightIcon aria-hidden="true" />
            </a>
          </Button>
        )}
        {operationPath !== undefined || webPath === undefined ? null : (
          <Button asChild variant="outline" size="sm" className="min-h-touch justify-between">
            <a href={webPath.url} target="_blank" rel="noreferrer">
              Open website <Globe2Icon aria-hidden="true" />
            </a>
          </Button>
        )}
        {operationPath !== undefined || webPath !== undefined || phoneHref === undefined ? null : (
          <Button asChild variant="outline" size="sm" className="min-h-touch justify-between">
            <a href={phoneHref}>Call supplier <PhoneIcon aria-hidden="true" /></a>
          </Button>
        )}
        {operationPath !== undefined || webPath !== undefined || phoneHref !== undefined ? null : (
          <p className="text-sm text-muted-foreground">No public call path</p>
        )}
      </div>
    </li>
  )
}

function supplyOfferingToDto(item: PublicOfferingSupplyView['offerings'][number]): PublicOfferingDto {
  return {
    offeringRef: item.offering.offeringRef,
    revision: item.offering.revision,
    name: item.offering.name,
    category: item.offering.category,
    summary: item.offering.summary,
    ...(item.offering.serviceAreaSummary === undefined ? {} : { serviceAreaSummary: item.offering.serviceAreaSummary }),
    ...(item.offering.availabilitySummary === undefined ? {} : { availabilitySummary: item.offering.availabilitySummary }),
    ...(item.offering.pricingSummary === undefined ? {} : { pricingSummary: item.offering.pricingSummary }),
    ...(item.offering.price === undefined ? {} : { price: item.offering.price }),
    accessPaths: item.accessPaths.map((path) => path.descriptor.kind === 'human_request'
      ? {
          accessPathRef: path.accessPathRef,
          offeringRevision: path.offeringRevision,
          kind: 'human_request' as const,
          channel: path.descriptor.channel,
          disclosure: path.descriptor.disclosure,
          ...(path.descriptor.url === undefined ? {} : { url: path.descriptor.url }),
        }
      : {
          accessPathRef: path.accessPathRef,
          offeringRevision: path.offeringRevision,
          kind: 'external_operation' as const,
          name: path.descriptor.name,
          summary: path.descriptor.summary,
          url: path.descriptor.url,
          ...(path.descriptor.method === undefined ? {} : { method: path.descriptor.method }),
          ...(path.descriptor.documentationUrl === undefined ? {} : { documentationUrl: path.descriptor.documentationUrl }),
          ...(path.descriptor.interfaceDescription === undefined ? {} : { interfaceDescription: path.descriptor.interfaceDescription }),
          ...(path.descriptor.authenticationSummary === undefined ? {} : { authenticationSummary: path.descriptor.authenticationSummary }),
          ...(path.descriptor.pricingSummary === undefined ? {} : { pricingSummary: path.descriptor.pricingSummary }),
          provenance: path.descriptor.provenance,
        }),
    support: {
      integrated: item.support.integrated,
      aeSupportedAction: item.support.routeable,
      ...(item.support.observedAt === undefined ? {} : { observedAt: item.support.observedAt }),
      ...(item.support.validUntil === undefined ? {} : { validUntil: item.support.validUntil }),
    },
  }
}

function ListingBackLink({ from, threadId }: { from?: 'thread'; threadId?: string }) {
  if (from === 'thread' && threadId !== undefined) {
    return (
      <Button asChild variant="ghost" size="sm" className="min-h-touch px-2">
        <Link to="/t/$threadId" params={{ threadId }}><ArrowLeftIcon aria-hidden="true" /> Back to result</Link>
      </Button>
    )
  }

  return (
    <Button asChild variant="ghost" size="sm" className="min-h-touch px-2">
      <Link to="/market" search={{ window: '30d' }} hash="operations"><ArrowLeftIcon aria-hidden="true" /> Back to catalog</Link>
    </Button>
  )
}
