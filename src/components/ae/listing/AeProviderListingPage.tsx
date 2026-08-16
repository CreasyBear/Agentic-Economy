import { ArrowLeftIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

import { AeGenerativeMap, AeOfficeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { ProvenanceBadge } from '@/components/ae/status/ProvenanceBadge'
import { AeOfferingSupplyList } from '@/components/ae/offerings/AeOfferingSupplyList'
import type { PublicOfferingSupplyView } from '@/components/ae/offerings/offering-presentation'
import { AeOfferingCard } from '@/components/ae/primitives/AeOfferingCard'
import { formatTimestamp, timestampIso } from '@/lib/ui/format-time'
import { copyTextToClipboard } from '@/lib/ui/copy-text-to-clipboard'
import { buildProviderPresentation, type ProviderPresentation } from '@/lib/ui/provider-presentation'
import { telUri } from '@/lib/ui/tel-uri'
import { buildListingTrustProjection, NO_REPLY_HISTORY, type ListingTrustProjection, type ReplyPosture, type TrustFact } from '@/lib/ui/trust-projection'
import { emitWave1JourneyEvent, getOrCreatePseudonymousJourneyId, type PseudonymousJourneyId } from '@/lib/ui/journey-events'
import { cn } from '@/lib/utils'
import type { PublicBusinessCatalogApiV2Dto } from '@/modules/registry/public'
import { projectPublicInquiryOfferingSupply, type PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'


export type AeProviderListingPageProps = {
  catalog: PublicBusinessCatalogApiV2Dto
  inquiryAffordance: PublicInquiryAffordance
  agentJsonUrl: string
  supply?: PublicOfferingSupplyView
  backFrom?: 'thread'
  backThreadId?: string
}

const ownerReplyStamp = 'owner confirms on reply'

const peerActionClassName = 'min-h-11 w-full sm:w-auto'

/** Thread origin carried into the inquiry route; empty when the reader did not arrive from a thread. */
type InquiryOriginSearch = { from?: 'thread'; id?: string }

export function AeProviderListingPage({
  catalog,
  inquiryAffordance,
  agentJsonUrl,
  supply,
  backFrom,
  backThreadId,
}: AeProviderListingPageProps) {
  const presentation = buildProviderPresentation(catalog)
  const trust = buildListingTrustProjection(catalog, inquiryAffordance.kind === 'available')
  const officeAddress = readOfficeAddress(catalog)
  const router = useRouter()
  const inquirySearch: InquiryOriginSearch = backFrom === 'thread' && backThreadId !== undefined && backThreadId.length > 0
    ? { from: 'thread', id: backThreadId }
    : {}
  // The offering supply read carries stored access-path copy. Admission is the
  // only fact that says whether the inquiry route will accept a first contact,
  // so the rendered paths are derived from it rather than from what was stored.
  const supplyOfferings = supply === undefined
    ? undefined
    : projectPublicInquiryOfferingSupply(
        supply.offerings,
        inquiryAffordance.kind === 'available'
          ? router.buildLocation({ to: '/$slug/inquiry', params: { slug: catalog.slug }, search: inquirySearch }).href
          : undefined,
      )
  const [journeyIdentity, setJourneyIdentity] = useState<{ slug: string; id: PseudonymousJourneyId } | null>(null)

  useEffect(() => {
    const journeyId = getOrCreatePseudonymousJourneyId('J1', catalog.slug)
    setJourneyIdentity({ slug: catalog.slug, id: journeyId })
    emitWave1JourneyEvent({
      event: 'listing_viewed',
      eventVersion: 1,
      journey: 'J1',
      pseudonymousJourneyId: journeyId,
    })
  }, [catalog.slug])
  const journeyIdentityForCatalog = journeyIdentity === null || journeyIdentity.slug !== catalog.slug
    ? null
    : journeyIdentity

  return (
    <article className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 md:px-6 md:py-10">
      <nav aria-label="Return to your previous view">
        <ListingBackLink {...(backFrom === undefined ? {} : { from: backFrom })} {...(backThreadId === undefined ? {} : { threadId: backThreadId })} />
      </nav>

      <ListingFirstScreen
        catalog={catalog}
        trust={trust}
        inquiryAffordance={inquiryAffordance}
        inquirySearch={inquirySearch}
        pseudonymousJourneyId={journeyIdentityForCatalog?.id ?? null}
        offeringDetailMode={supply !== undefined}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-8">
          <ListingPhotosSection catalog={catalog} presentation={presentation} />

          {supply === undefined || supplyOfferings === undefined ? null : (
            <AeOfferingSupplyList
              offerings={supplyOfferings}
              disposition={supply.disposition}
              observedAt={supply.observedAt}
              showTechnicalDetails={false}
            />
          )}

          {supply === undefined ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ReachOutStepsCard updatedAt={catalog.observedAt} inquiryAvailable={inquiryAffordance.kind === 'available'} />
              <SourceStampCard updatedAt={catalog.observedAt} />
            </div>
          ) : <SourceStampCard updatedAt={catalog.observedAt} />}

          {supply === undefined ? <OfferingCardsSection catalog={catalog} inquiryAffordance={inquiryAffordance} inquirySearch={inquirySearch} /> : null}

          {supply === undefined ? <WhatTheyOfferCard catalog={catalog} presentation={presentation} officeAddress={officeAddress} /> : null}
        </div>

        <aside className="grid content-start gap-6 lg:sticky lg:top-20" aria-label="Actions for this business">
          {supply === undefined ? (
            <Card className="p-5">
              <div className="grid gap-4">
                <div>
                  <h2 className="block text-lg font-semibold text-foreground">
                    Your request
                  </h2>
                  <p className="block text-muted-foreground">
                    {replyPostureLabel(trust.replyPosture)}
                  </p>
                </div>
                {inquiryAffordance.kind === 'available' ? (
                  <Button asChild variant="secondary" size="lg" className={peerActionClassName}>
                    <Link to="/$slug/inquiry" params={{ slug: catalog.slug }} search={inquirySearch}>Ask this business</Link>
                  </Button>
                ) : (
                  <p className="block text-muted-foreground">This business hasn’t joined AE yet</p>
                )}
                <AeProtectedByAe />
              </div>
            </Card>
          ) : null}

          <details className="border-t border-border pt-2">
            <summary className="flex min-h-11 cursor-pointer items-center rounded-md px-2 text-sm font-semibold text-muted-foreground hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2">
              Page info
            </summary>
            <div className="grid gap-2 px-2 pb-2 pt-3">
              <p className="block text-sm font-semibold text-muted-foreground">Data for AI assistants</p>
              <p className="block text-sm text-muted-foreground">A machine-readable copy of this page.</p>
              <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
            </div>
          </details>

          <Link to="/privacy/remove-business" className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">
            Correct or remove this page
          </Link>
        </aside>
      </div>
    </article>
  )
}

export function ListingFirstScreen({
  catalog,
  trust,
  inquiryAffordance,
  inquirySearch,
  pseudonymousJourneyId,
  offeringDetailMode = false,
}: {
  catalog: PublicBusinessCatalogApiV2Dto
  trust: ListingTrustProjection
  inquiryAffordance: PublicInquiryAffordance
  inquirySearch: InquiryOriginSearch
  pseudonymousJourneyId?: PseudonymousJourneyId | null
  offeringDetailMode?: boolean
}) {
  const [detailsCopied, setDetailsCopied] = useState(false)
  const phone = trust.phone.kind === 'published' ? trust.phone.value : undefined
  const telDestination = phone === undefined ? undefined : telUri(phone)
  const publishedFacts = [trust.phone, trust.hours, trust.serviceArea].filter((fact) => fact.kind === 'published')
  function recordDirectCall() {
    if (pseudonymousJourneyId === null || pseudonymousJourneyId === undefined) {
      return
    }
    emitWave1JourneyEvent({
      event: 'direct_call_selected',
      eventVersion: 1,
      journey: 'J1',
      pseudonymousJourneyId,
    })
  }
  async function copyDetails() {
    const details = [
      catalog.name,
      catalog.category,
      `Phone: ${trustFactText(trust.phone)}`,
      `Hours: ${trustFactText(trust.hours)}`,
      `Service area: ${trustFactText(trust.serviceArea)}`,
    ].join('\n')

    try {
      await copyTextToClipboard(details)
      setDetailsCopied(true)
      window.setTimeout(() => setDetailsCopied(false), 1600)
    } catch {
      window.prompt('Copy business details:', details)
    }
  }

  return (
    <Card className="overflow-hidden p-6" aria-labelledby="provider-listing-title">
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <img src="/brand/logo/ae-seal.svg" alt="" className="size-6 shrink-0" />
          <p className="font-mono text-sm font-semibold text-brand">
            Business page for people and AI assistants
          </p>
        </div>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 id="provider-listing-title" className="text-balance text-4xl leading-none font-semibold tracking-tight text-foreground md:text-6xl">
              {catalog.name}
            </h1>
            <ProvenanceBadge source="business_published" />
          </div>
          <p className="block text-lg text-muted-foreground">{catalog.category}</p>
        </div>

        {publishedFacts.length === 0 ? null : (
          <dl className="grid gap-3 sm:grid-cols-3" aria-label="Published business details">
            <TrustFactRow label="Phone" fact={trust.phone} />
            <TrustFactRow label="Hours" fact={trust.hours} />
            <TrustFactRow label="Service area" fact={trust.serviceArea} />
          </dl>
        )}

        {offeringDetailMode ? null : (
          <p className="block max-w-3xl text-pretty text-foreground">{trust.explainer}</p>
        )}

        <div className="grid gap-3 sm:flex sm:flex-wrap" role="group" aria-label="Actions for this business">
          {phone === undefined || telDestination === undefined ? null : (
            <div data-peer-action="call" data-variant="primary">
              <Button asChild variant="default" size="lg" className={peerActionClassName} onClick={recordDirectCall}>
                <a href={telDestination}>Call now: {phone}</a>
              </Button>
            </div>
          )}
          <div data-peer-action="copy-details" data-variant="secondary">
            <Button type="button" variant="secondary" size="lg" className={peerActionClassName} onClick={() => void copyDetails()}>
              {detailsCopied ? 'Details copied' : 'Copy details'}
            </Button>
          </div>
          {offeringDetailMode ? null : inquiryAffordance.kind === 'available' ? (
            <div data-peer-action="ask" data-variant="secondary">
              <Button asChild variant="secondary" size="lg" className={peerActionClassName}>
                <Link to="/$slug/inquiry" params={{ slug: catalog.slug }} search={inquirySearch}>Ask this business</Link>
              </Button>
            </div>
          ) : (
            <p className="block text-muted-foreground">This business has not enabled messages here yet</p>
          )}
        </div>
      </div>
    </Card>
  )
}

/**
 * An unpublished fact is omitted, never announced. "Hours not published here"
 * fills a row, teaches nothing, and previously contradicted the offer section
 * below, which states the hours the owner did supply.
 */
function TrustFactRow({ label, fact }: { label: string; fact: TrustFact }) {
  if (fact.kind !== 'published') {
    return null
  }

  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-sm font-semibold text-muted-foreground">{label}</dt>
      <dd className="m-0 break-words text-foreground">{fact.value}</dd>
    </div>
  )
}

function trustFactText(fact: TrustFact): string {
  return fact.kind === 'published' ? fact.value : fact.label
}

function replyPostureLabel(posture: ReplyPosture): string {
  return posture.kind === 'observed' ? NO_REPLY_HISTORY : posture.label
}

function OfferingCardsSection({
  catalog,
  inquiryAffordance,
  inquirySearch,
}: {
  catalog: PublicBusinessCatalogApiV2Dto
  inquiryAffordance: PublicInquiryAffordance
  inquirySearch: InquiryOriginSearch
}) {
  if (catalog.offerings.length === 0) {
    return null
  }
  const selectedOfferingRef = inquiryAffordance.kind === 'available'
    ? inquiryAffordance.target.offeringRef
    : undefined

  return (
    <Card className="p-6" aria-labelledby="listing-offerings">
      <div className="grid gap-4">
        <div>
          <h2 id="listing-offerings" className="block text-lg font-semibold text-foreground">
            What this business offers
          </h2>
          <p className="block text-sm text-muted-foreground">
            Published by {catalog.name}. The business confirms each request.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {catalog.offerings.map((offering) => {
            const actionable = selectedOfferingRef === offering.offeringRef
            return (
              <AeOfferingCard
                key={offering.offeringRef}
                offering={offering}
                className="h-full content-start gap-2"
                actions={actionable ? (
                  <div className="pt-1">
                    <Link to="/$slug/inquiry" params={{ slug: catalog.slug }} search={inquirySearch}>
                      <Button variant="secondary" size="sm">Send a message</Button>
                    </Link>
                  </div>
                ) : undefined}
              />
            )
          })}
        </div>
      </div>
    </Card>
  )
}




function SourceStampCard({ updatedAt }: { updatedAt: number }) {
  return (
    <Card className="p-5" aria-labelledby="listing-source-stamps">
      <div className="grid gap-3">
        <h2 id="listing-source-stamps" className="block text-lg font-semibold text-foreground">
          Last updated
        </h2>
        <ul className="grid gap-2" aria-label="Last updated">
          <li><SourceStamp label="published details" updatedAt={updatedAt} /></li>
          <li><SourceStamp label="last checked" updatedAt={updatedAt} /></li>
        </ul>
      </div>
    </Card>
  )
}

function SourceStamp({ label, updatedAt }: { label: string; updatedAt?: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-mono text-xs tabular-nums text-brand">
      <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
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
      stamp: 'published details',
      note: 'Offerings, area, and contact details are on this page.',
      reached: true,
    },
    {
      title: 'Check the date',
      stamp: 'last checked',
      note: 'The date shows the latest page check.',
      reached: true,
    },
    {
      title: inquiryAvailable ? 'Send a message' : 'Contact details needed',
      stamp: 'for owner review',
      note: inquiryAvailable
        ? 'The business reviews your message and confirms the price and timing.'
        : 'The business needs to add a contact route first.',
      reached: false,
    },
  ] satisfies Array<{ title: string; stamp: string; note: string; reached: boolean }>

  return (
    <Card className="p-5" aria-labelledby="listing-reach-out-steps">
      <div className="grid gap-3">
        <h2 id="listing-reach-out-steps" className="block text-lg font-semibold text-foreground">
          What happens when you contact this business
        </h2>
        <ol className="grid gap-0" aria-label="What happens when you contact this business">
          {steps.map((step, index) => {
            const hasNext = index < steps.length - 1
            const nextReached = steps[index + 1]?.reached === true

            return (
              <li key={step.title} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
                <span className="relative mt-1 flex justify-center" aria-hidden="true">
                  <span className={cn('size-3 rounded-full border', step.reached ? 'border-brand bg-brand' : 'border-border bg-card')} />
                  {hasNext ? <span className={cn('absolute top-3 h-[calc(100%+1rem)] w-px', step.reached && nextReached ? 'bg-brand' : 'bg-border')} /> : null}
                </span>
                <span className="grid gap-1">
                  <span className="text-sm font-medium text-foreground">{step.title}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {step.stamp} · <time dateTime={timestampIso(updatedAt)}>{formatTimestamp(updatedAt)}</time>
                  </span>
                  <span className="text-sm text-muted-foreground">{step.note}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </Card>
  )
}

function WhatTheyOfferCard({
  catalog,
  presentation,
  officeAddress,
}: {
  catalog: PublicBusinessCatalogApiV2Dto
  presentation: ProviderPresentation
  officeAddress: string | undefined
}) {
  return (
    <Card className="grid gap-6 p-6" aria-labelledby="listing-offer-details">
      <div className="grid gap-1">
        <h2 id="listing-offer-details" className="block text-lg font-semibold text-foreground">
          Offerings and prices
        </h2>
        <p className="block text-sm text-muted-foreground">
          Published by {catalog.name}.
        </p>
      </div>

      <div className="grid gap-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Where they work</span>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <p className="text-sm font-medium text-muted-foreground">Service area</p>
            <p className="block text-pretty text-foreground">{presentation.serviceArea}</p>
            {officeAddress === undefined ? <AeGenerativeMap label={catalog.name} placeQuery={presentation.serviceArea} /> : null}
          </div>
          {officeAddress !== undefined ? (
            <div className="grid gap-1">
              <p className="text-sm font-medium text-muted-foreground">Office</p>
              <p className="block text-pretty text-foreground">{officeAddress}</p>
              <AeOfficeMap address={officeAddress} businessName={catalog.name} />
            </div>
          ) : null}
        </div>
      </div>

      <Separator />

      <div className="grid gap-3">
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Offerings</span>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1">
            <p className="text-sm font-medium text-muted-foreground">Offering</p>
            <p className="block text-foreground">{presentation.primaryOfferingName ?? catalog.category}</p>
          </div>
          {presentation.primaryOfferingName !== undefined ? (
            <div className="grid gap-1">
              <p className="text-sm font-medium text-muted-foreground">Availability</p>
              <p className="block tabular-nums text-foreground">{presentation.hoursLabel}</p>
            </div>
          ) : null}
        </div>
        {presentation.offeringChips.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {presentation.offeringChips.map((offering) => (
              <li key={offering.key}><span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-foreground">{offering.label}</span></li>
            ))}
          </ul>
        ) : null}
      </div>

      {presentation.primaryOfferingSummary !== undefined ? (
        <>
          <Separator />
          <div className="grid gap-3">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">About</span>
            <p className="block max-w-3xl text-pretty text-foreground">
              {presentation.primaryOfferingSummary}
            </p>
          </div>
        </>
      ) : null}
    </Card>
  )
}

function ListingPhotosSection({ catalog, presentation }: { catalog: PublicBusinessCatalogApiV2Dto; presentation: ProviderPresentation }) {
  const photos = catalog.photos

  // No photo is better than a stock category image captioned as a stock
  // category image: it occupied a third of the mobile page to tell the reader
  // that AE has no picture of this business.
  if (photos.length === 0) {
    return null
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

function readOfficeAddress(catalog: PublicBusinessCatalogApiV2Dto): string | undefined {
  const extended = catalog as PublicBusinessCatalogApiV2Dto & { officeAddress?: string }
  const value = extended.officeAddress?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}
function ListingBackLink({ from, threadId }: { from?: 'thread'; threadId?: string }) {
  const label = from === 'thread' && threadId !== undefined ? 'Back to answer' : 'Find another business'
  const className = 'inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:underline'
  const content = (
    <>
      <ArrowLeftIcon aria-hidden="true" className="size-4" />
      {label}
    </>
  )

  if (from === 'thread' && threadId !== undefined) {
    return <Link to="/t/$threadId" params={{ threadId }} className={className}>{content}</Link>
  }
  return <Link to="/" className={className}>{content}</Link>
}
