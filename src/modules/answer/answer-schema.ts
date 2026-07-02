import { z } from 'zod'
import type { AnswerSource } from './answer-synthesizer'

export const AnswerSourceSchema = z.object({
  citationIndex: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  suburb: z.string(),
  stateTerritory: z.string(),
  serviceArea: z.string(),
  hoursLabel: z.string(),
  availabilityLabel: z.string(),
  trustLabel: z.string(),
  responseTimeLabel: z.string(),
  trustCue: z.string(),
  photoUrl: z.string().optional(),
  nextStepLabel: z.string(),
  detailUrl: z.string(),
  inquiryUrl: z.string().optional(),
  services: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      summary: z.string(),
    }),
  ),
})

export const AnswerCompareFieldSchema = z.enum(['area', 'response', 'availability', 'hours', 'trust', 'nextStep'])

export const AnswerArtifactSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one-line'), text: z.string() }),
  z.object({ kind: z.literal('provider-cards'), providers: z.array(AnswerSourceSchema) }),
  z.object({
    kind: z.literal('provider-compare-table'),
    providers: z.array(AnswerSourceSchema),
    fields: z.array(AnswerCompareFieldSchema).optional(),
  }),
  z.object({
    kind: z.literal('service-area-fit'),
    providers: z.array(AnswerSourceSchema),
    locationLabel: z.string().optional(),
  }),
  z.object({ kind: z.literal('next-step-menu'), providers: z.array(AnswerSourceSchema) }),
  z.object({
    kind: z.literal('confirmation-checklist'),
    title: z.string().optional(),
    items: z.array(z.string()).min(1).max(5),
  }),
  z.object({
    kind: z.literal('recovery-prompts'),
    title: z.string().optional(),
    prompts: z.array(z.object({ label: z.string(), query: z.string() })).min(1).max(4),
  }),
  z.object({
    kind: z.literal('route-perspective'),
    providers: z.array(AnswerSourceSchema),
    query: z.string().optional(),
  }),
  z.object({ kind: z.literal('published-details-rail'), providers: z.array(AnswerSourceSchema) }),
  z.object({ kind: z.literal('provider-tradeoff-list'), providers: z.array(AnswerSourceSchema) }),
  z.object({
    kind: z.literal('message-starter'),
    provider: AnswerSourceSchema,
    need: z.string(),
    location: z.string().optional(),
    timing: z.string().optional(),
  }),
  z.object({
    kind: z.literal('location-map'),
    label: z.string(),
    placeQuery: z.string(),
  }),
  z.object({
    kind: z.literal('prose'),
    block: z.enum(['summary']),
    text: z.string(),
  }),
  z.object({ kind: z.literal('what-to-do-now'), text: z.string() }),
  z.object({ kind: z.literal('agent-json'), url: z.string() }),
  z.object({ kind: z.literal('protected-by-ae') }),
])

export const AeAnswerArtifactsSchema = z.object({
  query: z.string(),
  oneLine: z.string(),
  providers: z.array(AnswerSourceSchema),
  summary: z.string(),
  whatToDoNow: z.string(),
  locationMap: z
    .object({
      label: z.string(),
      placeQuery: z.string(),
    })
    .optional(),
  agentJsonUrl: z.string(),
})

export type AnswerArtifact =
  | { kind: 'one-line'; text: string }
  | { kind: 'provider-cards'; providers: readonly AnswerSource[] }
  | {
      kind: 'provider-compare-table'
      providers: readonly AnswerSource[]
      fields?: readonly AnswerCompareField[]
    }
  | { kind: 'service-area-fit'; providers: readonly AnswerSource[]; locationLabel?: string }
  | { kind: 'next-step-menu'; providers: readonly AnswerSource[] }
  | { kind: 'confirmation-checklist'; title?: string; items: readonly string[] }
  | { kind: 'recovery-prompts'; title?: string; prompts: readonly { label: string; query: string }[] }
  | { kind: 'route-perspective'; providers: readonly AnswerSource[]; query?: string }
  | { kind: 'published-details-rail'; providers: readonly AnswerSource[] }
  | { kind: 'provider-tradeoff-list'; providers: readonly AnswerSource[] }
  | {
      kind: 'message-starter'
      provider: AnswerSource
      need: string
      location?: string
      timing?: string
    }
  | { kind: 'location-map'; label: string; placeQuery: string }
  | { kind: 'prose'; block: 'summary'; text: string }
  | { kind: 'what-to-do-now'; text: string }
  | { kind: 'agent-json'; url: string }
  | { kind: 'protected-by-ae' }

export type AnswerCompareField = z.infer<typeof AnswerCompareFieldSchema>

export type AeAnswerArtifacts = {
  query: string
  oneLine: string
  providers: readonly AnswerSource[]
  summary: string
  whatToDoNow: string
  locationMap?: {
    label: string
    placeQuery: string
  }
  agentJsonUrl: string
}
