import { defineComponent, createLibrary } from '@openuidev/react-lang'
import { z } from 'zod'

import { AeProviderSourceCard } from '@/components/ae/landing/AeProviderSourceCard'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeGenerativeMap } from '@/components/ae/artifacts/AeGenerativeMap'
import { AeProtectedByAe } from '@/components/ae/artifacts/AeProtectedByAe'
import { AeThinkingRail } from '@/components/ae/artifacts/AeThinkingRail'
import { AnswerSourceSchema } from '../answer-schema'
import type { AnswerSource } from '../answer-synthesizer'

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
    ],
  })
}
