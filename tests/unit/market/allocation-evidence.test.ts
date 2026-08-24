import { describe, expect, it } from 'vitest'

import {
  projectAllocationEvidence,
  type AllocationEvidenceObservation,
} from '@/modules/market/allocation-evidence'

const firstAllocation: AllocationEvidenceObservation = {
  demandSubjectIdentity: 'subject:pseudonymous:alpha',
  gapIdentity: 'gap:tax-record-lookup',
  searchIdentity: 'search:tax-record-lookup:1',
  allocationIdentity: 'allocation:tax-record-lookup:1',
  callIdentity: 'call:01J-FIRST',
  operationRef: `operation:v1:${'a'.repeat(64)}`,
}

describe('Operation allocation evidence', () => {
  it('deduplicates same-Call and same-allocation replay without repeat-demand evidence', () => {
    const projection = projectAllocationEvidence([
      firstAllocation,
      firstAllocation,
      { ...firstAllocation },
    ])

    expect(projection).toMatchObject({
      distinctDemandCount: 1,
      repeatDemandCount: 0,
      deduplicatedReplayCount: 2,
      invalidObservationCount: 0,
      truncated: false,
    })
    expect(projection.facts).toHaveLength(1)
    expect(projection.facts[0]).toMatchObject(firstAllocation)
  })

  it('projects a second distinct gap, search, allocation, and Call as a second fact', () => {
    const secondAllocation: AllocationEvidenceObservation = {
      gapIdentity: 'gap:foreign-company-record',
      demandSubjectIdentity: firstAllocation.demandSubjectIdentity,
      searchIdentity: 'search:foreign-company-record:1',
      allocationIdentity: 'allocation:foreign-company-record:1',
      callIdentity: 'call:01J-SECOND',
      operationRef: `operation:v1:${'b'.repeat(64)}`,
    }
    const projection = projectAllocationEvidence([
      firstAllocation,
      firstAllocation,
      secondAllocation,
    ])

    expect(projection).toMatchObject({
      distinctDemandCount: 2,
      repeatDemandCount: 1,
      deduplicatedReplayCount: 1,
    })
    expect(projection.facts).toHaveLength(2)
    expect(new Set(projection.facts.map((fact) => fact.factIdentity)).size).toBe(2)
    expect(projection.facts.map(({ demandSubjectIdentity, gapIdentity, searchIdentity, allocationIdentity, callIdentity }) => ({
      demandSubjectIdentity,
      gapIdentity,
      searchIdentity,
      allocationIdentity,
      callIdentity,
    }))).toEqual([
      {
        demandSubjectIdentity: firstAllocation.demandSubjectIdentity,
        gapIdentity: firstAllocation.gapIdentity,
        searchIdentity: firstAllocation.searchIdentity,
        allocationIdentity: firstAllocation.allocationIdentity,
        callIdentity: firstAllocation.callIdentity,
      },
      {
        demandSubjectIdentity: secondAllocation.demandSubjectIdentity,
        gapIdentity: secondAllocation.gapIdentity,
        searchIdentity: secondAllocation.searchIdentity,
        allocationIdentity: secondAllocation.allocationIdentity,
        callIdentity: secondAllocation.callIdentity,
      },
    ])
  })

  it('does not infer repeat demand across unrelated evidence subjects', () => {
    const projection = projectAllocationEvidence([
      firstAllocation,
      {
        ...firstAllocation,
        demandSubjectIdentity: 'subject:pseudonymous:beta',
        gapIdentity: 'gap:unrelated',
        searchIdentity: 'search:unrelated',
        allocationIdentity: 'allocation:unrelated',
        callIdentity: 'call:unrelated',
        operationRef: `operation:v1:${'b'.repeat(64)}`,
      },
    ])

    expect(projection.facts).toHaveLength(2)
    expect(projection.repeatDemandCount).toBe(0)
  })

  it('fails closed on malformed current Operation references', () => {
    const projection = projectAllocationEvidence([
      { ...firstAllocation, operationRef: 'operation:v1:not-a-digest' },
    ])

    expect(projection.facts).toEqual([])
    expect(projection.invalidObservationCount).toBe(1)
  })

  it('does not turn a new label around the same Call or allocation into demand', () => {
    const projection = projectAllocationEvidence([
      firstAllocation,
      { ...firstAllocation, gapIdentity: 'gap:renamed', searchIdentity: 'search:renamed' },
      { ...firstAllocation, callIdentity: 'call:renamed' },
    ])

    expect(projection.facts).toHaveLength(1)
    expect(projection.repeatDemandCount).toBe(0)
    expect(projection.deduplicatedReplayCount).toBe(2)
  })

  it('does not count a fresh Call/allocation when the gap or search identity is reused', () => {
    const projection = projectAllocationEvidence([
      firstAllocation,
      {
        ...firstAllocation,
        allocationIdentity: 'allocation:fresh-with-same-gap',
        callIdentity: 'call:fresh-with-same-gap',
        searchIdentity: 'search:fresh-with-same-gap',
      },
      {
        ...firstAllocation,
        gapIdentity: 'gap:fresh-with-same-search',
        allocationIdentity: 'allocation:fresh-with-same-search',
        callIdentity: 'call:fresh-with-same-search',
      },
    ])

    expect(projection.facts).toHaveLength(1)
    expect(projection.repeatDemandCount).toBe(0)
    expect(projection.deduplicatedReplayCount).toBe(2)
  })
})
