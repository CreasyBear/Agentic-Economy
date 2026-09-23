import { validEvidenceRefs } from '@/modules/capability-supply/public'
import type { MutationCtx } from '../../_generated/server'
import { internal } from '../../_generated/api'
import { resolveAdminAuthority } from '../../authz'
import { requireSourceWrite } from '../../sourceWriteAdmission'

export async function verifyCapabilitySourceAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{
    publicationRef: string
    expectedRevision: number
    expectedSourceDigest: string
    evidenceRefs: string[]
    operationKey: string
    correlationId: string
    sourceWrite?: unknown
    sourceWriteRequest?: unknown
  }>,
) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, reason: 'authorization_denied' as const }
  }
  const admin = await resolveAdminAuthority(ctx, 'register_capability_supply')
  if (admin.kind !== 'allowed') {
    return { kind: 'refused' as const, reason: 'authorization_denied' as const }
  }
  if (!validEvidenceRefs(args.evidenceRefs) || args.evidenceRefs.length === 0) {
    return { kind: 'refused' as const, reason: 'evidence_invalid' as const }
  }
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', args.publicationRef)
      .eq('revision', args.expectedRevision))
    .unique()
  if (publication === null || publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'publication_not_found' as const }
  }
  if (publication.revision !== args.expectedRevision) {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }
  if (publication.sourceDigest !== args.expectedSourceDigest) {
    return { kind: 'refused' as const, reason: 'source_changed' as const }
  }
  if (publication.sourceAuthorityState === 'verified') {
    return {
      kind: 'replayed' as const,
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      toolRef: publication.toolRef,
      sourceAuthorityState: 'verified' as const,
    }
  }
  const now = Date.now()
  const authorityEvidenceRefs = [...new Set([
    ...(publication.registrationEvidenceRefs ?? []),
    ...args.evidenceRefs,
  ])].sort()
  await ctx.db.patch(publication._id, {
    sourceAuthorityState: 'verified',
    registrationEvidenceRefs: authorityEvidenceRefs,
    updatedAt: now,
  })
  const admissionCase = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', publication.publicationRef)
      .eq('publicationRevision', publication.revision))
    .unique()
  if (admissionCase !== null) {
    await ctx.db.patch(admissionCase._id, {
      sourceAuthorityState: 'verified',
      state: 'under_review',
      terminalDecision: 'pending',
      blockerRefs: [],
      evidenceRefs: [...new Set([...admissionCase.evidenceRefs, ...args.evidenceRefs])].sort(),
      reviewStartedAt: admissionCase.reviewStartedAt ?? now,
      completedAt: undefined,
      updatedAt: now,
    })
  }
  await ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
    publicationRef: publication.publicationRef,
    expectedRevision: publication.revision,
  })
  return {
    kind: 'verified' as const,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    toolRef: publication.toolRef,
    sourceAuthorityState: 'verified' as const,
  }
}
