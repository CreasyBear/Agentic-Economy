import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  isPublicOperationRef,
  type PublicOperationRef,
} from '@/modules/capability-supply/public'

export const MAX_ALLOCATION_EVIDENCE_OBSERVATIONS = 256

export type AllocationEvidenceObservation = Readonly<{
  demandSubjectIdentity: string
  gapIdentity: string
  searchIdentity: string
  allocationIdentity: string
  callIdentity: string
  operationRef: string
}>

export type AllocationEvidenceFact = Omit<AllocationEvidenceObservation, 'operationRef'> & Readonly<{
  operationRef: PublicOperationRef
  factIdentity: string
}>

export type AllocationEvidenceProjection = Readonly<{
  facts: readonly AllocationEvidenceFact[]
  distinctDemandCount: number
  repeatDemandCount: number
  deduplicatedReplayCount: number
  invalidObservationCount: number
  truncated: boolean
}>

/**
 * Projects bounded market evidence without inferring demand from Call replay.
 * Either a repeated Call identity or allocation identity is the same fact.
 */
export function projectAllocationEvidence(
  observations: readonly AllocationEvidenceObservation[],
): AllocationEvidenceProjection {
  const facts: AllocationEvidenceFact[] = []
  const callIdentities = new Set<string>()
  const allocationIdentities = new Set<string>()
  const gapIdentities = new Set<string>()
  const searchIdentities = new Set<string>()
  let deduplicatedReplayCount = 0
  let invalidObservationCount = 0
  const demandFactsBySubject = new Map<string, number>()

  for (const observation of observations.slice(0, MAX_ALLOCATION_EVIDENCE_OBSERVATIONS)) {
    const normalized = normalizeObservation(observation)
    if (normalized === undefined) {
      invalidObservationCount += 1
      continue
    }
    if (
      callIdentities.has(normalized.callIdentity) ||
      allocationIdentities.has(normalized.allocationIdentity) ||
      gapIdentities.has(normalized.gapIdentity) ||
      searchIdentities.has(normalized.searchIdentity)
    ) {
      deduplicatedReplayCount += 1
      continue
    }

    callIdentities.add(normalized.callIdentity)
    allocationIdentities.add(normalized.allocationIdentity)
    gapIdentities.add(normalized.gapIdentity)
    searchIdentities.add(normalized.searchIdentity)
    demandFactsBySubject.set(
      normalized.demandSubjectIdentity,
      (demandFactsBySubject.get(normalized.demandSubjectIdentity) ?? 0) + 1,
    )
    facts.push({
      ...normalized,
      factIdentity: canonicalDigest({
        kind: 'operation_allocation_evidence',
        schemaVersion: 1,
        ...normalized,
      }),
    })
  }

  return {
    facts,
    distinctDemandCount: facts.length,
    repeatDemandCount: [...demandFactsBySubject.values()]
      .reduce((count, subjectFacts) => count + Math.max(0, subjectFacts - 1), 0),
    deduplicatedReplayCount,
    invalidObservationCount,
    truncated: observations.length > MAX_ALLOCATION_EVIDENCE_OBSERVATIONS,
  }
}

function normalizeObservation(
  observation: AllocationEvidenceObservation,
): (Omit<AllocationEvidenceObservation, 'operationRef'> & { operationRef: PublicOperationRef }) | undefined {
  const normalized = {
    demandSubjectIdentity: observation.demandSubjectIdentity.trim(),
    gapIdentity: observation.gapIdentity.trim(),
    searchIdentity: observation.searchIdentity.trim(),
    allocationIdentity: observation.allocationIdentity.trim(),
    callIdentity: observation.callIdentity.trim(),
    operationRef: observation.operationRef.trim(),
  }
  if (
    !Object.values(normalized).every((value) => value.length > 0) ||
    !isPublicOperationRef(normalized.operationRef)
  ) {
    return undefined
  }
  return normalized
}
