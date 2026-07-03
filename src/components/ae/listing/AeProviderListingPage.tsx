import { ArrowLeftIcon } from 'lucide-react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'

import { AeGenerativeMap, AeOfficeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { buildProviderPresentation, pillToneForAvailabilityLabel, type ProviderPresentation } from '@/lib/ui/provider-presentation'
import type { PublicRouteCatalogContract } from '@/modules/catalog/public'
import type { PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'

export type AeProviderListingPageProps = {
  catalog: PublicRouteCatalogContract
  inquiryAffordance: PublicInquiryAffordance
  agentJsonUrl: string
  backFrom?: 'thread' | 'registry'
  backThreadId?: string
}

export function AeProviderListingPage({
  catalog,
  inquiryAffordance,
  agentJsonUrl,
  backFrom,
  backThreadId,
}: AeProviderListingPageProps) {
  const presentation = buildProviderPresentation(catalog)
  const officeAddress = readOfficeAddress(catalog)
  const availabilityVariant = badgeVariantForTone(pillToneForAvailabilityLabel(presentation.availabilityLabel))

  return (
    <article className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-10">
      <nav aria-label="Return to your previous view">
        <ListingBackLink {...(backFrom === undefined ? {} : { from: backFrom })} {...(backThreadId === undefined ? {} : { threadId: backThreadId })} />
      </nav>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start" aria-label="Provider summary">
        <div className="grid gap-6">
          <header className="grid gap-3">
            <Text type="supporting" weight="medium" color="secondary" display="block">{presentation.locationLabel}</Text>
            <h1 className="text-balance text-5xl font-semibold leading-none tracking-tight text-primary">{catalog.name}</h1>
            <Text type="large" color="secondary" display="block">{catalog.category}</Text>
            <div className="flex flex-wrap items-center gap-3">
              <Badge label={presentation.availabilityLabel} variant={availabilityVariant} />
              {presentation.trustCue.length > 0 ? <Text type="supporting" color="secondary">{presentation.trustCue}</Text> : null}
            </div>
          </header>

          <ProviderFacts
            facts={[
              { term: 'Service area', description: presentation.serviceArea },
              { term: 'Response', description: presentation.responseFallbackLabel },
              { term: 'Service', description: presentation.primaryServiceName ?? catalog.category },
            ]}
          />
          <ListingPhotosSection catalog={catalog} presentation={presentation} />
        </div>

        <Card padding={5} className="grid gap-4 lg:sticky lg:top-20" aria-label="Actions for this business">
          <div>
            <Text type="large" weight="semibold" color="primary" display="block">
              {inquiryAffordance.kind === 'available' ? presentation.nextStepLabel : 'Contact option'}
            </Text>
            <Text color="secondary" display="block">
              {inquiryAffordance.kind === 'available'
                ? 'Send the job details to the business so they can reply with timing and quote details.'
                : inquiryAffordance.reason}
            </Text>
          </div>
          {inquiryAffordance.kind === 'available' ? <Button label={inquiryAffordance.label} variant="primary" href={inquiryAffordance.href} /> : null}
          <AeProtectedByAe />
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid gap-6">
          <Card padding={5} className="grid gap-3" aria-labelledby="listing-area">
            <h2 id="listing-area" className="text-lg font-semibold text-primary">Service area</h2>
            <Text color="secondary" display="block">{presentation.serviceArea}</Text>
            {officeAddress === undefined ? <AeGenerativeMap label={catalog.name} placeQuery={presentation.serviceArea} /> : null}
          </Card>

          {presentation.serviceChips.length > 0 ? (
            <Card padding={5} className="grid gap-3" aria-labelledby="listing-services">
              <h2 id="listing-services" className="text-lg font-semibold text-primary">Services</h2>
              <ul className="flex flex-wrap gap-2">
                {presentation.serviceChips.map((service) => <li key={service.key}><Token size="sm" label={service.label} /></li>)}
              </ul>
            </Card>
          ) : null}

          {presentation.primaryServiceName !== undefined ? (
            <Card padding={5} className="grid gap-2" aria-labelledby="listing-hours">
              <h2 id="listing-hours" className="text-lg font-semibold text-primary">Hours</h2>
              <Text color="secondary" display="block">{presentation.hoursLabel}</Text>
            </Card>
          ) : null}

          {officeAddress !== undefined ? (
            <Card padding={5} className="grid gap-3" aria-labelledby="listing-office">
              <h2 id="listing-office" className="text-lg font-semibold text-primary">Office</h2>
              <Text color="secondary" display="block">{officeAddress}</Text>
              <AeOfficeMap address={officeAddress} businessName={catalog.name} />
            </Card>
          ) : null}

          {presentation.primaryServiceSummary !== undefined ? (
            <Card padding={5} className="grid gap-2" aria-labelledby="listing-about">
              <h2 id="listing-about" className="text-lg font-semibold text-primary">About</h2>
              <Text color="secondary" display="block">{presentation.primaryServiceSummary}</Text>
            </Card>
          ) : null}

          <Card padding={5} className="grid gap-2" aria-labelledby="listing-reply">
            <h2 id="listing-reply" className="text-lg font-semibold text-primary">What comes from the reply</h2>
            <Text color="secondary" display="block">The business replies with timing, quote, and availability.</Text>
          </Card>
        </div>

        <footer className="grid content-start gap-4">
          <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
          <a href="/privacy/remove-business" className="text-sm text-secondary underline-offset-4 hover:underline">
            Correct or remove this page
          </a>
        </footer>
      </div>
    </article>
  )
}

function ListingPhotosSection({ catalog, presentation }: { catalog: PublicRouteCatalogContract; presentation: ProviderPresentation }) {
  const photos = catalog.photos ?? []

  if (photos.length === 0) {
    return (
      <Card padding={0} className="overflow-hidden" aria-labelledby="listing-photos">
        <h2 id="listing-photos" className="sr-only">Photos</h2>
        <figure>
          <img className="h-72 w-full object-cover" src={presentation.image.url} alt="" />
          <figcaption className="px-4 py-3 text-sm text-secondary">Category reference image</figcaption>
        </figure>
      </Card>
    )
  }

  return (
    <section className="grid gap-3" aria-labelledby="listing-photos">
      <h2 id="listing-photos" className="sr-only">Photos</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {photos.slice(0, 4).map((photo) => (
          <figure key={photo.url} className="overflow-hidden rounded-md border border-border bg-card">
            <img className="h-56 w-full object-cover" src={photo.url} alt={photo.alt} loading="lazy" />
          </figure>
        ))}
      </div>
    </section>
  )
}

function readOfficeAddress(catalog: PublicRouteCatalogContract): string | undefined {
  const extended = catalog as PublicRouteCatalogContract & { officeAddress?: string }
  const value = extended.officeAddress?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}

function ListingBackLink({ from, threadId }: { from?: 'thread' | 'registry'; threadId?: string }) {
  const href = from === 'thread' && threadId !== undefined ? `/t/${threadId}` : from === 'registry' ? '/registry?q=&limit=10' : '/'
  const label = from === 'thread' && threadId !== undefined ? 'Back to answer' : from === 'registry' ? 'Back to results' : 'Ask another'
  return (
    <a href={href} className="inline-flex min-h-11 items-center gap-2 text-sm text-secondary underline-offset-4 hover:underline">
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {label}
    </a>
  )
}

function ProviderFacts({ facts }: { facts: Array<{ term: string; description: string }> }) {
  return (
    <dl className="grid gap-3 md:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.term} className="rounded-md border border-border bg-surface p-3">
          <dt><Text type="supporting" color="secondary" weight="medium">{fact.term}</Text></dt>
          <dd className="mt-1"><Text type="supporting" color="primary">{fact.description}</Text></dd>
        </div>
      ))}
    </dl>
  )
}

function badgeVariantForTone(tone: string): 'neutral' | 'success' | 'warning' | 'error' {
  if (tone === 'available' || tone === 'success') return 'success'
  if (tone === 'limited' || tone === 'warning') return 'warning'
  if (tone === 'unavailable' || tone === 'error') return 'error'
  return 'neutral'
}
