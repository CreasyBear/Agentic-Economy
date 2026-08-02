import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import type { StableHashValue } from '@/modules/common/stable-hash'

type Money = Readonly<{ currency: string; amountMinor: number }>

const agentJourneyCohortInputSchema = z.strictObject({
  request: z.string().min(1),
  customerAnswers: z.record(z.string(), z.json()),
  directAnswers: z.record(z.string(), z.json()).default({}),
  providerOrigins: z.array(z.url()).min(2),
  maximumTotalCost: z.strictObject({
    currency: z.string().min(1),
    amountMinor: z.number().int().nonnegative(),
  }),
  authorityScope: z.strictObject({
    recipients: z.array(z.string().min(1)).min(1),
    purposes: z.array(z.string().min(1)).min(1),
    effects: z.array(z.string().min(1)).min(1),
  }),
  providerInputs: z.array(z.strictObject({
    provider: z.string().min(1),
    directFields: z.array(z.string().min(1)).min(1),
    aeFieldRefs: z.array(z.string().min(1)).min(1),
  })).min(2),
  providerOutputs: z.array(z.strictObject({
    provider: z.string().min(1),
    endpoint: z.url(),
    digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  })).min(2),
  resultUsabilityRubric: z.literal('customer_result_and_schema_valid_evidence:v1'),
})

export type AgentJourneyCohortInput = Readonly<{
  request: string
  customerAnswers: Readonly<Record<string, StableHashValue>>
  directAnswers?: Readonly<Record<string, StableHashValue>>
  providerOrigins: readonly string[]
  maximumTotalCost: Money
  authorityScope: Readonly<{
    recipients: readonly string[]
    purposes: readonly string[]
    effects: readonly string[]
  }>
  providerInputs: readonly Readonly<{
    provider: string
    directFields: readonly string[]
    aeFieldRefs: readonly string[]
  }>[]
  providerOutputs: readonly Readonly<{ provider: string; endpoint: string; digest: string }>[]
  resultUsabilityRubric: 'customer_result_and_schema_valid_evidence:v1'
}>

export function parseAgentJourneyCohortInput(value: unknown): AgentJourneyCohortInput {
  return agentJourneyCohortInputSchema.parse(value) as AgentJourneyCohortInput
}

export function freezeAgentJourneyCohort(input: AgentJourneyCohortInput) {
  const normalized = {
    request: input.request,
    customerAnswers: structuredClone(input.customerAnswers),
    directAnswers: structuredClone(input.directAnswers ?? {}),
    providerOrigins: [...input.providerOrigins].sort(),
    maximumTotalCost: { ...input.maximumTotalCost },
    authorityScope: {
      recipients: uniqueSorted(input.authorityScope.recipients),
      purposes: uniqueSorted(input.authorityScope.purposes),
      effects: uniqueSorted(input.authorityScope.effects),
    },
    providerInputs: input.providerInputs.map(({ provider, directFields, aeFieldRefs }) => ({
      provider,
      directFields: uniqueSorted(directFields),
      aeFieldRefs: uniqueSorted(aeFieldRefs),
    })).sort((left, right) => left.provider.localeCompare(right.provider)),
    providerOutputs: input.providerOutputs.map((output) => ({ ...output }))
      .sort((left, right) => left.provider.localeCompare(right.provider)
        || left.endpoint.localeCompare(right.endpoint)
        || left.digest.localeCompare(right.digest)),
    resultUsabilityRubric: input.resultUsabilityRubric,
  } satisfies StableHashValue
  return deepFreeze({
    format: 'ae.agent-journey-cohort:v1' as const,
    input: normalized,
    digest: canonicalDigest(normalized),
  })
}

export type FrozenAgentJourneyCohort = ReturnType<typeof freezeAgentJourneyCohort>

