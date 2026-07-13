import type { PreparedRouteCandidateSet } from './preparation'
import type { CustomerOption, CustomerOptionSet } from './agent-contract'

type CoverageStatus = PreparedRouteCandidateSet['attempts'][number]['status']

export function projectCustomerOptionSet(candidateSet: PreparedRouteCandidateSet): CustomerOptionSet {
  const optionCount = candidateSet.candidates.length
  const cardinality = optionCount === 0 ? 'none' : optionCount === 1 ? 'single' : 'multiple'
  const counts = coverageCounts(candidateSet.attempts.map((attempt) => attempt.status))
  const commercialInfluence = optionCommercialInfluence(candidateSet.candidates)
  return Object.freeze({
    cardinality,
    optionCount,
    ordering: Object.freeze(projectOrdering(candidateSet, cardinality, commercialInfluence)),
    coverage: Object.freeze({
      evaluated: Math.max(candidateSet.attempts.length, optionCount),
      ...counts,
      optionsReceived: Math.max(counts.optionsReceived, optionCount),
      businesses: Object.freeze(candidateSet.attempts.map((attempt) => Object.freeze({
        name: attempt.business.name, status: attempt.status, explanation: attempt.explanation,
      }))),
    }),
    options: Object.freeze(candidateSet.candidates.map((candidate) => {
      const { inspectionRef: _inspectionRef, issuedAt, commercialInfluence: candidateInfluence, ...option } = candidate
      return Object.freeze({
        ...option,
        provenance: Object.freeze({
          kind: 'provider_assertion' as const,
          ...(issuedAt === undefined ? {} : { observedAt: issuedAt }),
          validUntil: candidate.expiresAt,
        }),
        commercialInfluence: Object.freeze(candidateInfluence ?? { status: 'unknown' as const }),
      })
    })),
  })
}

function projectOrdering(
  candidateSet: PreparedRouteCandidateSet,
  cardinality: CustomerOptionSet['cardinality'],
  commercialInfluence: 'none' | 'disclosed' | 'unknown',
): CustomerOptionSet['ordering'] {
  if (cardinality !== 'multiple') return { kind: 'not_applicable', commercialInfluence }
  const preference = candidateSet.decisionPreference
  if (preference === undefined || commercialInfluence === 'unknown'
    || candidateSet.candidates.some((candidate) => candidate.commercialInfluence?.status === 'disclosed'
      && (candidate.commercialInfluence.influencesEligibility
        || candidate.commercialInfluence.influencesInclusion
        || candidate.commercialInfluence.influencesOrder))
    || !hasComparableShape(candidateSet.candidates)) return { kind: 'unranked', commercialInfluence }
  const ordered = [...candidateSet.candidates].sort((left, right) => left.maximumCost.amountMinor - right.maximumCost.amountMinor)
  const selected = ordered[0]
  const next = ordered[1]
  if (selected === undefined || next === undefined
    || selected.maximumCost.amountMinor === next.maximumCost.amountMinor) return { kind: 'unranked', commercialInfluence }
  const currency = selected.maximumCost.currency
  const difference = next.maximumCost.amountMinor - selected.maximumCost.amountMinor
  const tradeoffs = comparableOutputTradeoffs(selected, ordered.slice(1))
  return {
    kind: 'recommended', commercialInfluence, objective: preference.objective,
    optionRef: selected.optionRef, evidenceRef: preference.evidenceRef,
    reasons: Object.freeze([
      `Lowest provider maximum at ${formatMinor(currency, selected.maximumCost.amountMinor)}.`,
      `${formatMinor(currency, difference)} below the next-lowest provider maximum.`,
    ]),
    tradeoffs: Object.freeze(tradeoffs.length === 0
      ? ['No differing registered comparison outputs were reported.']
      : tradeoffs),
  }
}

function hasComparableShape(candidates: PreparedRouteCandidateSet['candidates']): boolean {
  const first = candidates[0]
  if (first === undefined) return false
  const currency = first.maximumCost.currency
  const signature = outputSignature(first)
  return candidates.every((candidate) => validNormalizedPrice(candidate)
    && candidate.expectedCost.currency === currency
    && candidate.maximumCost.currency === currency
    && outputSignature(candidate) === signature)
}

function validNormalizedPrice(candidate: PreparedRouteCandidateSet['candidates'][number]): boolean {
  const expected = candidate.expectedCost.amountMinor
  const maximum = candidate.maximumCost.amountMinor
  const componentTotal = candidate.priceComponents.reduce((total, component) => total + component.amountMinor, 0)
  return Number.isSafeInteger(expected) && expected >= 0
    && Number.isSafeInteger(maximum) && maximum >= expected
    && candidate.priceComponents.every((component) => Number.isSafeInteger(component.amountMinor) && component.amountMinor >= 0)
    && Number.isSafeInteger(componentTotal) && componentTotal <= maximum
    && new Set(candidate.comparableOutputs.map((output) => output.label)).size === candidate.comparableOutputs.length
}

function outputSignature(candidate: PreparedRouteCandidateSet['candidates'][number]): string {
  return JSON.stringify(candidate.comparableOutputs.map((output) => ({ label: output.label, type: typeof output.value }))
    .sort((left, right) => left.label.localeCompare(right.label)))
}

function comparableOutputTradeoffs(
  selected: PreparedRouteCandidateSet['candidates'][number],
  alternatives: readonly PreparedRouteCandidateSet['candidates'][number][],
): string[] {
  const selectedOutputs = new Map(selected.comparableOutputs.map((output) => [output.label, output.value]))
  return alternatives.flatMap((alternative) => alternative.comparableOutputs.flatMap((output) => {
    const selectedValue = selectedOutputs.get(output.label)
    return selectedValue === output.value ? [] : [`${output.label}: ${String(selectedValue)} versus ${String(output.value)} from ${alternative.business.name}.`]
  }))
}

function formatMinor(currency: string, amountMinor: number): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`
}

function optionCommercialInfluence(candidates: PreparedRouteCandidateSet['candidates']): 'none' | 'disclosed' | 'unknown' {
  if (candidates.length === 0) return 'unknown'
  const statuses = candidates.map((candidate) => candidate.commercialInfluence?.status ?? 'unknown')
  if (statuses.includes('unknown')) return 'unknown'
  return statuses.includes('disclosed') ? 'disclosed' : 'none'
}

function coverageCounts(statuses: readonly CoverageStatus[]): Readonly<{
  optionsReceived: number
  unavailable: number
  pending: number
  uncertain: number
}> {
  return Object.freeze({
    optionsReceived: statuses.filter((status) => status === 'option_received').length,
    unavailable: statuses.filter((status) => status === 'unavailable').length,
    pending: statuses.filter((status) => status === 'not_contacted' || status === 'contact_pending' || status === 'contacted').length,
    uncertain: statuses.filter((status) => status === 'uncertain').length,
  })
}
