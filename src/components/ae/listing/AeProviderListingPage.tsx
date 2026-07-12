import { ArrowLeftIcon } from 'lucide-react'
import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Divider } from '@astryxdesign/core/Divider'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack, VStack } from '@astryxdesign/core/Stack'
import { Heading, Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'

import { AeGenerativeMap, AeOfficeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { RouterLink } from '@/components/astryx/RouterLink'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { buildProviderPresentation, pillToneForAvailabilityLabel, type ProviderPresentation } from '@/lib/ui/provider-presentation'
import type { PublicRouteCapabilityContract, PublicRouteCatalogContract } from '@/modules/catalog/public'
import type { PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'

export type AeProviderListingPageProps = {
  catalog: PublicRouteCatalogContract
  inquiryAffordance: PublicInquiryAffordance
  agentJsonUrl: string
  backFrom?: 'thread' | 'registry'
  backThreadId?: string
}

const ownerReplyStamp = 'owner confirms on reply'

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
  const inquiryHref = appendThreadOrigin(inquiryAffordance.kind === 'available' ? inquiryAffordance.href : '', backFrom, backThreadId)
  const hasResponseCue = presentation.responseLabel.length > 0
  const hasTrustNote = presentation.trustCue.length > 0 && presentation.trustCue !== presentation.responseLabel

  return (
    <article className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-10">
      <nav aria-label="Return to your previous view">
        <ListingBackLink {...(backFrom === undefined ? {} : { from: backFrom })} {...(backThreadId === undefined ? {} : { threadId: backThreadId })} />
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-8">
          <Card padding={6} className="overflow-hidden" aria-labelledby="provider-listing-title">
            <VStack gap={5}>
              <HStack vAlign="center" gap={2} wrap="wrap">
                <img src="/brand/logo/ae-seal.svg" alt="" className="size-6 shrink-0" />
                <Text type="label" color="secondary" weight="semibold" className="font-mono text-accent">
                  Listed on Agentic Economy
                </Text>
              </HStack>

              <VStack gap={2}>
                <Heading id="provider-listing-title" level={1} className="text-balance text-5xl leading-none tracking-tight md:text-6xl">
                  {catalog.name}
                </Heading>
                <Text type="large" color="secondary" display="block" className="max-w-2xl text-pretty">
                  {catalog.category} in {presentation.locationLabel}
                </Text>
              </VStack>

              <HStack vAlign="center" gap={3} wrap="wrap">
                <Badge label={presentation.availabilityLabel} variant={availabilityVariant} />
                {hasResponseCue ? <Badge label={presentation.responseLabel} variant="neutral" /> : null}
                {hasTrustNote ? (
                  <Text type="supporting" color="secondary">
                    {presentation.trustCue}
                  </Text>
                ) : null}
              </HStack>

              <Text type="supporting" color="secondary" display="block" className="max-w-3xl text-pretty">
                Services and contact details from {catalog.name}. Timing, quote, and whether they can take the work come from the business reply.
              </Text>
            </VStack>
          </Card>

          <ListingPhotosSection catalog={catalog} presentation={presentation} />

          <Grid columns={{ minWidth: 300 }} gap={4}>
            <ReachOutStepsCard updatedAt={catalog.updatedAt} inquiryAvailable={inquiryAffordance.kind === 'available'} />
            <SourceStampCard updatedAt={catalog.updatedAt} />
          </Grid>

          <CapabilityCardsSection catalog={catalog} inquiryAffordance={inquiryAffordance} inquiryHref={inquiryHref} />

          <WhatTheyOfferCard catalog={catalog} presentation={presentation} officeAddress={officeAddress} />
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-20" aria-label="Actions for this business">
          <Card padding={5}>
            <VStack gap={4}>
              <div>
                <Text type="large" weight="semibold" color="primary" display="block">
                  {inquiryAffordance.kind === 'available' ? `Tell ${catalog.name} about the job.` : 'Contact option'}
                </Text>
                <Text color="secondary" display="block">
                  {inquiryAffordance.kind === 'available'
                    ? 'The business can reply with timing, quote, and whether they can take the work.'
                    : inquiryAffordance.reason}
                </Text>
              </div>
              {inquiryAffordance.kind === 'available' ? <Button label={inquiryAffordance.label} variant="primary" href={inquiryHref} /> : null}
              <AeProtectedByAe />
            </VStack>
          </Card>

          <Card padding={5} className="bg-surface" aria-label="Details for your assistant">
            <VStack gap={3}>
              <div>
                <Text type="large" weight="semibold" color="primary" display="block">
                  For your assistant
                </Text>
                <Text type="supporting" color="secondary" display="block">
                  Copy the same page data into an assistant before you choose the next step.
                </Text>
              </div>
              <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
            </VStack>
          </Card>

          <RouterLink href="/privacy/remove-business" className="text-sm text-secondary underline-offset-4 hover:underline">
            Correct or remove this page
          </RouterLink>
        </aside>
      </div>
    </article>
  )
}

function CapabilityCardsSection({
  catalog,
  inquiryAffordance,
  inquiryHref,
}: {
  catalog: PublicRouteCatalogContract
  inquiryAffordance: PublicInquiryAffordance
  inquiryHref: string
}) {
  const capabilities = collectPublicCapabilities(catalog)
  if (capabilities.length === 0) {
    return null
  }
  const inquiryAvailable = inquiryAffordance.kind === 'available'

  return (
    <Card padding={6} aria-labelledby="listing-capabilities">
      <VStack gap={4}>
        <div>
          <Text id="listing-capabilities" type="large" weight="semibold" color="primary" display="block">
            What you can do here
          </Text>
          <Text type="supporting" color="secondary" display="block">
            Each option is a request the business reviews. AE does not book, charge, or confirm.
          </Text>
        </div>
        <Grid columns={{ minWidth: 260 }} gap={4}>
          {capabilities.map((capability) => {
            const presentation = capabilityCardPresentation(capability.kind)
            const actionable = inquiryAvailable && capability.status === 'available'
            return (
              <Card key={capability.kind} padding={5} className="grid h-full content-start gap-2 bg-surface">
                <HStack vAlign="center" gap={2} wrap="wrap">
                  <Text weight="semibold" color="primary">{presentation.label}</Text>
                  <Badge label={capabilityStatusLabel(capability.status)} variant="neutral" />
                </HStack>
                <Text type="supporting" color="secondary" display="block">{presentation.body}</Text>
                {capability.reason === undefined ? null : (
                  <Text type="supporting" color="secondary" display="block">{capability.reason}</Text>
                )}
                {actionable ? (
                  <div className="pt-1">
                    <Button label="Send inquiry" variant="secondary" size="sm" href={inquiryHref} />
                  </div>
                ) : (
                  <Text type="supporting" color="secondary" display="block">
                    {inquiryAvailable ? 'Confirm this with the business first.' : 'No request path published yet.'}
                  </Text>
                )}
              </Card>
            )
          })}
        </Grid>
      </VStack>
    </Card>
  )
}

function collectPublicCapabilities(catalog: PublicRouteCatalogContract): readonly PublicRouteCapabilityContract[] {
  const byKind: Partial<Record<PublicRouteCapabilityContract['kind'], PublicRouteCapabilityContract>> = {}
  for (const service of catalog.services) {
    for (const capability of service.capabilities) {
      const existing = byKind[capability.kind]
      if (existing === undefined || (existing.status !== 'available' && capability.status === 'available')) {
        byKind[capability.kind] = capability
      }
    }
  }
  return Object.values(byKind).filter(
    (capability): capability is PublicRouteCapabilityContract => capability !== undefined,
  )
}

function capabilityCardPresentation(kind: PublicRouteCapabilityContract['kind']): { label: string; body: string } {
  switch (kind) {
    case 'phone_inquiry':
      return { label: 'Send an inquiry', body: 'Describe the job in writing; it reaches the business for owner review.' }
    case 'quote_request':
      return { label: 'Request a quote', body: 'Ask for pricing on your job. The business replies with a quote.' }
    case 'emergency_callout_interest':
      return { label: 'Flag an urgent callout', body: 'Register urgent interest; the business confirms if they can attend.' }
    case 'ae_hosted_discovery':
      return { label: 'First contact via AE', body: 'Start a first-contact message the business reviews before replying.' }
  }
}

function capabilityStatusLabel(status: PublicRouteCapabilityContract['status']): string {
  switch (status) {
    case 'available':
      return 'Ready'
    case 'degraded':
      return 'Limited'
    case 'unavailable':
      return 'Not available'
    case 'stale':
      return 'Needs confirmation'
  }
}

function SourceStampCard({ updatedAt }: { updatedAt: number }) {
  return (
    <Card padding={5} aria-labelledby="listing-source-stamps">
      <VStack gap={3}>
        <div>
          <Text id="listing-source-stamps" type="large" weight="semibold" color="primary" display="block">
            Last updated
          </Text>
        </div>
        <ul className="grid gap-2" aria-label="Last updated">
          <li><SourceStamp label="business supplied" updatedAt={updatedAt} /></li>
          <li><SourceStamp label="last checked" updatedAt={updatedAt} /></li>
        </ul>
      </VStack>
    </Card>
  )
}

function SourceStamp({ label, updatedAt }: { label: string; updatedAt?: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs tabular-nums text-accent">
      <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
      {label}
      {updatedAt === undefined ? null : (
        <>
          <span aria-hidden="true">·</span>
          <time dateTime={timestampIso(updatedAt)}>{formatTimestamp(updatedAt)}</time>
        </>
      )}
    </span>
  )
}

function ReachOutStepsCard({ updatedAt, inquiryAvailable }: { updatedAt: number; inquiryAvailable: boolean }) {
  const steps = [
    {
      title: 'Read the page',
      stamp: 'business supplied',
      note: 'Services, area, and contact details are on this page.',
      reached: true,
    },
    {
      title: 'Check the date',
      stamp: 'last checked',
      note: 'The date shows the latest page check.',
      reached: true,
    },
    {
      title: inquiryAvailable ? 'Send inquiry' : 'Contact details needed',
      stamp: 'for owner review',
      note: inquiryAvailable
        ? 'Your inquiry goes to the business for owner review.'
        : 'The business needs to add a contact path first.',
      reached: inquiryAvailable,
    },
  ] satisfies Array<{ title: string; stamp: string; note: string; reached: boolean }>

  return (
    <Card padding={5} aria-labelledby="listing-reach-out-steps">
      <VStack gap={3}>
        <div>
          <Text id="listing-reach-out-steps" type="large" weight="semibold" color="primary" display="block">
            What happens when you reach out
          </Text>
        </div>
        <ol className="grid gap-0" aria-label="What happens when you reach out">
          {steps.map((step, index) => {
            const hasNext = index < steps.length - 1
            const nextReached = steps[index + 1]?.reached === true

            return (
              <li key={step.title} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
                <span className="relative mt-1 flex justify-center" aria-hidden="true">
                  <span className={`size-3 rounded-full border ${step.reached ? 'border-accent bg-accent' : 'border-border bg-surface'}`} />
                  {hasNext ? <span className={`absolute top-3 h-[calc(100%+1rem)] w-px ${step.reached && nextReached ? 'bg-accent' : 'bg-border'}`} /> : null}
                </span>
                <span className="grid gap-1">
                  <Text type="supporting" weight="medium" color="primary" display="block">
                    {step.title}
                  </Text>
                  <span className="font-mono text-xs tabular-nums text-secondary">
                    {step.stamp} · <time dateTime={timestampIso(updatedAt)}>{formatTimestamp(updatedAt)}</time>
                  </span>
                  <Text type="supporting" color="secondary" display="block">
                    {step.note}
                  </Text>
                </span>
              </li>
            )
          })}
        </ol>
      </VStack>
    </Card>
  )
}

function WhatTheyOfferCard({
  catalog,
  presentation,
  officeAddress,
}: {
  catalog: PublicRouteCatalogContract
  presentation: ProviderPresentation
  officeAddress: string | undefined
}) {
  return (
    <Card padding={6} className="grid gap-6" aria-labelledby="listing-offer-details">
      <VStack gap={1}>
        <Text id="listing-offer-details" type="large" weight="semibold" color="primary" display="block">
          What they offer
        </Text>
        <Text type="supporting" color="secondary" display="block">
          Services, area, and hours from {catalog.name}.
        </Text>
      </VStack>

      <VStack gap={3}>
        <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">Where they work</span>
        <Grid columns={{ minWidth: 240 }} gap={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary" weight="medium" display="block">Service area</Text>
            <Text color="primary" display="block" className="text-pretty">{presentation.serviceArea}</Text>
            {officeAddress === undefined ? <AeGenerativeMap label={catalog.name} placeQuery={presentation.serviceArea} /> : null}
          </VStack>
          {officeAddress !== undefined ? (
            <VStack gap={1}>
              <Text type="supporting" color="secondary" weight="medium" display="block">Office</Text>
              <Text color="primary" display="block" className="text-pretty">{officeAddress}</Text>
              <AeOfficeMap address={officeAddress} businessName={catalog.name} />
            </VStack>
          ) : null}
        </Grid>
      </VStack>

      <Divider />

      <VStack gap={3}>
        <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">Services</span>
        <Grid columns={{ minWidth: 240 }} gap={4}>
          <VStack gap={1}>
            <Text type="supporting" color="secondary" weight="medium" display="block">Primary service</Text>
            <Text color="primary" display="block">{presentation.primaryServiceName ?? catalog.category}</Text>
          </VStack>
          {presentation.primaryServiceName !== undefined ? (
            <VStack gap={1}>
              <Text type="supporting" color="secondary" weight="medium" display="block">Hours</Text>
              <Text color="primary" display="block" className="tabular-nums">{presentation.hoursLabel}</Text>
            </VStack>
          ) : null}
        </Grid>
        {presentation.serviceChips.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {presentation.serviceChips.map((service) => (
              <li key={service.key}><Token size="sm" label={service.label} /></li>
            ))}
          </ul>
        ) : null}
      </VStack>

      {presentation.primaryServiceSummary !== undefined ? (
        <>
          <Divider />
          <VStack gap={3}>
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">About</span>
            <Text color="primary" display="block" className="max-w-3xl text-pretty">
              {presentation.primaryServiceSummary}
            </Text>
          </VStack>
        </>
      ) : null}
    </Card>
  )
}

function appendThreadOrigin(href: string, from: 'thread' | 'registry' | undefined, threadId: string | undefined): string {
  if (from !== 'thread' || threadId === undefined || threadId.length === 0) {
    return href
  }

  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}from=thread&id=${encodeURIComponent(threadId)}`
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
  const href = from === 'thread' && threadId !== undefined ? `/t/${encodeURIComponent(threadId)}` : from === 'registry' ? '/registry?q=&limit=10' : '/'
  const label = from === 'thread' && threadId !== undefined ? 'Back to answer' : from === 'registry' ? 'Back to results' : 'Ask another'
  return (
    <RouterLink href={href} className="inline-flex min-h-11 items-center gap-2 text-sm text-secondary underline-offset-4 hover:underline">
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {label}
    </RouterLink>
  )
}

function badgeVariantForTone(tone: string): 'neutral' | 'success' | 'warning' | 'error' {
  if (tone === 'available' || tone === 'success') return 'success'
  if (tone === 'limited' || tone === 'warning') return 'warning'
  if (tone === 'unavailable' || tone === 'error') return 'error'
  return 'neutral'
}
