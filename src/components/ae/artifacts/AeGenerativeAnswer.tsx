import type { ReactNode } from 'react'
import { ArrowRightIcon, CheckIcon, MapPinIcon, SearchIcon } from 'lucide-react'

import {
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type { AnswerArtifact, AnswerCompareField, AnswerSource } from '@/modules/answer/public'
import { AeProviderSourceCard } from '@/components/ae/landing/AeProviderSourceCard'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeGenerativeMap } from './AeGenerativeMap'
import { AeProtectedByAe } from './AeProtectedByAe'

export type AeGenerativeAnswerPhase =
  | 'idle'
  | 'streaming'
  | 'reconnecting'
  | 'complete'
  | 'stopped'
  | 'error'

export type AeGenerativeAnswerProps = {
  artifacts: readonly AnswerArtifact[]
  query: string
  layoutProfile?: AnswerLayoutProfile
  busy?: boolean
  oneLineFallback?: string
  onStop?: () => void
  phase?: AeGenerativeAnswerPhase
  errorMessage?: ReactNode | null
}

export function AeGenerativeAnswer({
  artifacts,
  query,
  layoutProfile,
  busy = false,
  oneLineFallback = '',
  onStop,
  phase = 'idle',
  errorMessage = null,
}: AeGenerativeAnswerProps) {
  const profile = inferLayoutProfileFromArtifacts({
    artifacts,
    ...(layoutProfile === undefined ? {} : { layoutProfile }),
    busy,
  })

  const parts = artifactsToMessageParts(artifacts, profile)
  const oneLinePart = parts.find((part) => part.kind === 'one-line')
  const headline =
    oneLinePart?.kind === 'one-line'
      ? oneLinePart.text
      : oneLineFallback.length > 0
        ? oneLineFallback
        : ''

  const providerCards = artifacts.find((artifact) => artifact.kind === 'provider-cards')
  const providerCount = providerCards?.kind === 'provider-cards' ? providerCards.providers.length : 0
  const empty = phase === 'complete' && providerCount === 0
  const isFirstTurnProfile = profile === 'discovery_full' || profile === 'empty_state'

  return (
    <section
      className="ae-answer ae-generative-answer"
      data-phase={phase}
      data-profile={profile}
      data-empty={empty ? 'true' : 'false'}
      aria-busy={busy}
    >
      <div className="ae-answer__head">
        {headline.length > 0 ? (
          <p
            className={`ae-answer__one-line${isFirstTurnProfile ? '' : ' ae-answer__one-line--follow-up'}`}
            aria-live={busy ? 'polite' : 'off'}
          >
            {headline}
          </p>
        ) : busy ? (
          <p
            className="ae-answer__one-line ae-answer__one-line--thinking"
            aria-live="polite"
            aria-label="Finding listed providers"
          >
            <AeStreamingLabel as="span">Finding listed providers</AeStreamingLabel>
          </p>
        ) : (
          <p className="ae-answer__one-line ae-answer__one-line--placeholder">Finding listed providers</p>
        )}

        {phase === 'reconnecting' ? (
          <span className="ae-answer__reconnect" role="status">
            <AeStreamingLabel as="span">Reconnecting…</AeStreamingLabel>
          </span>
        ) : null}

        {busy && onStop !== undefined ? (
          <button type="button" className="ae-answer__stop" onClick={onStop} aria-label="Stop generating the answer">
            Stop
          </button>
        ) : null}
      </div>

      {phase === 'error' && errorMessage !== null ? (
        <div className="ae-answer__error" role="alert">
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {parts.map((part, index) => (
        <AnswerPartView key={`${part.kind}-${index}`} part={part} query={query} empty={empty} phase={phase} />
      ))}

      {phase === 'complete' && !empty ? (
        <p className="sr-only" role="status">
          Answer ready.
        </p>
      ) : null}
    </section>
  )
}

function AnswerPartView({
  part,
  query,
  empty,
  phase,
}: {
  part: AnswerMessagePart
  query: string
  empty: boolean
  phase: AeGenerativeAnswerPhase
}) {
  switch (part.kind) {
    case 'one-line':
      return null
    case 'provider-cards':
      return <ProviderCardsRail providers={part.providers} scroll={part.scroll === true} />
    case 'provider-compare-table':
      return (
        <ProviderCompareTable
          providers={part.providers}
          {...(part.fields === undefined ? {} : { fields: part.fields })}
        />
      )
    case 'service-area-fit':
      return (
        <ServiceAreaFit
          providers={part.providers}
          {...(part.locationLabel === undefined ? {} : { locationLabel: part.locationLabel })}
        />
      )
    case 'next-step-menu':
      return !empty ? <NextStepMenu providers={part.providers} /> : null
    case 'confirmation-checklist':
      return !empty ? (
        <ConfirmationChecklist items={part.items} {...(part.title === undefined ? {} : { title: part.title })} />
      ) : null
    case 'recovery-prompts':
      return empty ? (
        <RecoveryPrompts prompts={part.prompts} {...(part.title === undefined ? {} : { title: part.title })} />
      ) : null
    case 'route-perspective':
      return (
        <RoutePerspective
          providers={part.providers}
          {...(part.query === undefined ? {} : { query: part.query })}
        />
      )
    case 'published-details-rail':
      return <PublishedDetailsRail providers={part.providers} />
    case 'provider-tradeoff-list':
      return <ProviderTradeoffList providers={part.providers} />
    case 'message-starter':
      return !empty ? (
        <MessageStarter
          provider={part.provider}
          need={part.need}
          {...(part.location === undefined ? {} : { location: part.location })}
          {...(part.timing === undefined ? {} : { timing: part.timing })}
        />
      ) : null
    case 'safe-route-rail':
      return (
        <SafeRouteRail
          {...(part.providers === undefined ? {} : { providers: part.providers })}
          {...(part.query === undefined ? {} : { query: part.query })}
        />
      )
    case 'location-map':
      return <AeGenerativeMap label={part.label} placeQuery={part.placeQuery} />
    case 'empty-state':
      return empty ? (
        <div className="ae-answer__empty" role="status">
          <p>{part.text}</p>
        </div>
      ) : null
    case 'prose':
      return !empty && part.text.length > 0 ? (
        <p className="ae-answer__summary" aria-live="off">
          {part.text}
        </p>
      ) : null
    case 'what-to-do-now':
      return !empty && part.text.length > 0 ? (
        part.compact === true ? (
          <p className="ae-answer__next-step ae-answer__next-step--compact">{part.text}</p>
        ) : (
          <p className="ae-answer__next-step">
            <span className="ae-answer__next-step-label">What to do now</span> {part.text}
          </p>
        )
      ) : null
    case 'protected-by-ae':
      return phase === 'complete' ? <AeProtectedByAe /> : null
    case 'agent-json':
      return phase === 'complete' ? (
        <AeAgentJsonAffordance agentJsonUrl={part.url} query={query} />
      ) : null
    default: {
      const _exhaustive: never = part
      void _exhaustive
      return null
    }
  }
}

function ProviderCardsRail({
  providers,
  scroll,
}: {
  providers: readonly AnswerSource[]
  scroll: boolean
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <ul
      className={`ae-answer__sources${scroll ? ' ae-answer__sources--scroll' : ''}`}
      aria-label="Cited local providers"
    >
      {providers.map((source) => (
        <li key={source.slug}>
          <AeProviderSourceCard source={source} />
        </li>
      ))}
    </ul>
  )
}

const DEFAULT_COMPARE_FIELDS: readonly AnswerCompareField[] = ['area', 'response', 'availability', 'nextStep']

function ProviderCompareTable({
  providers,
  fields = DEFAULT_COMPARE_FIELDS,
}: {
  providers: readonly AnswerSource[]
  fields?: readonly AnswerCompareField[]
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section className="ae-answer-compare" aria-label="Provider comparison">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Compare</p>
          <p className="ae-answer-panel-title">Published fit, side by side</p>
        </div>
        <p className="ae-answer-panel-note">{listingCountLabel(providers.length)}</p>
      </header>
      <div className="ae-answer-compare__scroller">
        <table className="ae-answer-compare__table">
          <caption className="ae-answer-compare__caption">
            Comparison based on published provider details.
          </caption>
          <thead>
            <tr>
              <th scope="col">Provider</th>
              {fields.map((field) => (
                <th key={field} scope="col">
                  {compareFieldLabel(field)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <ProviderCompareRow key={provider.slug} provider={provider} fields={fields} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProviderCompareRow({
  provider,
  fields,
}: {
  provider: AnswerSource
  fields: readonly AnswerCompareField[]
}) {
  return (
    <tr>
      <th scope="row">
        <span className="ae-answer-compare__provider">
          <a href={provider.detailUrl}>{provider.name}</a>
          <span>{provider.category}</span>
        </span>
      </th>
      {fields.map((field) => (
        <td key={`${provider.slug}-${field}`}>
          <span className={`ae-answer-compare__value ae-answer-compare__value--${field}`}>
            {compareFieldValue(provider, field)}
          </span>
        </td>
      ))}
    </tr>
  )
}

function ServiceAreaFit({
  providers,
  locationLabel,
}: {
  providers: readonly AnswerSource[]
  locationLabel?: string
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section className="ae-answer-fit" aria-label="Service area fit">
      <div className="ae-answer-fit__head">
        <span className="ae-answer-fit__icon" aria-hidden="true">
          <MapPinIcon />
        </span>
        <div>
          <p className="ae-answer-panel-kicker">Service area fit</p>
          <p className="ae-answer-panel-title">Where each listing says it works</p>
        </div>
        {locationLabel === undefined ? null : <p className="ae-answer-fit__location">{locationLabel}</p>}
      </div>
      <ul className="ae-answer-fit__list">
        {providers.map((provider) => (
          <li key={provider.slug} className="ae-answer-fit__item">
            <span className="ae-answer-fit__marker">{provider.citationIndex}</span>
            <span className="ae-answer-fit__copy">
              <span className="ae-answer-fit__name">{provider.name}</span>
              <span className="ae-answer-fit__area">{provider.serviceArea}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NextStepMenu({ providers }: { providers: readonly AnswerSource[] }) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section className="ae-answer-next-menu" aria-label="Provider next steps">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Contact path</p>
          <p className="ae-answer-panel-title">Choose a route with clear expectations</p>
        </div>
      </header>
      <ul className="ae-answer-next-menu__list">
        {providers.map((provider) => {
          const actionHref = provider.inquiryUrl ?? provider.detailUrl
          const actionLabel = provider.inquiryUrl === undefined ? 'View details' : provider.nextStepLabel

          return (
            <li key={provider.slug} className="ae-answer-next-menu__item">
              <span className="ae-answer-next-menu__index">{provider.citationIndex}</span>
              <div className="ae-answer-next-menu__copy">
                <span className="ae-answer-next-menu__name">{provider.name}</span>
                <span className="ae-answer-next-menu__meta">
                  <span>{provider.responseTimeLabel}</span>
                  <span>{provider.availabilityLabel}</span>
                </span>
              </div>
              <a className="ae-answer-next-menu__action" href={actionHref}>
                <span>{actionLabel}</span>
                <ArrowRightIcon aria-hidden="true" />
              </a>
            </li>
          )
        })}
      </ul>
      <p className="ae-answer-next-menu__boundary">Availability, quote, and job acceptance still need a reply.</p>
    </section>
  )
}

function ConfirmationChecklist({
  title,
  items,
}: {
  title?: string
  items: readonly string[]
}) {
  return (
    <section className="ae-answer-checklist" aria-label={title ?? 'Before contacting'}>
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Before you send</p>
          <p className="ae-answer-panel-title">{title ?? 'Confirm the handoff details'}</p>
        </div>
      </header>
      <ul className="ae-answer-checklist__list">
        {items.map((item) => (
          <li key={item} className="ae-answer-checklist__item">
            <span className="ae-answer-checklist__check" aria-hidden="true">
              <CheckIcon />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecoveryPrompts({
  title,
  prompts,
}: {
  title?: string
  prompts: readonly { label: string; query: string }[]
}) {
  if (prompts.length === 0) {
    return null
  }

  return (
    <section className="ae-answer-recovery" aria-label={title ?? 'Try another search'}>
      <header className="ae-answer-recovery__head">
        <span className="ae-answer-recovery__icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <div>
          <p className="ae-answer-panel-kicker">Refine search</p>
          <p className="ae-answer-panel-title">{title ?? 'Try a narrower query'}</p>
        </div>
      </header>
      <ul className="ae-answer-recovery__list">
        {prompts.map((prompt) => (
          <li key={`${prompt.label}-${prompt.query}`}>
            <a className="ae-answer-recovery__prompt" href={`/?q=${encodeURIComponent(prompt.query)}`}>
              {prompt.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RoutePerspective({
  providers,
  query,
}: {
  providers: readonly AnswerSource[]
  query?: string
}) {
  const target =
    providers.length === 1 && providers[0] !== undefined
      ? providers[0].name
      : listingCountLabel(providers.length)

  return (
    <section className="ae-answer-perspective" aria-label="How this route works">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Three views</p>
          <p className="ae-answer-panel-title">How to read this route</p>
        </div>
        {query === undefined ? null : <p className="ae-answer-panel-note">{query}</p>}
      </header>
      <ul className="ae-answer-perspective__list">
        <RoutePerspectiveItem
          index="1"
          label="Person"
          text={`Compare ${target}, then open details or send a qualified inquiry where available.`}
        />
        <RoutePerspectiveItem
          index="2"
          label="Assistant"
          text="Read, compare, summarize, and route to the next step from the same published details."
        />
        <RoutePerspectiveItem
          index="3"
          label="Business"
          text="Confirm timing, quote, availability, and whether the job can be accepted."
        />
      </ul>
    </section>
  )
}

function PublishedDetailsRail({ providers }: { providers: readonly AnswerSource[] }) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section className="ae-answer-details" aria-label="Published provider details">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Published details</p>
          <p className="ae-answer-panel-title">Same facts, different readers</p>
        </div>
        <p className="ae-answer-panel-note">People and assistants read this from the same listing data.</p>
      </header>
      <ul className="ae-answer-details__list">
        {providers.map((provider) => (
          <ProviderDetailStamp key={provider.slug} provider={provider} />
        ))}
      </ul>
    </section>
  )
}

function ProviderTradeoffList({ providers }: { providers: readonly AnswerSource[] }) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section className="ae-answer-tradeoffs" aria-label="Provider tradeoffs">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Tradeoffs</p>
          <p className="ae-answer-panel-title">What stands out before you ask</p>
        </div>
      </header>
      <ul className="ae-answer-tradeoffs__list">
        {providers.map((provider) => (
          <ProviderTradeoffRow key={provider.slug} provider={provider} />
        ))}
      </ul>
    </section>
  )
}

function MessageStarter({
  provider,
  need,
  location,
  timing,
}: {
  provider: AnswerSource
  need: string
  location?: string
  timing?: string
}) {
  const actionHref = provider.inquiryUrl ?? provider.detailUrl
  const actionLabel = provider.inquiryUrl === undefined ? 'Open details' : provider.nextStepLabel

  return (
    <section className="ae-answer-draft" aria-label={`Message starter for ${provider.name}`}>
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Message starter</p>
          <p className="ae-answer-panel-title">A clearer first inquiry</p>
        </div>
      </header>
      <div className="ae-answer-draft__paper">
        <p className="ae-answer-draft__line">Hi {provider.name},</p>
        <p className="ae-answer-draft__line">I'm looking for help with {need}.</p>
        <p className="ae-answer-draft__line">
          Location: {location ?? 'please confirm whether this is inside your service area'}.
        </p>
        <p className="ae-answer-draft__line">Timing: {timing ?? 'please confirm your next available time'}.</p>
        <p className="ae-answer-draft__line">
          Could you confirm availability, what details you need from me, and whether you can quote?
        </p>
      </div>
      <div className="ae-answer-draft__footer">
        <p>Sending this starts a human inquiry. It does not book, charge, or dispatch work.</p>
        <a className="ae-answer-draft__action" href={actionHref}>
          <span>{actionLabel}</span>
          <ArrowRightIcon aria-hidden="true" />
        </a>
      </div>
    </section>
  )
}

function SafeRouteRail({
  providers,
  query,
}: {
  providers?: readonly AnswerSource[]
  query?: string
}) {
  return (
    <section className="ae-answer-route" aria-label="Safe route through Agentic Economy">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Safe route</p>
          <p className="ae-answer-panel-title">From need to next human step</p>
        </div>
        {query === undefined ? null : <p className="ae-answer-panel-note">{query}</p>}
      </header>
      <ol className="ae-answer-route__steps">
        <SafeRouteStep
          number="1"
          label="Read"
          text={`Start with ${providers === undefined ? 'published listings' : listingCountLabel(providers.length)} and their service areas.`}
        />
        <SafeRouteStep
          number="2"
          label="Compare"
          text="Check response time, availability, services, and what still needs confirmation."
        />
        <SafeRouteStep
          number="3"
          label="Ask"
          text="Send a qualified inquiry where available. A person still confirms timing, quote, and job acceptance."
        />
      </ol>
    </section>
  )
}

function RoutePerspectiveItem({
  index,
  label,
  text,
}: {
  index: string
  label: string
  text: string
}) {
  return (
    <li className="ae-answer-perspective__item">
      <span className="ae-answer-perspective__index">{index}</span>
      <span className="ae-answer-perspective__copy">
        <span className="ae-answer-perspective__label">{label}</span>
        <span className="ae-answer-perspective__text">{text}</span>
      </span>
    </li>
  )
}

function ProviderDetailStamp({ provider }: { provider: AnswerSource }) {
  return (
    <li className="ae-answer-details__item">
      <span className="ae-answer-details__stamp">{provider.citationIndex}</span>
      <span className="ae-answer-details__copy">
        <a className="ae-answer-details__name" href={provider.detailUrl}>
          {provider.name}
        </a>
        <span className="ae-answer-details__facts">
          <span>{provider.category}</span>
          <span>{provider.serviceArea}</span>
          <span>{provider.responseTimeLabel}</span>
          <span>{provider.trustCue}</span>
        </span>
      </span>
    </li>
  )
}

function ProviderTradeoffRow({ provider }: { provider: AnswerSource }) {
  const services = provider.services.slice(0, 3)

  return (
    <li className="ae-answer-tradeoffs__row">
      <span className="ae-answer-tradeoffs__index">{provider.citationIndex}</span>
      <span className="ae-answer-tradeoffs__main">
        <a className="ae-answer-tradeoffs__name" href={provider.detailUrl}>
          {provider.name}
        </a>
        <span className="ae-answer-tradeoffs__meta">
          <span>{provider.availabilityLabel}</span>
          <span>{provider.responseTimeLabel}</span>
        </span>
        {services.length === 0 ? null : (
          <span className="ae-answer-tradeoffs__services">
            {services.map((service) => (
              <span key={`${provider.slug}-${service.name}`}>{service.name}</span>
            ))}
          </span>
        )}
      </span>
      <span className="ae-answer-tradeoffs__confirm">
        Confirm timing, quote, and job acceptance with the business.
      </span>
    </li>
  )
}

function SafeRouteStep({
  number,
  label,
  text,
}: {
  number: string
  label: string
  text: string
}) {
  return (
    <li className="ae-answer-route__step">
      <span className="ae-answer-route__number">{number}</span>
      <span className="ae-answer-route__copy">
        <span className="ae-answer-route__label">{label}</span>
        <span className="ae-answer-route__text">{text}</span>
      </span>
    </li>
  )
}

function compareFieldLabel(field: AnswerCompareField): string {
  switch (field) {
    case 'area':
      return 'Area'
    case 'response':
      return 'Response'
    case 'availability':
      return 'Availability'
    case 'hours':
      return 'Hours'
    case 'trust':
      return 'Published detail'
    case 'nextStep':
      return 'Next step'
  }
}

function compareFieldValue(provider: AnswerSource, field: AnswerCompareField): string {
  switch (field) {
    case 'area':
      return provider.serviceArea
    case 'response':
      return provider.responseTimeLabel
    case 'availability':
      return provider.availabilityLabel
    case 'hours':
      return provider.hoursLabel
    case 'trust':
      return provider.trustCue
    case 'nextStep':
      return provider.nextStepLabel
  }
}

function listingCountLabel(count: number): string {
  if (count === 1) {
    return '1 listing'
  }
  if (count <= 0) {
    return 'published listings'
  }
  return `${count} listings`
}
