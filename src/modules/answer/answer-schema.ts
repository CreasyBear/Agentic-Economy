import { z } from 'zod'
import type { ConsumerPlanResult } from '@/modules/customer-request/application/public'
import type { AnswerSource } from './answer-synthesizer'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'

const importedClaimSchema = z.object({
  businessName: z.string(),
  suburb: z.string(),
  phone: z.string().optional(),
  websiteUrl: z.string().optional(),
  serviceSummary: z.string().optional(),
  sourceUrl: z.string(),
})
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
  pricingSummary: z.string().optional(),
  availabilitySummary: z.string().optional(),
  nextStepLabel: z.string(),
  detailUrl: z.string(),
  inquiryUrl: z.string().optional(),
  publishedPhone: z.string().optional(),
  services: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      summary: z.string(),
      pricingSummary: z.string().optional(),
      availabilitySummary: z.string().optional(),
    }),
  ),
})

export const AnswerCompareFieldSchema = z.enum(['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep'])

const consumerNextActionSchema = z.strictObject({
  kind: z.enum(['inspect', 'compare', 'quote', 'start_request', 'revise', 'wait']),
  label: z.string(),
  href: z.string().optional(),
})
const consumerDecisionRecordSchema = z.strictObject({
  step: z.number().int().positive(),
  optionRef: z.string().optional(),
  action: z.enum(['inspected', 'compared', 'quoted', 'approved', 'started', 'completed', 'refused', 'needs_attention']),
  authority: z.enum(['inspect_only', 'approve_each', 'bounded_mandate', 'full_yolo']),
  summary: z.string(),
  observedAt: z.number(),
  evidenceRefs: z.array(z.string()),
  nextAction: consumerNextActionSchema,
})
const consumerPlanOptionSchema = z.strictObject({
  optionRef: z.string(),
  business: z.strictObject({ slug: z.string(), name: z.string(), location: z.string().optional() }),
  offering: z.strictObject({ name: z.string(), summary: z.string() }),
  price: z.union([
    z.strictObject({
      kind: z.literal('published'),
      published: z.strictObject({
        kind: z.enum(['fixed', 'from', 'range', 'quote_only']),
        currency: z.string(),
        amountMinor: z.number().optional(),
        maximumAmountMinor: z.number().optional(),
        unit: z.enum(['job', 'visit', 'hour', 'day', 'month', 'item', 'request']).optional(),
        taxTreatment: z.enum(['inclusive', 'exclusive', 'unknown']),
      }),
      summary: z.string().optional(),
    }),
    z.strictObject({ kind: z.literal('not_published'), summary: z.string().optional() }),
  ]),
  availability: z.union([
    z.strictObject({ kind: z.literal('published'), summary: z.string().optional(), validUntil: z.number().optional() }),
    z.strictObject({ kind: z.literal('needs_confirmation'), summary: z.string().optional() }),
  ]),
  nextAction: consumerNextActionSchema,
  evidence: z.strictObject({
    observedAt: z.number().optional(),
    source: z.enum(['business_published', 'ae_sandbox']),
  }),
})
const consumerPlanStepSchema = z.strictObject({
  step: z.number().int().positive(),
  title: z.string(),
  purpose: z.string(),
  state: z.enum(['frontier', 'queued', 'running', 'completed', 'needs_attention', 'blocked']),
  dependsOn: z.array(z.number().int().positive()),
  options: z.array(consumerPlanOptionSchema),
  nextAction: consumerNextActionSchema,
  record: consumerDecisionRecordSchema.optional(),
})
const consumerPlanResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('plan'),
    destination: z.strictObject({ label: z.string(), request: z.string() }),
    steps: z.array(consumerPlanStepSchema),
    frontier: z.strictObject({ step: z.number().int().positive(), availableActions: z.array(consumerNextActionSchema) }),
    decisions: z.array(consumerDecisionRecordSchema),
    authority: z.enum(['inspect_only', 'approve_each', 'bounded_mandate', 'full_yolo']),
  }),
  z.strictObject({
    kind: z.literal('needs_information'),
    prompt: z.string(),
    destination: z.strictObject({ label: z.string(), request: z.string() }),
    decisions: z.array(consumerDecisionRecordSchema),
  }),
  z.strictObject({
    kind: z.literal('unavailable'),
    reason: z.enum(['no_current_supply', 'preview_unavailable', 'options_changed', 'rate_limited']),
    destination: z.strictObject({ label: z.string(), request: z.string() }),
    decisions: z.array(consumerDecisionRecordSchema),
  }),
]) as z.ZodType<ConsumerPlanResult>

export const AnswerArtifactSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('consumer-plan'), plan: consumerPlanResultSchema }),
  z.object({ kind: z.literal('one-line'), text: z.string() }),
  z.object({ kind: z.literal('selected-provider'), provider: AnswerSourceSchema }),
  z.object({ kind: z.literal('provider-cards'), providers: z.array(AnswerSourceSchema) }),
  z.object({
    kind: z.literal('provider-compare-table'),
    providers: z.array(AnswerSourceSchema),
    fields: z.array(AnswerCompareFieldSchema).optional(),
  }),
  z.object({
    kind: z.literal('imported-claims'),
    claims: z.array(importedClaimSchema).max(5),
  }),
  z.object({
    kind: z.literal('recovery-prompts'),
    title: z.string().optional(),
    prompts: z.array(z.object({ label: z.string(), query: z.string() })).min(1).max(4),
    links: z.array(z.object({ label: z.string(), href: z.enum(['/claim']) })).max(2).optional(),
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
  | { kind: 'consumer-plan'; plan: ConsumerPlanResult }
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
