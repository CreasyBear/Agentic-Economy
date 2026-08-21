import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  CalendarClockIcon,
  Code2Icon,
  Globe2Icon,
  MapPinIcon,
  PhoneIcon,
} from 'lucide-react'

import { formatOfferingPrice } from '@/modules/catalog/public'
import { formatNumericDate } from '@/lib/ui/format-time'
import {
  offeringSupportCopy,
  plainLanguageCopy,
  presentOfferingAccessPath,
  type PublicOfferingAccessPathView,
  type PublicOfferingSupplyProjectionView,
} from './offering-presentation'

export type AeOfferingSupplyListProps = Readonly<{
  offerings: readonly PublicOfferingSupplyProjectionView[]
  disposition?: 'current' | 'partial' | 'stale'
  observedAt?: number
  showTechnicalDetails?: boolean
}>

export function AeOfferingSupplyList({ offerings, disposition = 'current', observedAt, showTechnicalDetails = true }: AeOfferingSupplyListProps) {
  return (
    <section aria-labelledby="business-offerings-title" className="grid gap-4">
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div className="grid gap-1">
          <h2 id="business-offerings-title" className="text-xl font-semibold text-foreground">Services and prices</h2>
          <p className="block text-sm text-muted-foreground">See what this business does, what it costs, and how to start.</p>
        </div>
        {offerings.length === 0 ? null : <p className="shrink-0 text-sm text-muted-foreground">{offerings.length} {offerings.length === 1 ? 'service' : 'services'} listed</p>}
      </div>

      {disposition === 'current' ? null : (
        <Card className="border border-border bg-muted/40 p-4" role="status">
          <p className="block font-semibold text-foreground">
            {disposition === 'partial' ? 'Some listed details are still updating' : 'These are the last safely listed details'}
          </p>
          <p className="block text-sm text-muted-foreground">
            {observedAt === undefined ? 'Check before relying on the price or availability.' : `Last updated ${formatNumericDate(observedAt)}.`}
          </p>
        </Card>
      )}

      {offerings.length === 0 ? (
        <Card className="p-5">
          <div className="grid gap-2">
            <p className="block font-semibold text-foreground">No services are published yet</p>
            <p className="block text-muted-foreground">
              The business page remains available while the business prepares its services.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4">
          {offerings.map((offering) => <OfferingCard key={offering.offering.offeringRef} offering={offering} showTechnicalDetails={showTechnicalDetails} />)}
        </div>
      )}
    </section>
  )
}
function OfferingCard({ offering, showTechnicalDetails }: { offering: PublicOfferingSupplyProjectionView; showTechnicalDetails: boolean }) {
  const support = offeringSupportCopy(offering.support)
  const publishedPrice = offering.offering.price === undefined
    ? undefined
    : formatOfferingPrice(offering.offering.price)

  return (
    <Card className="grid min-w-0 gap-5 border border-border p-5" aria-labelledby={`offering-${offering.offering.offeringRef}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="grid min-w-0 gap-1">
          <h3 id={`offering-${offering.offering.offeringRef}`} className="text-lg font-semibold text-foreground">{plainLanguageCopy(offering.offering.name)}</h3>
          <p className="block text-sm text-muted-foreground">{offering.offering.category}</p>
        </div>
        {publishedPrice === undefined && offering.offering.pricingSummary === undefined ? null : (
          <div className="max-w-48 text-right">
            <p className="block text-sm text-muted-foreground">Price</p>
            <p className="block font-semibold text-foreground">
              {publishedPrice ?? plainLanguageCopy(offering.offering.pricingSummary ?? '')}
            </p>
            {publishedPrice === undefined || offering.offering.pricingSummary === undefined ? null : (
              <p className="block text-sm text-muted-foreground">{plainLanguageCopy(offering.offering.pricingSummary)}</p>
            )}
          </div>
        )}
      </div>

      <p className="block max-w-3xl text-pretty text-foreground">
        {plainLanguageCopy(offering.offering.summary)}
      </p>

      {offering.offering.serviceAreaSummary === undefined && offering.offering.availabilitySummary === undefined ? null : (
        <dl className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
          {offering.offering.serviceAreaSummary === undefined ? null : <OptionalFact icon={<MapPinIcon aria-hidden="true" />} label="Service area" value={offering.offering.serviceAreaSummary} />}
          {offering.offering.availabilitySummary === undefined ? null : <OptionalFact icon={<CalendarClockIcon aria-hidden="true" />} label="Availability" value={offering.offering.availabilitySummary} />}
        </dl>
      )}

      <div className="grid gap-2 border-t border-border pt-4">
        <h4 className="block font-semibold text-foreground">How to start this service</h4>
        <p className="block text-sm text-muted-foreground">For a quote, the business reviews your request and confirms the price and timing.</p>
        {offering.accessPaths.length === 0 ? (
          <p className="block text-muted-foreground">No phone, website, or message route is listed for this service.</p>
        ) : (
          <ul className="m-0 grid list-none divide-y divide-border p-0">
            {offering.accessPaths.map((path) => <AccessPathItem key={path.accessPathRef} path={path} showTechnicalDetails={showTechnicalDetails} />)}
          </ul>
        )}
      </div>

      {support === undefined ? null : (
        <div className="grid gap-0.5 border-t border-border pt-4">
          <p className="block text-sm font-semibold text-muted-foreground">{support.label}</p>
          <p className="block text-sm text-muted-foreground">{support.detail}</p>
        </div>
      )}
    </Card>
  )
}

function OptionalFact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      <span className="row-span-2 mt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</span>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="m-0 break-words text-foreground">{value}</dd>
    </div>
  )
}

function AccessPathItem({ path, showTechnicalDetails }: { path: PublicOfferingAccessPathView; showTechnicalDetails: boolean }) {
  const [technicalExpanded, setTechnicalExpanded] = useState(false)
  const presentation = presentOfferingAccessPath(path)
  return (
    <li className="grid min-w-0 gap-3 py-4 first:pt-1 last:pb-0">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">{accessIcon(path.descriptor.kind === 'external_operation' ? 'external_operation' : path.descriptor.channel)}</span>
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{presentation.label}</p>
            {presentation.provenance === undefined ? null : <Badge variant="outline">{presentation.provenance}</Badge>}
          </div>
          {presentation.price === undefined ? null : (
            <p className="block font-semibold text-foreground">{presentation.price}</p>
          )}
          <p className="block text-sm text-muted-foreground">{presentation.detail}</p>
        </div>
      </div>
      {presentation.href === undefined ? null : (
        <Button asChild variant="secondary" size="sm" className="min-h-11 w-full sm:w-auto">
          <a href={presentation.href}>{presentation.external ? 'Open website' : presentation.label}</a>
        </Button>
      )}
      {presentation.technical === undefined || !showTechnicalDetails ? null : (
        <Collapsible className="grid gap-2" open={technicalExpanded} onOpenChange={setTechnicalExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="link"
              className="h-auto min-h-11 justify-self-start px-0 text-muted-foreground hover:text-foreground"
            >
              {technicalExpanded ? 'Hide page information' : 'More page information'}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="grid min-w-0 gap-2 border-l border-border pl-4 text-sm">
              {presentation.technical.map((fact) => (
                <div key={fact.label} className="grid min-w-0 gap-1">
                  <dt className="text-muted-foreground">{fact.label}</dt>
                  <dd className="m-0 break-all text-foreground">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      )}
    </li>
  )
}

function accessIcon(kind: 'phone' | 'website' | 'external_operation') {
  if (kind === 'phone') return <PhoneIcon className="size-4" aria-hidden="true" />
  if (kind === 'website') return <Globe2Icon className="size-4" aria-hidden="true" />
  return <Code2Icon className="size-4" aria-hidden="true" />
}
