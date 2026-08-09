import { z } from 'zod'
import type { AnswerSource } from './answer-synthesizer'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'

export const WebDiscoveryClaimSchema = z.strictObject({
  businessName: z.string(),
  suburb: z.string(),
  phone: z.string().exactOptional(),
  websiteUrl: z.string().exactOptional(),
  serviceSummary: z.string().exactOptional(),
  sourceUrl: z.string(),
})
const importedClaimSchema = WebDiscoveryClaimSchema
export const AnswerArtifactKindValues = [
  'one-line',
  'selected-provider',
  'provider-cards',
  'provider-compare-table',
  'imported-claims',
  'recovery-prompts',
  'location-map',
  'prose',
  'what-to-do-now',
  'agent-json',
  'protected-by-ae',
] as const
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
  freshnessLabel: z.string().exactOptional(),
  photoUrl: z.string().exactOptional(),
  pricingSummary: z.string().exactOptional(),
  availabilitySummary: z.string().exactOptional(),
  nextStepLabel: z.string(),
  detailUrl: z.string(),
  inquiryUrl: z.string().exactOptional(),
  publishedPhone: z.string().exactOptional(),
  services: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      summary: z.string(),
      pricingSummary: z.string().exactOptional(),
      availabilitySummary: z.string().exactOptional(),
    }),
  ),
})

export const AnswerCompareFieldSchema = z.enum(['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep'])

export const AnswerArtifactSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one-line'), text: z.string() }),
  z.object({ kind: z.literal('selected-provider'), provider: AnswerSourceSchema }),
  z.object({ kind: z.literal('provider-cards'), providers: z.array(AnswerSourceSchema) }),
  z.object({
    kind: z.literal('provider-compare-table'),
    providers: z.array(AnswerSourceSchema),
    fields: z.array(AnswerCompareFieldSchema).exactOptional(),
  }),
  z.object({
    kind: z.literal('imported-claims'),
    claims: z.array(importedClaimSchema).max(5),
  }),
  z.object({
    kind: z.literal('recovery-prompts'),
    title: z.string().exactOptional(),
    prompts: z.array(z.object({ label: z.string(), query: z.string() })).min(1).max(4),
    links: z.array(z.object({ label: z.string(), href: z.enum(['/claim']) })).max(2).exactOptional(),
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
    .exactOptional(),
  agentJsonUrl: z.string(),
})

export type AnswerArtifact =
  | { kind: 'one-line'; text: string }
  | { kind: 'selected-provider'; provider: AnswerSource }
  | { kind: 'provider-cards'; providers: readonly AnswerSource[] }
  | { kind: 'imported-claims'; claims: readonly WebDiscoveryClaim[] }
  | {
      kind: 'provider-compare-table'
      providers: readonly AnswerSource[]
      fields?: readonly AnswerCompareField[]
    }
  | { kind: 'recovery-prompts'; title?: string; prompts: readonly { label: string; query: string }[]; links?: readonly { label: string; href: '/claim' }[] }
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
