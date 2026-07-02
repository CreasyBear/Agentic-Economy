import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import type { AnswerSource } from '@/modules/answer/public'

export type AeProviderSourceCardProps = {
  source: AnswerSource
}

export function AeProviderSourceCard({ source }: AeProviderSourceCardProps) {
  const area = source.serviceArea || source.suburb

  return (
    <article className="ae-source-card" data-availability={slugify(source.availabilityLabel)} id={`source-${source.citationIndex}`}>
      <div className="ae-source-card__main">
        <div className="ae-source-card__head">
          <span className="ae-source-card__index" aria-hidden="true">{source.citationIndex}</span>
          <div className="ae-source-card__title">
            <h3 className="ae-source-card__name">
              <Link to={source.detailUrl} className="ae-source-card__name-link">
                {source.name}
              </Link>
            </h3>
            <p className="ae-source-card__category">{source.category}</p>
            {source.trustCue.length > 0 ? <p className="ae-source-card__trust">{source.trustCue}</p> : null}
          </div>
          {source.photoUrl !== undefined ? (
            <img className="ae-source-card__photo" src={source.photoUrl} alt="" loading="lazy" />
          ) : null}
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
      </div>

      <div className="ae-source-card__actions">
        {source.inquiryUrl !== undefined ? (
          <Button asChild variant="landingPrimary" size="sm">
            <Link to={source.inquiryUrl}>Send inquiry</Link>
          </Button>
        ) : null}
        <Button asChild variant="publicSecondary" size="sm">
          <Link to={source.detailUrl}>
            {source.inquiryUrl === undefined ? source.nextStepLabel : 'View details'}
          </Link>
        </Button>
      </div>
    </article>
  )
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}
