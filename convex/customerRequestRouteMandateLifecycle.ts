import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { MutationCtx } from './_generated/server'
import {
  routeMandateHeadMatchesIssue,
  routeMandateRevocationRecordIsValid,
} from './customerRequestRouteMandateIntegrity'

type RevocationReason = 'request_revised' | 'route_generation_superseded'

export async function supersedeCurrentRouteMandate(
  db: MutationCtx['db'],
  input: Readonly<{
    requestId: string
    nextRequestRevision: number
    nextGenerationRef?: string
    reason: RevocationReason
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
  const issue = await db.query('customerRequestRouteMandateIssues')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', head.currentMandateRef)).unique()
  if (issue === null || !routeMandateHeadMatchesIssue(head, issue)) {
    throw new Error('customer_request_route_mandate_head_integrity_failure')
  }
  const prior = await db.query('customerRequestRouteMandateRevocations')
    .withIndex('by_mandateRef', (query) => query.eq('mandateRef', head.currentMandateRef)).unique()
  if (prior !== null) {
    if (!routeMandateRevocationRecordIsValid(prior, issue)) {
      throw new Error('customer_request_route_mandate_revocation_integrity_failure')
    }
    return { kind: 'already_revoked', mandateRef: head.currentMandateRef }
  }
  const recordedAt = Math.max(Date.now(), issue.recordedAt)
  const evidence = {
    mandateRef: head.currentMandateRef,
    mandateDigest: head.currentMandateDigest,
    principalId: head.principalId,
    requestId: input.requestId,
    requestRevision: head.currentRequestRevision,
    generationRef: head.currentGenerationRef,
    reason: input.reason,
    supersededByRequestRevision: input.nextRequestRevision,
    ...(input.nextGenerationRef === undefined
      ? {}
      : { supersededByGenerationRef: input.nextGenerationRef }),
    recordedAt,
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
    recordedAt,
  })
  return { kind: 'revoked', mandateRef: head.currentMandateRef, revocationRef }
}
