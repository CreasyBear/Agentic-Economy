import type { PreparedRouteCandidateSet } from './preparation'

type PreparedOption = PreparedRouteCandidateSet['candidates'][number]
type CoverageStatus = PreparedRouteCandidateSet['attempts'][number]['status']

export type CustomerOption = Readonly<Omit<PreparedOption, 'inspectionRef' | 'issuedAt' | 'commercialInfluence'> & {
  provenance: Readonly<{
    kind: 'provider_assertion'
    observedAt?: number
    validUntil: number
  }>
  commercialInfluence: NonNullable<PreparedOption['commercialInfluence']>
}>

export type CustomerOptionSet = Readonly<{
  cardinality: 'none' | 'single' | 'multiple'
  optionCount: number
  ordering: Readonly<
    | { kind: 'not_applicable'; commercialInfluence: 'none' | 'disclosed' | 'unknown' }
    | { kind: 'unranked'; commercialInfluence: 'none' | 'disclosed' | 'unknown' }
  >
  coverage: Readonly<{
    evaluated: number
    optionsReceived: number
    unavailable: number
    pending: number
    uncertain: number
    businesses: readonly Readonly<{ name: string; status: CoverageStatus; explanation: string }>[]
  }>
  options: readonly CustomerOption[]
}>

export function projectCustomerOptionSet(candidateSet: PreparedRouteCandidateSet): CustomerOptionSet {
  const optionCount = candidateSet.candidates.length
  const cardinality = optionCount === 0 ? 'none' : optionCount === 1 ? 'single' : 'multiple'
  const counts = coverageCounts(candidateSet.attempts.map((attempt) => attempt.status))
  const commercialInfluence = optionCommercialInfluence(candidateSet.candidates)
  return Object.freeze({
    cardinality,
    optionCount,
    ordering: Object.freeze(cardinality === 'multiple'
      ? { kind: 'unranked' as const, commercialInfluence }
      : { kind: 'not_applicable' as const, commercialInfluence }),
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
