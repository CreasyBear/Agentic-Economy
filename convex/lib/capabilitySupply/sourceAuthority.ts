import type { MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'

export async function applyCapabilitySourceAuthorityReview(
  ctx: MutationCtx,
  input: Readonly<{
    publicationRef: string
    expectedRevision: number
    expectedSourceDigest: string
    evidenceRefs: readonly string[]
    decision: 'evidence_verified' | 'evidence_insufficient'
  }>,
): Promise<
  | { kind: 'refused'; code: 'publication_not_found' | 'source_authority_not_reviewable' }
  | {
      kind: 'applied'
      publicationRef: string
      toolRef: string
      previousState: 'verified' | 'review_required'
      nextState: 'verified' | 'review_required'
    }
> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', input.publicationRef)
      .eq('revision', input.expectedRevision))
    .unique()
  if (publication === null || publication.disposition !== 'current'
    || publication.sourceDigest !== input.expectedSourceDigest) {
    return { kind: 'refused', code: 'publication_not_found' }
  }
  if (publication.sourceAuthorityState === 'verified') {
    return { kind: 'refused', code: 'source_authority_not_reviewable' }
  }

  const now = Date.now()
  const verified = input.decision === 'evidence_verified'
  const nextState: 'verified' | 'review_required' = verified ? 'verified' : 'review_required'
  const evidenceRefs = [...new Set([
    ...publication.registrationEvidenceRefs,
    ...input.evidenceRefs,
  ])].sort()
  await ctx.db.patch(publication._id, {
    ...(verified ? { sourceAuthorityState: nextState } : {}),
    registrationEvidenceRefs: evidenceRefs,
    updatedAt: now,
  })
  const admissionCase = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', publication.publicationRef)
      .eq('publicationRevision', publication.revision))
    .unique()
  if (admissionCase !== null) {
    await ctx.db.patch(admissionCase._id, {
      ...(verified ? { sourceAuthorityState: nextState, blockerRefs: [] } : {}),
      state: 'under_review',
      terminalDecision: verified ? 'pending' : 'action_required',
      evidenceRefs: [...new Set([...admissionCase.evidenceRefs, ...input.evidenceRefs])].sort(),
      reviewStartedAt: admissionCase.reviewStartedAt ?? now,
      completedAt: undefined,
      updatedAt: now,
    })
  }
  if (verified) {
    await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
    })
  }
  return {
    kind: 'applied',
    publicationRef: publication.publicationRef,
    toolRef: publication.toolRef,
    previousState: publication.sourceAuthorityState ?? 'review_required',
    nextState,
  }
}
