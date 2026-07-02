import { ArrowLeftIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { AeGenerativeMap, AeOfficeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { defaultHomeSearch } from '@/components/ae/layout/AePublicShell'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { Button } from '@/components/ui/button'
import { buildProviderPresentation, type ProviderPresentation } from '@/lib/ui/provider-presentation'
import type { PublicRouteCatalogContract } from '@/modules/catalog/public'
import type { PublicInquiryAffordance } from '@/modules/inquiries/route-readbacks'

export type AeProviderListingPageProps = {
  catalog: PublicRouteCatalogContract
  inquiryAffordance: PublicInquiryAffordance
  agentJsonUrl: string
}

export function AeProviderListingPage({ catalog, inquiryAffordance, agentJsonUrl }: AeProviderListingPageProps) {
  const presentation = buildProviderPresentation(catalog)
  const officeAddress = readOfficeAddress(catalog)

  return (
    <article className="ae-public-page ae-listing-page">
      <nav className="ae-listing-page__back" aria-label="Return to ask">
        <Link to="/" search={defaultHomeSearch} className="ae-listing-page__back-link">
          <ArrowLeftIcon aria-hidden="true" className="ae-listing-page__back-icon" />
          Ask another
        </Link>
      </nav>

      <section className="ae-listing-page__overview" aria-label="Provider summary">
        <div className="ae-listing-page__summary">
          <header className="ae-listing-page__header">
            <p className="ae-listing-page__kicker">{presentation.locationLabel}</p>
            <h1 className="ae-listing-page__title">{catalog.name}</h1>
            <p className="ae-listing-page__category">{catalog.category}</p>
            <span className="ae-listing-page__pill" data-availability={presentation.availabilitySlug}>
              {presentation.availabilityLabel}
            </span>
            {presentation.trustCue.length > 0 ? <p className="ae-listing-page__trust">{presentation.trustCue}</p> : null}
          </header>

          <dl className="ae-listing-page__facts ae-listing-page__facts--hero" aria-label="Published provider facts">
            <div className="ae-listing-page__fact">
              <dt>Service area</dt>
              <dd>{presentation.serviceArea}</dd>
            </div>
            <div className="ae-listing-page__fact">
              <dt>Response</dt>
              <dd>{presentation.responseFallbackLabel}</dd>
            </div>
            <div className="ae-listing-page__fact">
              <dt>Service</dt>
              <dd>{presentation.primaryServiceName ?? catalog.category}</dd>
            </div>
          </dl>

          <aside className="ae-listing-sticky-rail" aria-label="Actions for this business">
            <div className="ae-listing-sticky-rail__header">
              <h2 className="ae-listing-sticky-rail__title">
                {inquiryAffordance.kind === 'available' ? presentation.nextStepLabel : 'Contact option'}
              </h2>
              <p className="ae-listing-sticky-rail__subtitle">
                {inquiryAffordance.kind === 'available'
                  ? 'Send the job details to the business so they can reply with timing and quote details.'
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
          </aside>
        </div>

        <ListingPhotosSection catalog={catalog} presentation={presentation} />
      </section>

      <div className="ae-listing-page__layout">
        <div className="ae-listing-page__main">
          <section className="ae-listing-page__section ae-listing-page__section--area" aria-labelledby="listing-area">
            <h2 id="listing-area">Service area</h2>
            <p className="ae-listing-page__area-lead">{presentation.serviceArea}</p>
            {officeAddress === undefined ? (
              <AeGenerativeMap label={catalog.name} placeQuery={presentation.serviceArea} />
            ) : null}
          </section>

          {presentation.serviceChips.length > 0 ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-services">
              <h2 id="listing-services">Services</h2>
              <ul className="ae-listing-page__chips">
                {presentation.serviceChips.map((service) => (
                  <li key={service.key} className="ae-listing-page__chip">
                    {service.label}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {presentation.primaryServiceName !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-hours">
              <h2 id="listing-hours">Hours</h2>
              <p>{presentation.hoursLabel}</p>
            </section>
          ) : null}

          {officeAddress !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-office">
              <h2 id="listing-office">Office</h2>
              <p>{officeAddress}</p>
              <AeOfficeMap address={officeAddress} businessName={catalog.name} />
            </section>
          ) : null}

          {presentation.primaryServiceSummary !== undefined ? (
            <section className="ae-listing-page__section" aria-labelledby="listing-about">
              <h2 id="listing-about">About</h2>
              <p>{presentation.primaryServiceSummary}</p>
            </section>
          ) : null}

          <section className="ae-listing-page__section" aria-labelledby="listing-reply">
            <h2 id="listing-reply">What comes from the reply</h2>
            <p>The business replies with timing, quote, and availability.</p>
          </section>

          <footer className="ae-listing-page__footer">
            <AeAgentJsonAffordance agentJsonUrl={agentJsonUrl} query={catalog.name} />
            <Link to="/privacy/remove-business" className="ae-listing-page__footer-link">
              Correct or remove this page
            </Link>
          </footer>
        </div>
      </div>
    </article>
  )
}

function ListingPhotosSection({
  catalog,
  presentation,
}: {
  catalog: PublicRouteCatalogContract
  presentation: ProviderPresentation
}) {
  const photos = catalog.photos ?? []

  if (photos.length === 0) {
    return (
      <section className="ae-listing-page__gallery" aria-labelledby="listing-photos">
        <h2 id="listing-photos" className="sr-only">Photos</h2>
        <figure className="ae-listing-page__gallery-hero ae-listing-page__gallery-hero--illustration">
          <img src={presentation.image.url} alt="" />
          <figcaption className="ae-listing-page__gallery-caption">Hand-drawn category mark</figcaption>
        </figure>
      </section>
    )
  }

  if (photos.length === 1) {
    return (
      <section className="ae-listing-page__gallery" aria-labelledby="listing-photos">
        <h2 id="listing-photos" className="sr-only">Photos</h2>
        <figure className="ae-listing-page__gallery-hero">
          <img src={presentation.image.url} alt={presentation.image.alt} />
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

function readOfficeAddress(catalog: PublicRouteCatalogContract): string | undefined {
  const extended = catalog as PublicRouteCatalogContract & { officeAddress?: string }
  const value = extended.officeAddress?.trim()
  return value !== undefined && value.length > 0 ? value : undefined
}
