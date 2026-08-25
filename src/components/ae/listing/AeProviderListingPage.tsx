import { ArrowLeftIcon, ArrowUpRightIcon, BracesIcon, Globe2Icon, PhoneIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { telUri } from '@/lib/ui/tel-uri'
import type { ListingTrustProjection } from '@/lib/ui/trust-projection'
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
    <article className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:px-6 md:py-8">
      <nav aria-label="Breadcrumb">
        <ListingBackLink
          {...(backFrom === undefined ? {} : { from: backFrom })}
          {...(backThreadId === undefined ? {} : { threadId: backThreadId })}
        />
      </nav>

      <ListingFirstScreen catalog={catalog} offerings={offerings} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <section aria-labelledby="supplier-operations-title" className="overflow-hidden rounded-card border border-border bg-card">
          <div className="flex flex-col gap-1 border-b border-border px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="supplier-operations-title" className="text-lg font-semibold text-foreground">Published Operations</h2>
              <p className="text-sm text-muted-foreground">Inspect the price, access path, and current readiness before calling.</p>
            </div>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {offerings.length} listed · {readyCount} ready now
            </p>
          </div>

          {offerings.length === 0 ? (
            <div className="grid gap-1 px-4 py-8">
              <p className="font-medium text-foreground">No Operations published</p>
              <p className="text-sm text-muted-foreground">This supplier profile remains visible while its catalogue is prepared.</p>
            </div>
          ) : (
            <ul className="m-0 divide-y divide-border p-0" aria-label={`${catalog.name} Operations`}>
              {offerings.map((offering) => (
                <OperationRow key={offering.offeringRef} offering={offering} catalog={catalog} />
              ))}
            </ul>
          )}
        </section>

        <aside className="grid gap-4 lg:sticky lg:top-20" aria-label="Supplier information">
          <Card className="gap-4 p-4">
            <div className="grid gap-1">
              <h2 className="text-base font-semibold text-foreground">Supplier details</h2>
              <p className="text-sm text-muted-foreground">Facts published with this catalogue entry.</p>
            </div>
            <Separator />
            <dl className="grid gap-3">
              <Fact label="Supplier type" value={catalog.businessContext.kind === 'programmable_provider' ? 'Programmable provider' : 'Human-operated supplier'} />
              <Fact label="Catalogue status" value={catalog.disposition === 'current' ? 'Current' : catalog.disposition} />
              <Fact label="Observed">
                <time dateTime={timestampIso(catalog.observedAt)}>{formatTimestamp(catalog.observedAt)}</time>
              </Fact>
              {catalog.responseTimeMinutes === undefined ? null : (
                <Fact label="Published response time" value={`${catalog.responseTimeMinutes} min`} />
              )}
              {catalog.businessContext.kind === 'programmable_provider' ? (
                <Fact label="Provider ID" value={catalog.businessContext.providerIdentifier} mono />
              ) : (
                <Fact label="Location" value={`${catalog.businessContext.suburb}, ${catalog.businessContext.stateTerritory}`} />
              )}
            </dl>
            {catalog.businessContext.kind !== 'programmable_provider' ? null : (
              <Button asChild variant="outline" className="min-h-11 w-full justify-between">
                <a href={catalog.businessContext.website} target="_blank" rel="noreferrer">
                  Supplier website <ArrowUpRightIcon aria-hidden="true" />
                </a>
              </Button>
            )}
          </Card>

          <details className="rounded-card border border-border bg-card">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <BracesIcon className="size-4" aria-hidden="true" /> Agent-readable catalogue
            </summary>
            <div className="grid gap-2 border-t border-border px-4 py-3">
              <p className="text-sm text-muted-foreground">Use the public JSON projection to inspect this supplier without parsing the page.</p>
              <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
            </div>
          </details>

          <Link
            to="/privacy/remove-business"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Correct or remove this supplier
          </Link>
        </aside>
      </div>
    </article>
  )
}

export function ListingFirstScreen({
  catalog,
  offerings = catalog.offerings,
}: {
  catalog: PublicBusinessCatalogApiV2Dto
  offerings?: readonly PublicOfferingDto[]
  trust?: ListingTrustProjection
  pseudonymousJourneyId?: unknown
  offeringDetailMode?: boolean
}) {
  const readyCount = offerings.filter((offering) => offering.support.aeSupportedAction).length

  return (
    <header className="grid gap-5 border-b border-border pb-6" aria-labelledby="provider-listing-title">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Supplier</Badge>
        <Badge variant={readyCount > 0 ? 'success' : 'secondary'}>
          {readyCount > 0 ? `${readyCount} ready now` : 'Inspect only'}
        </Badge>
      </div>
      <div className="grid max-w-3xl gap-2">
        <p className="font-mono text-xs font-medium uppercase tracking-widest text-muted-foreground">{catalog.category}</p>
        <h1 id="provider-listing-title" className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          {catalog.name}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          Compare this supplier’s published Operations, exact prices, and access paths.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Fact label="Operations" value={String(offerings.length)} mono />
        <Fact label="Ready now" value={String(readyCount)} mono />
        <Fact label="Last indexed">
          <time dateTime={timestampIso(catalog.observedAt)}>{formatTimestamp(catalog.observedAt)}</time>
        </Fact>
      </dl>
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
    <li className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
      <div className="grid min-w-0 gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{offering.name}</h3>
            <Badge variant={offering.support.aeSupportedAction ? 'success' : offering.support.integrated ? 'warning' : 'secondary'}>
              {offering.support.aeSupportedAction ? 'Ready now' : offering.support.integrated ? 'Setup required' : 'Inspect only'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{offering.summary}</p>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <Fact label="Category" value={offering.category} />
          <Fact label="Price" value={price} mono />
          <Fact label="Availability" value={offering.availabilitySummary ?? 'Not published'} />
        </dl>
        {accessNote === undefined ? null : <p className="text-xs text-muted-foreground">{accessNote}</p>}
      </div>
      <div className="grid gap-2 sm:justify-items-stretch">
        {operationPath === undefined ? null : (
          <Button asChild size="sm" className="min-h-11 justify-between">
            <a href={operationPath.documentationUrl ?? operationPath.url} target="_blank" rel="noreferrer">
              Open provider route <ArrowUpRightIcon aria-hidden="true" />
            </a>
          </Button>
        )}
        {operationPath !== undefined || webPath === undefined ? null : (
          <Button asChild variant="outline" size="sm" className="min-h-11 justify-between">
            <a href={webPath.url} target="_blank" rel="noreferrer">
              Open website <Globe2Icon aria-hidden="true" />
            </a>
          </Button>
        )}
        {operationPath !== undefined || webPath !== undefined || phoneHref === undefined ? null : (
          <Button asChild variant="outline" size="sm" className="min-h-11 justify-between">
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

function Fact({
  label,
  value,
  children,
  mono = false,
}: {
  label: string
  value?: string
  children?: ReactNode
  mono?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`m-0 break-words text-sm text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>{children ?? value}</dd>
    </div>
  )
}

function ListingBackLink({ from, threadId }: { from?: 'thread'; threadId?: string }) {
  if (from === 'thread' && threadId !== undefined) {
    return (
      <Button asChild variant="ghost" size="sm" className="min-h-11 px-2">
        <Link to="/t/$threadId" params={{ threadId }}><ArrowLeftIcon aria-hidden="true" /> Back to result</Link>
      </Button>
    )
  }

  return (
    <Button asChild variant="ghost" size="sm" className="min-h-11 px-2">
      <Link to="/market" search={{ window: '30d' }} hash="operations"><ArrowLeftIcon aria-hidden="true" /> Back to catalog</Link>
    </Button>
  )
}
