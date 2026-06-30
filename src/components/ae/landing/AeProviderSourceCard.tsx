import { Link } from '@tanstack/react-router'

import type { AnswerSource } from '@/modules/answer/public'

export type AeProviderSourceCardProps = {
  source: AnswerSource
}

export function AeProviderSourceCard({ source }: AeProviderSourceCardProps) {
  const area = source.serviceArea || source.suburb

  return (
    <article className="ae-source-card" data-availability={slugify(source.availabilityLabel)} id={`source-${source.citationIndex}`}>
      <Link to={source.detailUrl} className="ae-source-card__link" aria-label={`${source.name}, ${source.category}, source ${source.citationIndex}`}>
        <div className="ae-source-card__head">
          <span className="ae-source-card__index" aria-hidden="true">{source.citationIndex}</span>
          <div className="ae-source-card__title">
            <h3 className="ae-source-card__name">{source.name}</h3>
            <p className="ae-source-card__category">{source.category}</p>
          </div>
          <span className="ae-source-card__pill" data-availability={slugify(source.availabilityLabel)}>
            {source.availabilityLabel}
          </span>
        </div>

        <dl className="ae-source-card__facts">
          <div className="ae-source-card__fact">
            <dt>Service area</dt>
            <dd>{area || 'Check area'}</dd>
          </div>
          <div className="ae-source-card__fact">
            <dt>Hours</dt>
            <dd>{source.hoursLabel}</dd>
          </div>
        </dl>

        {source.services.length > 0 ? (
          <ul className="ae-source-card__services" aria-label="Listed services">
            {source.services.slice(0, 4).map((service) => (
              <li key={service.name} className="ae-source-card__chip">{service.name}</li>
            ))}
          </ul>
        ) : null}

        <div className="ae-source-card__cta">
          <span aria-hidden="true">→</span>
          <span>{source.nextStepLabel}</span>
        </div>
      </Link>
    </article>
  )
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
