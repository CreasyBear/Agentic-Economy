import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { MutationCtx } from './_generated/server'

type RevocationReason = 'request_revised' | 'route_generation_superseded'

export async function supersedeCurrentRouteMandate(
  db: MutationCtx['db'],
  input: Readonly<{
    requestId: string
    nextRequestRevision: number
    nextGenerationRef?: string
    reason: RevocationReason
    recordedAt: number
  }>,
): Promise<{ kind: 'not_active' } | { kind: 'already_revoked'; mandateRef: string } | {
  kind: 'revoked'
  mandateRef: string
  revocationRef: string
}> {
  const head = await db.query('customerRequestRouteMandateHeads')
    .withIndex('by_requestId', (query) => query.eq('requestId', input.requestId)).unique()
  if (head === null) return { kind: 'not_active' }
  if (head.currentRequestRevision === input.nextRequestRevision
    && head.currentGenerationRef === input.nextGenerationRef) return { kind: 'not_active' }
  const prior = await db.query('customerRequestRouteMandateRevocations')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', head.currentMandateRef)).unique()
  if (prior !== null) return { kind: 'already_revoked', mandateRef: head.currentMandateRef }
  const evidence = {
    mandateRef: head.currentMandateRef,
    mandateDigest: head.currentMandateDigest,
    requestId: input.requestId,
    requestRevision: head.currentRequestRevision,
    generationRef: head.currentGenerationRef,
    reason: input.reason,
    supersededByRequestRevision: input.nextRequestRevision,
    ...(input.nextGenerationRef === undefined
      ? {}
      : { supersededByGenerationRef: input.nextGenerationRef }),
    recordedAt: input.recordedAt,
  }
  const evidenceDigest = canonicalDigest(evidence)
  const revocationRef = `route-mandate-revocation:v1:${evidenceDigest}`
  await db.insert('customerRequestRouteMandateRevocations', {
    revocationRef,
    mandateRef: head.currentMandateRef,
    mandateDigest: head.currentMandateDigest,
    principalId: head.principalId,
    requestId: input.requestId,
    reason: input.reason,
    requestRevision: head.currentRequestRevision,
    generationRef: head.currentGenerationRef,
    supersededByRequestRevision: input.nextRequestRevision,
    ...(input.nextGenerationRef === undefined
      ? {}
      : { supersededByGenerationRef: input.nextGenerationRef }),
    evidenceDigest,
    recordedAt: input.recordedAt,
  })
  return { kind: 'revoked', mandateRef: head.currentMandateRef, revocationRef }
}
