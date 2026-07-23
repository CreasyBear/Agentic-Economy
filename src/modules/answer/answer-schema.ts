import { z } from 'zod'
import { publicOfferingDtoSchema } from '@/modules/registry/public'
import {
  COLD_START_WEBSITE_CLARIFICATION,
  COLD_START_WEBSITE_REFLECTION,
  ColdStartDecisionOutcomeValues,
  WebsiteDecisionConstraintIds,
  WebsiteFunctionChoiceValues,
  type AnswerSource,
  type ColdStartDecisionSupport,
  type OfferingAnswerSource,
} from './answer-synthesizer'

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
  freshnessLabel: z.string().optional(),
  photoUrl: z.string().optional(),
  publishedPhone: z.string().optional(),
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

export const OfferingAnswerSourceSchema = z.strictObject({
  sourceKind: z.literal('offering_v2'),
  citationIndex: z.number().int().positive(),
  business: z.strictObject({
    businessId: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    name: z.string().trim().min(1),
    category: z.string().trim().min(1),
    suburb: z.string().trim().min(1),
    stateTerritory: z.string().trim().min(1),
    publicUrl: z.string().trim().min(1),
    observedAt: z.number().finite().nonnegative(),
    disposition: z.enum(['current', 'partial', 'stale']),
    accessSummary: z.strictObject({
      humanRequest: z.boolean(),
      externalOperation: z.boolean(),
      aeSupportedAction: z.boolean(),
    }),
  }),
  offerings: z.array(publicOfferingDtoSchema).max(50),
  detailUrl: z.string().trim().min(1),
})

export const AnswerCompareFieldSchema = z.enum(['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep'])

const WebsiteDecisionConstraintIdSchema = z.enum(WebsiteDecisionConstraintIds)
const ColdStartDecisionSupportSchema: z.ZodType<ColdStartDecisionSupport> = z.discriminatedUnion('stage', [
  z.strictObject({
    kind: z.literal('cold_start_decision_support'),
    stage: z.literal('clarification'),
    reflection: z.literal(COLD_START_WEBSITE_REFLECTION),
    confirmedConstraintIds: z.array(WebsiteDecisionConstraintIdSchema),
    clarification: z.strictObject({
      id: z.literal('website:v1:function'),
      question: z.literal(COLD_START_WEBSITE_CLARIFICATION),
      choices: z.array(z.strictObject({
        id: z.enum(WebsiteFunctionChoiceValues),
        label: z.string(),
      })).length(3),
    }),
  }),
  z.strictObject({
    kind: z.literal('cold_start_decision_support'),
    stage: z.literal('result'),
    outcome: z.enum(ColdStartDecisionOutcomeValues),
    confirmedChoiceId: z.enum(WebsiteFunctionChoiceValues),
    reflection: z.literal(COLD_START_WEBSITE_REFLECTION),
    posture: z.string(),
    confirmedConstraintIds: z.array(WebsiteDecisionConstraintIdSchema),
    searchedSupplyStatement: z.string(),
    prices: z.array(z.strictObject({
      label: z.string(),
      value: z.string(),
    })),
    safeContinuations: z.array(z.union([
      z.strictObject({
        kind: z.literal('browse_registered_supply'),
        label: z.literal('Browse registered supply'),
      }),
      z.strictObject({
        kind: z.literal('relax_named_preference'),
        constraintId: z.enum([
          'website:v1:perth_local_preference',
          'website:v1:affordability_preference',
        ]),
        label: z.literal('I’m flexible'),
      }),
    ])).max(2),
  }),
])

export const AnswerArtifactSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('one-line'), text: z.string() }),
  z.object({ kind: z.literal('selected-provider'), provider: AnswerSourceSchema }),
  z.object({ kind: z.literal('provider-cards'), providers: z.array(AnswerSourceSchema) }),
  z.object({ kind: z.literal('offering-cards'), sources: z.array(OfferingAnswerSourceSchema).max(3) }),
  z.strictObject({ kind: z.literal('decision-support'), support: ColdStartDecisionSupportSchema }),
  z.object({
    kind: z.literal('provider-compare-table'),
    providers: z.array(AnswerSourceSchema),
    fields: z.array(AnswerCompareFieldSchema).optional(),
  }),
  z.object({
    kind: z.literal('recovery-prompts'),
    title: z.string().optional(),
    prompts: z.array(z.object({ label: z.string(), query: z.string() })).min(1).max(4),
    links: z.array(z.object({ label: z.string(), href: z.enum(['/claim', '/registry']) })).max(2).optional(),
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
  | { kind: 'selected-provider'; provider: AnswerSource }
  | { kind: 'provider-cards'; providers: readonly AnswerSource[] }
  | { kind: 'offering-cards'; sources: readonly OfferingAnswerSource[] }
  | { kind: 'decision-support'; support: ColdStartDecisionSupport }
  | {
      kind: 'provider-compare-table'
      providers: readonly AnswerSource[]
      fields?: readonly AnswerCompareField[]
    }
  | { kind: 'recovery-prompts'; title?: string; prompts: readonly { label: string; query: string }[]; links?: readonly { label: string; href: '/claim' | '/registry' }[] }
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
