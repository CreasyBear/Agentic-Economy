import { ArrowLeftIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AeGenerativeMap, AeOfficeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { Button } from '@/components/ui/button'
import type { PublicPaidActivationDisplay } from '@/modules/billing/public'
import type { PublicRouteCatalogContract, PublicRouteServiceContract } from '@/modules/catalog/public'
import {
  firstRequestModeLabel,
  plainAvailabilityLabel,
  plainHoursLabel,
  plainTrustLabel,
  plainResponseTimeLabel,
  categoryIllustrationPath,
} from '@/lib/ui/status-presentation'
import type { PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'
import type { TrustTier } from '@/modules/business/public'

export type AeProviderListingPageProps = {
  catalog: PublicRouteCatalogContract
  inquiryAffordance: PublicInquiryAffordance
  agentJsonUrl: string
  activationDisplay?: PublicPaidActivationDisplay
}

export function AeProviderListingPage({ catalog, inquiryAffordance, agentJsonUrl, activationDisplay }: AeProviderListingPageProps) {
  const primaryService = catalog.services[0]
  const serviceArea = primaryService?.serviceArea ?? `${catalog.suburb}, ${catalog.stateTerritory}`
  const officeAddress = readOfficeAddress(catalog)
  const locationLabel = formatLocation(catalog)
  const availabilityLabel = plainAvailabilityLabel({
    discoveryStatus: catalog.discoveryStatus,
    firstRequestMode: primaryService?.firstRequest.mode ?? 'not_available_yet',
  })
  const responseTimeLabel = plainResponseTimeLabel(catalog.responseTimeMinutes)
  const trustSignals = [responseTimeLabel, plainTrustLabel(catalog.trustTier as TrustTier)]
    .filter((signal) => signal.length > 0)
    .join(' · ')

  return (
    <article className="ae-public-page ae-listing-page">
      <nav className="ae-listing-page__back" aria-label="Return to ask">
        <Link to="/" search={defaultHomeSearch} className="ae-listing-page__back-link">
          <ArrowLeftIcon aria-hidden="true" className="ae-listing-page__back-icon" />
          Ask another
        </Link>
      </nav>

      <header className="ae-listing-page__header">
        <p className="ae-listing-page__kicker">{locationLabel}</p>
        <h1 className="ae-listing-page__title">{catalog.name}</h1>
        <p className="ae-listing-page__category">{catalog.category}</p>
        <span className="ae-listing-page__pill" data-availability={availabilitySlug(availabilityLabel)}>
          {availabilityLabel}
        </span>
        <p className="ae-listing-page__trust">{trustSignals}</p>
      </header>

      <ListingPhotosSection catalog={catalog} />

      <div className="ae-listing-page__layout">
        <aside className="ae-listing-sticky-rail" aria-label="Actions for this business">
          <div className="ae-listing-sticky-rail__header">
            <h2 className="ae-listing-sticky-rail__title">
              {inquiryAffordance.kind === 'available' ? 'Contact this business' : 'Contact option'}
            </h2>
            <p className="ae-listing-sticky-rail__subtitle">
              {inquiryAffordance.kind === 'available'
                ? inquiryAffordance.disclosure
                : inquiryAffordance.reason}
            </p>
          </div>
          <div className="ae-listing-sticky-cta">
            {inquiryAffordance.kind === 'available' ? (
              <Button asChild variant="landingPrimary" className="ae-listing-page__primary-cta">
                <a href={inquiryAffordance.href}>{inquiryAffordance.label}</a>
              </Button>
            ) : null}
          </div>
          <AeProtectedByAe />
          <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
        </aside>

        <div className="ae-listing-page__main">
          <section className="ae-listing-page__section ae-listing-page__section--area" aria-labelledby="listing-area">
            <h2 id="listing-area">Service area</h2>
            <p className="ae-listing-page__area-lead">{serviceArea}</p>
            {officeAddress === undefined ? (
              <AeGenerativeMap label={catalog.name} placeQuery={serviceArea} />
            ) : null}
          </section>

          {catalog.services.length > 0 ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-services">
              <h2 id="listing-services">Services</h2>
              <ul className="ae-listing-page__chips">
                {catalog.services.map((service) => (
                  <li key={service.serviceSlug} className="ae-listing-page__chip">
                    {service.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {primaryService !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-hours">
              <h2 id="listing-hours">Hours</h2>
              <p>{plainHoursLabel(primaryService.hoursOrUnknown)}</p>
            </section>
          ) : null}

          {officeAddress !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-office">
              <h2 id="listing-office">Office</h2>
              <p>{officeAddress}</p>
              <AeOfficeMap address={officeAddress} businessName={catalog.name} />
            </section>
          ) : null}

          {primaryService !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-about">
              <h2 id="listing-about">About</h2>
              <p>{primaryService.summary}</p>
              <ServiceFacts service={primaryService} />
            </section>
          ) : null}

          {activationDisplay !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-activation">
              <h2 id="listing-activation">{activationDisplay.heading}</h2>
              <p>{activationDisplay.label}</p>
              <p className="ae-listing-page__muted">{activationDisplay.description}</p>
            </section>
          ) : null}

          <section className="ae-listing-page__section" aria-labelledby="listing-not-offered">
            <h2 id="listing-not-offered">Not offered on this page</h2>
            <p>Booking and payment are not promised here. Availability and quotes still need a reply from the business.</p>
          </section>

          <section className="ae-listing-page__section" aria-labelledby="listing-next">
            <h2 id="listing-next">What to do now</h2>
            {inquiryAffordance.kind === 'available' ? (
              <>
                <p>{inquiryAffordance.disclosure}</p>
                <p className="ae-listing-page__muted">
                  Your message goes to the business for review. This page does not promise a booking or payment.
                </p>
              </>
            ) : (
              <p>{inquiryAffordance.reason}</p>
            )}
          </section>

          <section className="ae-listing-page__section" aria-labelledby="listing-provenance">
            <h2 id="listing-provenance">{provenanceSectionTitle(catalog.trustTier as TrustTier)}</h2>
            <p>
              {plainTrustLabel(catalog.trustTier as TrustTier)}. Contact option:{' '}
              {firstRequestModeLabel(primaryService?.firstRequest.mode ?? 'not_available_yet')}.
            </p>
          </section>

          <footer className="ae-listing-page__footer">
            <Link to="/privacy/remove-business" className="ae-listing-page__footer-link">
              Correct or remove this page
            </Link>
          </footer>
        </div>
      </div>
    </article>
  )
}

function ListingPhotosSection({ catalog }: { catalog: PublicRouteCatalogContract }) {
  const illustration = categoryIllustrationPath(catalog.category)
  const photos = catalog.photos ?? []

  if (photos.length === 0) {
    return (
      <section className="ae-listing-page__gallery" aria-labelledby="listing-photos">
        <h2 id="listing-photos" className="sr-only">Photos</h2>
        <figure className="ae-listing-page__gallery-hero ae-listing-page__gallery-hero--illustration">
          <img src={illustration} alt="" />
          <figcaption className="ae-listing-page__gallery-caption">Hand-drawn category mark</figcaption>
        </figure>
      </section>
    )
  }

  if (photos.length === 1) {
    const photo = photos[0]
    if (photo === undefined) {
      return null
    }

    return (
      <section className="ae-listing-page__gallery" aria-labelledby="listing-photos">
        <h2 id="listing-photos" className="sr-only">Photos</h2>
        <figure className="ae-listing-page__gallery-hero">
          <img src={photo.url} alt={photo.alt} />
        </figure>
      </section>
    )
  }

  if (photos.length === 2) {
    return (
      <section className="ae-listing-page__gallery" aria-labelledby="listing-photos">
        <h2 id="listing-photos" className="sr-only">Photos</h2>
        <ul className="ae-listing-page__gallery-grid ae-listing-page__gallery-grid--2">
          {photos.map((photo) => (
            <li key={photo.url}>
              <figure className="ae-listing-page__gallery-figure">
                <img src={photo.url} alt={photo.alt} loading="lazy" />
              </figure>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  const heroPhoto = photos[0]
  if (heroPhoto === undefined) {
    return null
  }

  return (
    <section className="ae-listing-page__gallery" aria-labelledby="listing-photos">
      <h2 id="listing-photos" className="sr-only">Photos</h2>
      <div className="ae-listing-page__gallery-grid ae-listing-page__gallery-grid--3plus">
        <figure className="ae-listing-page__gallery-hero">
          <img src={heroPhoto.url} alt={heroPhoto.alt} />
        </figure>
        <ul className="ae-listing-page__gallery-side">
          {photos.slice(1, 5).map((photo, index) => (
            <li key={photo.url}>
              <figure className={`ae-listing-page__gallery-figure ae-listing-page__gallery-figure--${index + 2}`}>
                <img src={photo.url} alt={photo.alt} loading="lazy" />
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function provenanceSectionTitle(trustTier: TrustTier): string {
  switch (trustTier) {
    case 'registry_verified':
      return 'Checked details'
    case 'contact_confirmed':
      return 'Contact confirmed details'
    case 'listed':
    case 'claimed':
      return 'Details supplied by the business'
    default: {
      const _exhaustive: never = trustTier
      void _exhaustive
      return 'Published details'
    }
  }
}

function ServiceFacts({ service }: { service: PublicRouteServiceContract }) {
  return (
    <dl className="ae-listing-page__facts">
      <div className="ae-listing-page__fact">
        <dt>Published area</dt>
        <dd>{service.serviceArea}</dd>
      </div>
      <div className="ae-listing-page__fact">
        <dt>Contact option</dt>
        <dd>{firstRequestModeLabel(service.firstRequest.mode)}</dd>
      </div>
      <div className="ae-listing-page__fact">
        <dt>First step</dt>
        <dd>{service.firstRequest.publicDisclosure || service.firstRequest.noContactReason || 'Ask the business directly.'}</dd>
      </div>
    </dl>
  )
}

function formatLocation(catalog: PublicRouteCatalogContract): string {
  const parts = [catalog.suburb, catalog.stateTerritory]
  if (catalog.postcode !== undefined && catalog.postcode.trim().length > 0) {
    parts.push(catalog.postcode)
  }
  return parts.join(', ')
}

function availabilitySlug(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function readOfficeAddress(catalog: PublicRouteCatalogContract): string | undefined {
  const extended = catalog as PublicRouteCatalogContract & { officeAddress?: string }
  const value = extended.officeAddress?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}
