import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  freezeAgentJourneyCohort,
  type AgentJourneyCohortInput,
} from '@/modules/customer-request/agent-journey-cohort'

const moneySchema = z.strictObject({ currency: z.string().min(1), amountMinor: z.number().int().nonnegative() })
const jsonObjectSchema = z.record(z.string(), z.unknown())
const providerDiscoverySchema = z.strictObject({
  format: z.literal('ae.sandbox-capability-provider:v1'),
  supplyClass: z.literal('labelled_sandbox'),
  sandbox: z.literal(true),
  business: z.strictObject({ slug: z.string().min(1), name: z.string().min(1) }),
  operation: z.strictObject({
    method: z.literal('POST'), endpoint: z.url(),
    authentication: z.strictObject({ scheme: z.literal('bearer') }),
    maximumCost: moneySchema,
    inputSchema: z.looseObject({ required: z.array(z.string()).default([]) }),
    outputSchema: z.looseObject({ required: z.array(z.string()).default([]) }),
  }),
  boundaries: z.array(z.string()),
})

const FROZEN_POLICY = Object.freeze({
  version: 'direct-provider-schema-chain:v1',
  initialField: 'request',
  discoveryMethod: 'GET',
  invocationMethod: 'POST',
  retry: 'none',
  recovery: 'unsupported',
})

type Money = Readonly<z.infer<typeof moneySchema>>
type Discovery = Readonly<z.infer<typeof providerDiscoverySchema>>

export type FrozenDirectAgentBaselineInput = Readonly<{
  job: string
  providerOrigins: readonly string[]
  credential: string
  agent: Readonly<{ name: string; version: string }>
  predeclaredGain: string
  hardConstraints: Readonly<{ maximumTotalCost?: Money }>
  cohort?: AgentJourneyCohortInput
  fetch?: typeof globalThis.fetch
  now?: () => number
}>

export async function runFrozenDirectAgentBaseline(input: FrozenDirectAgentBaselineInput) {
  const startedAt = (input.now ?? Date.now)()
  const cohort = input.cohort === undefined ? undefined : freezeAgentJourneyCohort(input.cohort)
  if (cohort !== undefined && !cohortMatchesDirectInput(cohort.input, input)) {
    throw new Error('direct_baseline_cohort_conditions_mismatch')
  }
  const discoveryResults = await Promise.all(input.providerOrigins.map(async (origin) => (
    await discoverProvider(origin, input.fetch ?? fetch)
  )))
  const discoveries = discoveryResults.flatMap((result) => result === undefined ? [] : [result])
  if (discoveries.length !== input.providerOrigins.length) {
    return blockedProof(input, startedAt, discoveries.length, 'provider_discovery_unavailable', {
      state: 'ineligible' as const,
      reason: 'provider_discovery_missing_cannot_count_as_ae_gain' as const,
    })
  }
  if (cohort !== undefined && !cohortProviderContractsMatch(cohort.input, discoveries)) {
    return blockedProof(input, startedAt, discoveries.length, 'cohort_provider_inputs_mismatch', {
      state: 'ineligible' as const,
      reason: 'cohort_conditions_not_equal' as const,
    }, discoveries)
  }

  const total = totalMaximumCost(discoveries)
  const constraint = evaluateMaximumCostConstraint(input.hardConstraints.maximumTotalCost, total)
  if (constraint.state === 'violated') {
    return blockedProof(input, startedAt, discoveries.length, 'hard_constraint_violated', {
      state: 'eligible' as const,
    }, discoveries, total, constraint)
  }

  const customerAnswers = cohort?.input.customerAnswers ?? {}
  const directAnswers = cohort?.input.directAnswers ?? {}
  const available: Record<string, unknown> = { request: input.job, ...customerAnswers, ...directAnswers }
  const remaining = [...discoveries]
  const invocations: Array<Readonly<{
    business: string
    endpoint: string
    inputFields: readonly string[]
    output: Readonly<Record<string, unknown>>
    inputDigest: string
    outputDigest: string
    withheldCustomerFields: readonly string[]
    receipt?: string
  }>> = []
  let schemaMappings = 0
  while (remaining.length > 0) {
    const index = remaining.findIndex(({ operation }) => (
      operation.inputSchema.required.every((field) => field in available)
    ))
    if (index < 0) {
      return blockedProof(input, startedAt, discoveries.length, 'provider_chain_unresolved', {
        state: 'eligible' as const,
      }, discoveries, total, constraint, invocations.length, schemaMappings, invocations)
    }
    const [provider] = remaining.splice(index, 1)
    if (provider === undefined) throw new Error('direct_baseline_provider_missing')
    const body = Object.fromEntries(provider.operation.inputSchema.required.map((field) => [field, available[field]]))
    schemaMappings += provider.operation.inputSchema.required.filter((field) => field !== 'request').length
    const response = await (input.fetch ?? fetch)(provider.operation.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      return blockedProof(input, startedAt, discoveries.length, 'provider_invocation_failed', {
        state: 'eligible' as const,
      }, discoveries, total, constraint, invocations.length + 1, schemaMappings, invocations)
    }
    const output = jsonObjectSchema.parse(await response.json())
    if (!provider.operation.outputSchema.required.every((field) => field in output)) {
      return blockedProof(input, startedAt, discoveries.length, 'provider_result_invalid', {
        state: 'eligible' as const,
      }, discoveries, total, constraint, invocations.length + 1, schemaMappings, invocations)
    }
    Object.assign(available, output)
    const sentFieldSet = new Set(provider.operation.inputSchema.required)
    const inputDigest = canonicalDigest(body as StableHashValue)
    const outputDigest = canonicalDigest(output as StableHashValue)
    const declaredOutput = cohort?.input.providerOutputs.find(
      ({ provider: declaredProvider }) => declaredProvider === provider.business.name,
    )
    if (declaredOutput !== undefined && declaredOutput.digest !== outputDigest) {
      return blockedProof(input, startedAt, discoveries.length, 'cohort_provider_outputs_mismatch', {
        state: 'ineligible' as const,
        reason: 'cohort_conditions_not_equal' as const,
      }, discoveries, total, constraint, invocations.length + 1, schemaMappings, invocations)
    }
    const receipt = response.headers.get('Provider-Receipt') ?? undefined
    invocations.push({
      business: provider.business.name, endpoint: provider.operation.endpoint,
      inputFields: provider.operation.inputSchema.required, output, inputDigest, outputDigest,
      withheldCustomerFields: Object.keys(customerAnswers)
        .filter((field) => !sentFieldSet.has(field))
        .sort(),
      ...(receipt === undefined ? {} : { receipt }),
    })
  }

  const result = invocations.at(-1)?.output
  if (result === undefined) {
    return blockedProof(input, startedAt, discoveries.length, 'provider_chain_empty', {
      state: 'eligible' as const,
    }, discoveries, total, constraint, 0, schemaMappings)
  }
  return {
    ...proofBase(input, startedAt),
    completion: { state: 'completed' as const, providerCount: invocations.length },
    comparisonEligibility: { state: 'eligible' as const },
    integrationBurden: burden(input.providerOrigins.length, discoveries, invocations.length, schemaMappings),
    turns: { discovery: input.providerOrigins.length, invocation: invocations.length, total: input.providerOrigins.length + invocations.length },
    elapsedMs: (input.now ?? Date.now)() - startedAt,
    hardConstraintAccuracy: constraint,
    totalCostAccuracy: { state: 'exact' as const, total },
    recovery: { state: 'unsupported' as const, reason: 'direct_calls_have_no_durable_request_to_resume' as const },
    resultUsability: { state: 'usable' as const, result },
    disclosureLedger: invocations.map((invocation) => ({
      business: invocation.business,
      sentFields: invocation.inputFields,
      withheldCustomerFields: invocation.withheldCustomerFields,
      inputDigest: invocation.inputDigest,
      outputDigest: invocation.outputDigest,
    })),
    invocations,
    claimBoundary: 'labelled_sandbox_direct_baseline_not_real_supply_or_customer_value' as const,
  }
}

async function discoverProvider(origin: string, fetchImpl: typeof globalThis.fetch): Promise<Discovery | undefined> {
  const url = safePublicUrl(origin)
  if (url === undefined) return undefined
  const response = await fetchImpl(url.href, { method: 'GET', headers: { Accept: 'application/json' } })
  if (!response.ok) return undefined
  const parsed = providerDiscoverySchema.safeParse(await response.json())
  if (!parsed.success || parsed.data.operation.endpoint !== url.href) return undefined
  return parsed.data
}

function safePublicUrl(value: string): URL | undefined {
  try {
    const url = new URL(value)
    const loopbackHttp = url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
    if ((url.protocol !== 'https:' && !loopbackHttp)
      || url.username !== '' || url.password !== '' || url.hash !== '') return undefined
    return url
  } catch {
    return undefined
  }
}

function totalMaximumCost(discoveries: readonly Discovery[]): Money {
  const currency = discoveries[0]?.operation.maximumCost.currency ?? 'AUD'
  if (discoveries.some(({ operation }) => operation.maximumCost.currency !== currency)) {
    throw new Error('direct_baseline_cost_currency_mismatch')
  }
  return {
    currency,
    amountMinor: discoveries.reduce((sum, { operation }) => sum + operation.maximumCost.amountMinor, 0),
  }
}

function evaluateMaximumCostConstraint(maximum: Money | undefined, total: Money) {
  if (maximum === undefined) return { state: 'not_declared' as const }
  if (maximum.currency !== total.currency) return { state: 'violated' as const, reason: 'currency_mismatch' as const }
  return total.amountMinor <= maximum.amountMinor
    ? { state: 'satisfied' as const }
    : { state: 'violated' as const, reason: 'maximum_total_cost_exceeded' as const }
}

function burden(
  originsProvided: number,
  discoveries: readonly Discovery[],
  invocationCalls: number,
  schemaMappings: number,
) {
  return {
    originsProvided, discoveryCalls: originsProvided, invocationCalls, schemaMappings,
    authenticationSchemes: [...new Set(discoveries.map(({ operation }) => operation.authentication.scheme))],
    boundaryStatements: discoveries.reduce((sum, provider) => sum + provider.boundaries.length, 0),
  }
}

function proofBase(input: FrozenDirectAgentBaselineInput, startedAt: number) {
  const cohort = input.cohort === undefined ? undefined : freezeAgentJourneyCohort(input.cohort)
  return {
    kind: 'frozen_direct_agent_baseline' as const,
    agent: input.agent,
    jobDigest: canonicalDigest(input.job),
    predeclaredGain: input.predeclaredGain,
    policy: { ...FROZEN_POLICY, digest: canonicalDigest(FROZEN_POLICY) },
    ...(cohort === undefined ? {} : { cohortInputDigest: cohort.digest }),
    startedAt,
  }
}

function blockedProof(
  input: FrozenDirectAgentBaselineInput,
  startedAt: number,
  providerCount: number,
  reason: 'provider_discovery_unavailable' | 'hard_constraint_violated' | 'provider_chain_unresolved'
    | 'provider_invocation_failed' | 'provider_result_invalid' | 'provider_chain_empty'
    | 'cohort_provider_inputs_mismatch' | 'cohort_provider_outputs_mismatch',
  comparisonEligibility: Readonly<{ state: 'eligible' } | {
    state: 'ineligible'
    reason: 'provider_discovery_missing_cannot_count_as_ae_gain' | 'cohort_conditions_not_equal'
  }>,
  discoveries: readonly Discovery[] = [],
  total: Money = { currency: 'AUD', amountMinor: 0 },
  constraint: ReturnType<typeof evaluateMaximumCostConstraint> = { state: 'not_declared' },
  invocationCalls = 0,
  schemaMappings = 0,
  invocations: readonly Readonly<{
    business: string
    endpoint: string
    inputFields: readonly string[]
    output: Readonly<Record<string, unknown>>
    inputDigest: string
    outputDigest: string
    withheldCustomerFields: readonly string[]
    receipt?: string
  }>[] = [],
) {
  const partialResult = invocations.at(-1)?.output
  return {
    ...proofBase(input, startedAt),
    completion: { state: 'blocked' as const, reason, providerCount },
    comparisonEligibility,
    integrationBurden: burden(input.providerOrigins.length, discoveries, invocationCalls, schemaMappings),
    turns: {
      discovery: input.providerOrigins.length, invocation: invocationCalls,
      total: input.providerOrigins.length + invocationCalls,
    },
    elapsedMs: (input.now ?? Date.now)() - startedAt,
    hardConstraintAccuracy: constraint,
    totalCostAccuracy: { state: discoveries.length === 0 ? 'unavailable' as const : 'exact' as const, total },
    recovery: { state: 'unsupported' as const, reason: 'direct_calls_have_no_durable_request_to_resume' as const },
    resultUsability: partialResult === undefined
      ? { state: 'unusable' as const, reason }
      : { state: 'partial' as const, reason, result: partialResult },
    invocations,
    disclosureLedger: invocations.map((invocation) => ({
      business: invocation.business,
      sentFields: invocation.inputFields,
      withheldCustomerFields: invocation.withheldCustomerFields,
      inputDigest: invocation.inputDigest,
      outputDigest: invocation.outputDigest,
    })),
    claimBoundary: 'labelled_sandbox_direct_baseline_not_real_supply_or_customer_value' as const,
  }
}

function cohortMatchesDirectInput(
  cohort: ReturnType<typeof freezeAgentJourneyCohort>['input'],
  input: FrozenDirectAgentBaselineInput,
): boolean {
  const maximum = input.hardConstraints.maximumTotalCost
  return cohort.request === input.job
    && canonicalDigest(cohort.providerOrigins) === canonicalDigest([...input.providerOrigins].sort())
    && maximum !== undefined
    && canonicalDigest(cohort.maximumTotalCost) === canonicalDigest(maximum)
}

function cohortProviderContractsMatch(
  cohort: ReturnType<typeof freezeAgentJourneyCohort>['input'],
  discoveries: readonly Discovery[],
): boolean {
  const discoveredInputs = discoveries.map(({ business, operation }) => ({
    provider: business.name,
    directFields: [...operation.inputSchema.required].sort(),
    aeFieldRefs: cohort.providerInputs.find(({ provider }) => provider === business.name)?.aeFieldRefs ?? [],
  })).sort((left, right) => left.provider.localeCompare(right.provider))
  const declaredOutputs = cohort.providerOutputs.map(({ provider, endpoint }) => ({ provider, endpoint }))
    .sort((left, right) => left.provider.localeCompare(right.provider))
  const discoveredProviders = discoveries.map(({ business, operation }) => ({
    provider: business.name,
    endpoint: operation.endpoint,
  })).sort((left, right) => left.provider.localeCompare(right.provider))
  return canonicalDigest(discoveredInputs) === canonicalDigest(cohort.providerInputs)
    && canonicalDigest(declaredOutputs) === canonicalDigest(discoveredProviders)
}
