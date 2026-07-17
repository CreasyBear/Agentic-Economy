import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

type Money = Readonly<{ currency: string; amountMinor: number }>

export type AgentJourneyCohortInput = Readonly<{
  request: string
  customerAnswers: Readonly<Record<string, StableHashValue>>
  providerOrigins: readonly string[]
  maximumTotalCost: Money
  authorityScope: Readonly<{
    recipients: readonly string[]
    purposes: readonly string[]
    effects: readonly string[]
  }>
  providerOutputs: readonly Readonly<{ provider: string; digest: string }>[]
  resultUsabilityRubric: 'customer_result_and_schema_valid_evidence:v1'
}>

export function freezeAgentJourneyCohort(input: AgentJourneyCohortInput) {
  const normalized = {
    request: input.request,
    customerAnswers: cloneStable(input.customerAnswers),
    providerOrigins: [...input.providerOrigins].sort(),
    maximumTotalCost: { ...input.maximumTotalCost },
    authorityScope: {
      recipients: sortedUnique(input.authorityScope.recipients),
      purposes: sortedUnique(input.authorityScope.purposes),
      effects: sortedUnique(input.authorityScope.effects),
    },
    providerOutputs: input.providerOutputs.map((output) => ({ ...output }))
      .sort((left, right) => left.provider.localeCompare(right.provider) || left.digest.localeCompare(right.digest)),
    resultUsabilityRubric: input.resultUsabilityRubric,
  } satisfies StableHashValue
  return deepFreeze({
    format: 'ae.agent-journey-cohort:v1' as const,
    input: normalized,
    digest: canonicalDigest(normalized),
  })
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort()
}

function cloneStable(value: StableHashValue): StableHashValue {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(cloneStable)
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, cloneStable(nested)]))
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value)) deepFreeze(nested)
  }
  return value
}
