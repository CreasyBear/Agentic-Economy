import { Link } from '@tanstack/react-router'

import {
  categoryIllustrationPath,
  plainAvailabilityLabel,
  plainNextStepLabel,
  plainResponseTimeLabel,
} from '@/lib/ui/status-presentation'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

type AeRegistryCardProps = {
  item: PublicBusinessCatalogApiDto
}

export function AeRegistryCard({ item }: AeRegistryCardProps) {
  const primaryService = item.services[0]
  const photo = item.photos[0]
  const illustration = categoryIllustrationPath(item.category)
  const imageUrl = photo?.url ?? illustration
  const imageAlt = photo?.alt ?? `${item.category} illustration`
  const availabilityLabel = plainAvailabilityLabel({
    discoveryStatus: item.discoveryStatus,
    firstRequestMode: primaryService?.firstRequest.mode ?? 'not_available_yet',
  })
  const responseTimeLabel = plainResponseTimeLabel(item.responseTimeMinutes)
  const serviceArea = primaryService?.serviceArea ?? `${item.suburb}, ${item.stateTerritory}`
  const firstRequestMode = primaryService?.firstRequest.mode ?? 'not_available_yet'
  const nextStepLabel =
    firstRequestMode === 'inquiry_available'
      ? 'Send inquiry'
      : plainNextStepLabel(firstRequestMode)
  const serviceChips = item.services.slice(0, 3)

  return (
    <Link
      to="/$slug"
      params={{ slug: item.slug }}
      className="ae-registry-card"
      aria-label={`View details for ${item.name}`}
    >
      <article className="ae-registry-card__inner">
        <figure className="ae-registry-card__media">
          <img className="ae-registry-card__image" src={imageUrl} alt={imageAlt} loading="lazy" />
        </figure>

        <div className="ae-registry-card__body">
          <div className="ae-registry-card__head">
            <div className="ae-registry-card__meta">
              <span className="ae-registry-card__location">
                {item.category} · {item.suburb}, {item.stateTerritory}
              </span>
              <h2 className="ae-registry-card__name">{item.name}</h2>
            </div>
            <span className="ae-registry-card__pill" data-availability={slugify(availabilityLabel)}>
              {availabilityLabel}
            </span>
          </div>

          {responseTimeLabel.length > 0 ? <p className="ae-registry-card__response">{responseTimeLabel}</p> : null}

          {serviceChips.length > 0 ? (
            <ul className="ae-registry-card__services" aria-label="Listed services">
              {serviceChips.map((service) => (
                <li key={service.slug} className="ae-registry-card__chip">
                  {service.name}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="ae-registry-card__details" aria-label="Published details">
            <span className="ae-registry-card__details-label">Published details</span>
            <dl className="ae-registry-card__facts">
              <div>
                <dt>Service area</dt>
                <dd>{serviceArea}</dd>
              </div>
              <div>
                <dt>Response</dt>
                <dd>{responseTimeLabel.length > 0 ? responseTimeLabel : 'Not supplied yet'}</dd>
              </div>
            </dl>
            <p className="ae-registry-card__next">
              <strong>Best next step:</strong> {nextStepLabel}
            </p>
          </div>
        </div>
      </article>
    </Link>
  )
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
