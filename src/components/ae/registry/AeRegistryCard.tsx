import { Link } from '@tanstack/react-router'

import { buildProviderPresentation } from '@/lib/ui/provider-presentation'
import type { PublicBusinessCatalogApiDto } from '@/modules/registry/public'

type AeRegistryCardProps = {
  item: PublicBusinessCatalogApiDto
}

export function AeRegistryCard({ item }: AeRegistryCardProps) {
  const presentation = buildProviderPresentation(item, { serviceChipLimit: 3 })

  return (
    <Link
      to="/$slug"
      params={{ slug: item.slug }}
      className="ae-registry-card"
      aria-label={`View details for ${item.name}`}
    >
      <article className="ae-registry-card__inner">
        <figure className="ae-registry-card__media">
          <img
            className="ae-registry-card__image"
            src={presentation.image.url}
            alt={presentation.image.alt}
            loading="lazy"
          />
        </figure>

        <div className="ae-registry-card__body">
          <div className="ae-registry-card__head">
            <div className="ae-registry-card__meta">
              <span className="ae-registry-card__location">
                {item.category} · {presentation.locationLabel}
              </span>
              <h2 className="ae-registry-card__name">{item.name}</h2>
            </div>
            <span className="ae-registry-card__pill" data-availability={presentation.availabilitySlug}>
              {presentation.availabilityLabel}
            </span>
          </div>

          {presentation.trustCue.length > 0 ? <p className="ae-registry-card__response">{presentation.trustCue}</p> : null}

          {presentation.serviceChips.length > 0 ? (
            <ul className="ae-registry-card__services" aria-label="Listed services">
              {presentation.serviceChips.map((service) => (
                <li key={service.key} className="ae-registry-card__chip">
                  {service.label}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="ae-registry-card__details" aria-label="Published details">
            <span className="ae-registry-card__details-label">Published details</span>
            <dl className="ae-registry-card__facts">
              <div>
                <dt>Service area</dt>
                <dd>{presentation.serviceArea}</dd>
              </div>
              <div>
                <dt>Response</dt>
                <dd>{presentation.responseFallbackLabel}</dd>
              </div>
            </dl>
            <p className="ae-registry-card__next">
              <strong>Best next step:</strong> {presentation.nextStepLabel}
            </p>
          </div>
        </div>
      </article>
    </Link>
  )
}
