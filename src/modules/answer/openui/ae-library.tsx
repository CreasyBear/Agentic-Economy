import { defineComponent, createLibrary } from '@openuidev/react-lang'
import { ArrowRightIcon, CheckIcon, MapPinIcon, SearchIcon } from 'lucide-react'
import { z } from 'zod'

import { AeProviderSourceCard } from '@/components/ae/landing/AeProviderSourceCard'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeGenerativeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { AeThinkingRail } from '@/components/ae/artifacts/AeThinkingRail'
import { AnswerSourceSchema } from '../answer-schema'
import type { AnswerSource } from '../answer-synthesizer'

const providerArraySchema = z.array(AnswerSourceSchema)
const compareFieldSchema = z.enum(['area', 'response', 'availability', 'hours', 'trust', 'nextStep'])

const OneLine = defineComponent({
  name: 'OneLine',
  description: 'Fraunces one-line answer strip',
  props: z.object({ text: z.string() }),
  component: ({ props }) => <p className="ae-answer__one-line">{props.text}</p>,
})

const ProviderCards = defineComponent({
  name: 'ProviderCards',
  description: 'Grid of cited provider cards linking to business pages',
  props: z.object({ providers: z.array(AnswerSourceSchema), scroll: z.boolean().optional() }),
  component: ({ props }) => (
    <ul
      className={`ae-answer__sources${props.scroll === true ? ' ae-answer__sources--scroll' : ''}`}
      aria-label="Cited local providers"
    >
      {props.providers.map((source) => (
        <li key={source.slug}>
          <AeProviderSourceCard source={source as AnswerSource} />
        </li>
      ))}
    </ul>
  ),
})

const ProviderCompareTable = defineComponent({
  name: 'ProviderCompareTable',
  description: 'Decision table for catalog-grounded provider comparisons',
  props: z.object({
    providers: providerArraySchema,
    fields: z.array(compareFieldSchema).optional(),
  }),
  component: ({ props }) => {
    const providers = props.providers as AnswerSource[]
    const fields = props.fields ?? ['area', 'response', 'availability', 'nextStep']
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
  },
})

const ServiceAreaFit = defineComponent({
  name: 'ServiceAreaFit',
  description: 'Location fit panel showing where cited providers work',
  props: z.object({
    providers: providerArraySchema,
    locationLabel: z.string().optional(),
  }),
  component: ({ props }) => {
    const providers = props.providers as AnswerSource[]
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
          {props.locationLabel === undefined ? null : (
            <p className="ae-answer-fit__location">{props.locationLabel}</p>
          )}
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
  },
})

const NextStepMenu = defineComponent({
  name: 'NextStepMenu',
  description: 'High-intent menu for safe provider next actions',
  props: z.object({ providers: providerArraySchema }),
  component: ({ props }) => {
    const providers = props.providers as AnswerSource[]
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
  },
})

const ConfirmationChecklist = defineComponent({
  name: 'ConfirmationChecklist',
  description: 'Human confirmation checklist for contacting a listed provider',
  props: z.object({
    title: z.string().optional(),
    items: z.array(z.string()).min(1).max(5),
  }),
  component: ({ props }) => (
    <section className="ae-answer-checklist" aria-label={props.title ?? 'Before contacting'}>
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Before you send</p>
          <p className="ae-answer-panel-title">{props.title ?? 'Confirm the handoff details'}</p>
        </div>
      </header>
      <ul className="ae-answer-checklist__list">
        {props.items.map((item) => (
          <li key={item} className="ae-answer-checklist__item">
            <span className="ae-answer-checklist__check" aria-hidden="true">
              <CheckIcon />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  ),
})

const RecoveryPrompts = defineComponent({
  name: 'RecoveryPrompts',
  description: 'Short query refinements for empty or broad searches',
  props: z.object({
    title: z.string().optional(),
    prompts: z.array(z.object({ label: z.string(), query: z.string() })).min(1).max(4),
  }),
  component: ({ props }) => (
    <section className="ae-answer-recovery" aria-label={props.title ?? 'Try another search'}>
      <header className="ae-answer-recovery__head">
        <span className="ae-answer-recovery__icon" aria-hidden="true">
          <SearchIcon />
        </span>
        <div>
          <p className="ae-answer-panel-kicker">Refine search</p>
          <p className="ae-answer-panel-title">{props.title ?? 'Try a narrower query'}</p>
        </div>
      </header>
      <ul className="ae-answer-recovery__list">
        {props.prompts.map((prompt) => (
          <li key={prompt.query}>
            <a className="ae-answer-recovery__prompt" href={`/?q=${encodeURIComponent(prompt.query)}`}>
              {prompt.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  ),
})

const RoutePerspective = defineComponent({
  name: 'RoutePerspective',
  description: 'Three-lens explanation of how people, assistants, and businesses should read a route',
  props: z.object({
    providers: providerArraySchema,
    query: z.string().optional(),
  }),
  component: ({ props }) => {
    const providers = props.providers as AnswerSource[]
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
          {props.query === undefined ? null : <p className="ae-answer-panel-note">{props.query}</p>}
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
  },
})

const PublishedDetailsRail = defineComponent({
  name: 'PublishedDetailsRail',
  description: 'Compact rail of published provider details that are safe to compare',
  props: z.object({ providers: providerArraySchema }),
  component: ({ props }) => {
    const providers = props.providers as AnswerSource[]
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
  },
})

const ProviderTradeoffList = defineComponent({
  name: 'ProviderTradeoffList',
  description: 'Provider-by-provider tradeoff scan using only published catalog facts',
  props: z.object({ providers: providerArraySchema }),
  component: ({ props }) => {
    const providers = props.providers as AnswerSource[]
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
  },
})

const MessageStarter = defineComponent({
  name: 'MessageStarter',
  description: 'Editable message starter for a qualified inquiry; does not send or imply booking',
  props: z.object({
    provider: AnswerSourceSchema,
    need: z.string(),
    location: z.string().optional(),
    timing: z.string().optional(),
  }),
  component: ({ props }) => {
    const provider = props.provider as AnswerSource
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
          <p className="ae-answer-draft__line">I'm looking for help with {props.need}.</p>
          <p className="ae-answer-draft__line">
            Location: {props.location ?? 'please confirm whether this is inside your service area'}.
          </p>
          <p className="ae-answer-draft__line">Timing: {props.timing ?? 'please confirm your next available time'}.</p>
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
  },
})

const SafeRouteRail = defineComponent({
  name: 'SafeRouteRail',
  description: 'Three-step route rail for what AE can safely help with',
  props: z.object({
    providers: providerArraySchema.optional(),
    query: z.string().optional(),
  }),
  component: ({ props }) => (
    <section className="ae-answer-route" aria-label="Safe route through Agentic Economy">
      <header className="ae-answer-panel-head">
        <div>
          <p className="ae-answer-panel-kicker">Safe route</p>
          <p className="ae-answer-panel-title">From need to next human step</p>
        </div>
        {props.query === undefined ? null : <p className="ae-answer-panel-note">{props.query}</p>}
      </header>
      <ol className="ae-answer-route__steps">
        <SafeRouteStep
          number="1"
          label="Read"
          text={`Start with ${props.providers === undefined ? 'published listings' : listingCountLabel(props.providers.length)} and their service areas.`}
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
  ),
})

const LocationMap = defineComponent({
  name: 'LocationMap',
  description: 'Google Maps embed for a location-shaped query',
  props: z.object({ label: z.string(), placeQuery: z.string() }),
  component: ({ props }) => <AeGenerativeMap label={props.label} placeQuery={props.placeQuery} />,
})

const Prose = defineComponent({
  name: 'Prose',
  description: 'Summary prose block',
  props: z.object({ text: z.string() }),
  component: ({ props }) => <p className="ae-answer__summary">{props.text}</p>,
})

const WhatToDoNow = defineComponent({
  name: 'WhatToDoNow',
  description: 'Plain-language guidance block',
  props: z.object({ text: z.string(), compact: z.boolean().optional() }),
  component: ({ props }) =>
    props.compact === true ? (
      <p className="ae-answer__next-step ae-answer__next-step--compact">{props.text}</p>
    ) : (
      <p className="ae-answer__next-step">
        <span className="ae-answer__next-step-label">What to do now</span> {props.text}
      </p>
    ),
})

const AgentJson = defineComponent({
  name: 'AgentJson',
  description: 'Quiet agent JSON affordance',
  props: z.object({ url: z.string(), query: z.string() }),
  component: ({ props }) => <AeAgentJsonAffordance agentJsonUrl={props.url} query={props.query} />,
})

const ProtectedByAe = defineComponent({
  name: 'ProtectedByAe',
  description: 'Trust boundary strip',
  props: z.object({}),
  component: () => <AeProtectedByAe />,
})

const ThinkingRail = defineComponent({
  name: 'ThinkingRail',
  description: 'Register-margin progress rail during streaming',
  props: z.object({
    step: z.enum(['search', 'read', 'write']).optional(),
    label: z.string(),
    visible: z.boolean(),
  }),
  component: ({ props }) => (
    <AeThinkingRail
      label={props.label}
      visible={props.visible}
      {...(props.step === undefined ? {} : { step: props.step })}
    />
  ),
})

const EmptyState = defineComponent({
  name: 'EmptyState',
  description: 'Honest empty registry state',
  props: z.object({ text: z.string() }),
  component: ({ props }) => (
    <div className="ae-answer__empty" role="status">
      <p>{props.text}</p>
    </div>
  ),
})

const CompareStrip = defineComponent({
  name: 'CompareStrip',
  description: 'Side-by-side compare summary for two providers',
  props: z.object({
    leftName: z.string(),
    leftArea: z.string(),
    rightName: z.string(),
    rightArea: z.string(),
  }),
  component: ({ props }) => (
    <p className="ae-answer__compare-strip">
      {props.leftName} works around {props.leftArea}. {props.rightName} works around {props.rightArea}.
    </p>
  ),
})

const ThreadFooter = defineComponent({
  name: 'ThreadFooter',
  description: 'Thread-level trust strip and agent JSON',
  props: z.object({ agentJsonUrl: z.string(), needQuery: z.string() }),
  component: ({ props }) => (
    <footer className="ae-thread-footer">
      <AeProtectedByAe />
      <AeAgentJsonAffordance agentJsonUrl={props.agentJsonUrl} query={props.needQuery} />
    </footer>
  ),
})

export const aeOpenUiLibrary = createLibrary({
  root: 'OneLine',
  components: [
    OneLine,
    ProviderCards,
    ProviderCompareTable,
    ServiceAreaFit,
    NextStepMenu,
    ConfirmationChecklist,
    RecoveryPrompts,
    RoutePerspective,
    PublishedDetailsRail,
    ProviderTradeoffList,
    MessageStarter,
    SafeRouteRail,
    LocationMap,
    Prose,
    WhatToDoNow,
    AgentJson,
    ProtectedByAe,
    ThinkingRail,
    EmptyState,
    CompareStrip,
    ThreadFooter,
  ],
})

export function aeOpenUiSystemPromptPreamble(): string {
  return aeOpenUiLibrary.prompt({
    preamble:
      'You output OpenUI Lang only. Use catalog-grounded provider data from registry.search. Never invent slugs or promise booking/payment.',
    additionalRules: [
      'Use layout profiles: discovery_full for first turns, refinement_compact for follow-ups.',
      'ThreadFooter belongs once per thread, not per turn.',
      'Use WhatToDoNow for guidance — never label Next step.',
      'Use ProviderCompareTable when the person asks to compare providers; only compare fields present on supplied providers.',
      'Use ServiceAreaFit when place or suburb fit matters; never claim coverage beyond the provider serviceArea text.',
      'Use NextStepMenu for high-intent contact flows; it may route to details or an inquiry, but never imply booking, payment, or dispatch.',
      'Use ConfirmationChecklist for timing, quote, access, photos, or scope details a person should confirm.',
      'Use RecoveryPrompts for empty or broad searches; prompts must stay inside local services and AE boundaries.',
      'Use RoutePerspective when explaining how a person, assistant, and business should each read the same route.',
      'Use PublishedDetailsRail when the answer needs a compact evidence-style scan; never call it proof or verification.',
      'Use ProviderTradeoffList when comparing practical fit without ranking or inventing a winner.',
      'Use MessageStarter only as editable inquiry copy; it must never imply the message was sent or that work is booked.',
      'Use SafeRouteRail when the person needs orientation across read, compare, and inquiry steps.',
    ],
  })
}

function ProviderCompareRow({
  provider,
  fields,
}: {
  provider: AnswerSource
  fields: readonly z.infer<typeof compareFieldSchema>[]
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

function compareFieldLabel(field: z.infer<typeof compareFieldSchema>): string {
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

function compareFieldValue(provider: AnswerSource, field: z.infer<typeof compareFieldSchema>): string {
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
