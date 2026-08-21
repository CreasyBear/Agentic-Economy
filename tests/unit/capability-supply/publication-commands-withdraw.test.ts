import { describe, expect, it, vi } from 'vitest'

import { withdrawCapabilityCommand } from '@/modules/capability-supply/internal/publication'

import {
  context,
  currentPublication,
  digest,
  emptyPorts,
  supplyRows,
} from './publication-commands-harness'

describe('capability-supply publication commands withdraw', () => {
  it('refuses withdraw when disposition is not current', async () => {
    const result = await withdrawCapabilityCommand({
      publication: currentPublication({ disposition: 'withdrawn' }),
      evidenceRefs: context.evidenceRefs,
      now: 10,
    }, emptyPorts())
    expect(result).toEqual({ kind: 'refused', reason: 'revision_changed' })
  })

  it('withdraws by revoking eligibility and patching disposition', async () => {
    const publication = currentPublication()
    const setEligibility = vi.fn(async () => ({
      kind: 'ineligible' as const,
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      eligibilityHash: digest,
      offeringEligibilityHash: digest,
      bindingEligibilityHash: digest,
      transition: {
        offeringBefore: 'active' as const,
        offeringAfter: 'inactive' as const,
        bindingBefore: 'admitted:conformant' as const,
        bindingAfter: 'not_admitted:not_conformant' as const,
      },
    }))
    const patchWithdrawn = vi.fn(async () => {})
    const result = await withdrawCapabilityCommand({
      publication,
      evidenceRefs: context.evidenceRefs,
      now: 10,
    }, emptyPorts({
      ...supplyRows(publication),
      setEligibility,
      patchPublicationWithdrawn: patchWithdrawn,
    }))
    expect(result).toEqual({
      kind: 'withdrawn',
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      lifecycle: { state: 'withdrawn', reasons: ['withdrawn'] },
    })
    expect(setEligibility).toHaveBeenCalledWith(expect.objectContaining({
      offeringId: publication.offeringId,
      bindingId: publication.bindingId,
      decision: 'revoke',
      admissionEvidenceRefs: context.evidenceRefs,
      conformanceEvidenceRefs: context.evidenceRefs,
    }), 10)
    expect(patchWithdrawn).toHaveBeenCalledWith(publication.id, 10)
  })
})
