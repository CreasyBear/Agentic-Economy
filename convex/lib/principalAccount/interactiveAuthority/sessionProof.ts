import type { UserIdentity } from 'convex/server'

import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { Doc } from '../../../_generated/dataModel'
import { InteractiveAuthorityError } from './errors'
import type { AuthorityDb } from './shared'

const LEGACY_REVOCATION_LIMIT = 256
const SESSION_EVIDENCE_LIMIT = 16
const sessionIdPattern = /^sess_[A-Za-z0-9_-]{1,195}$/u

/**
 * Requires: a canonical Clerk binding and a Convex-verified session identity.
 * Ensures: after revocation, only a signed, observed session created strictly
 * after the cutoff can use any credential generation of this binding.
 * Invariant: ended/revoked sessions stay denied after recovery and rotation;
 * reads never initialize or alter authority. First sign-up needs no webhook.
 * On violation: typed authority refusal; delayed evidence remains retryable.
 *
 * Complexity: one helper and cutoff field replace duplicated issuance/read
 * rules and unbounded history scans. Existing signed audits supply the proof;
 * no additional session store or provider call is needed.
 */
export async function requireCurrentInteractiveSession(
  db: AuthorityDb,
  identity: UserIdentity,
  binding: Doc<'externalIdentityBindings'>,
  cutoff = binding.interactiveSessionsRevokedBefore,
): Promise<void> {
  const revocationCutoff = cutoff ?? await readInteractiveSessionRevocationCutoff(db, binding)
  requireValidCutoff(revocationCutoff)
  const sessionId = identity.sid
  if (sessionId === undefined && revocationCutoff === 0) return
  if (typeof sessionId !== 'string' || !sessionIdPattern.test(sessionId)) {
    throw new InteractiveAuthorityError('session_evidence_unavailable')
  }
  const targetHash = canonicalDigest({
    contract: 'ae.clerk-webhook-target:v1',
    provider: 'clerk',
    targetKind: 'session',
    targetRef: sessionId,
  }).slice('sha256:'.length)
  const observations = await db.query('auditEvents')
    .withIndex('by_targetType_and_targetRef_and_createdAt', (query) => query
      .eq('targetType', 'session')
      .eq('targetRef', `clerk-session:${targetHash}`))
    .take(SESSION_EVIDENCE_LIMIT + 1)
  if (observations.length > SESSION_EVIDENCE_LIMIT) {
    throw new InteractiveAuthorityError('session_evidence_unavailable')
  }
  let sessionCreatedAt: number | undefined
  for (const observation of observations) {
    if (observation.sourceSystem !== 'clerk_observed' || observation.actorRef !== binding.principalRef) continue
    if (observation.eventType === 'account.session.ended' || observation.eventType === 'account.session.revoked') {
      throw new InteractiveAuthorityError('session_not_current')
    }
    if (observation.eventType !== 'account.session.created') continue
    const observedAt = observation.observedAt
    if (observedAt === undefined || !Number.isSafeInteger(observedAt) || observedAt <= 0
      || (sessionCreatedAt !== undefined && sessionCreatedAt !== observedAt)) {
      throw new InteractiveAuthorityError('session_evidence_unavailable')
    }
    sessionCreatedAt = observedAt
  }
  if (revocationCutoff === 0) return
  if (sessionCreatedAt === undefined) throw new InteractiveAuthorityError('session_evidence_unavailable')
  if (sessionCreatedAt <= revocationCutoff) throw new InteractiveAuthorityError('session_not_current')
}

/** Legacy reads stay bounded and read-only until a successful mutation saves the cutoff. */
export async function readInteractiveSessionRevocationCutoff(
  db: AuthorityDb,
  binding: Doc<'externalIdentityBindings'>,
): Promise<number> {
  const stored = binding.interactiveSessionsRevokedBefore
  if (stored !== undefined) {
    requireValidCutoff(stored)
    return stored
  }
  const revokedCredentials = await db.query('credentials')
    .withIndex('by_principalRef_and_lifecycle', (query) => query
      .eq('principalRef', binding.principalRef)
      .eq('lifecycle', 'revoked'))
    .take(LEGACY_REVOCATION_LIMIT + 1)
  // Never silently infer a lower cutoff from a truncated history. An oversized
  // legacy binding needs a deliberate backfill before it can grant authority.
  if (revokedCredentials.length > LEGACY_REVOCATION_LIMIT) {
    throw new InteractiveAuthorityError('session_revocation_uninitialized')
  }
  let cutoff = 0
  for (const credential of revokedCredentials) {
    if (credential.bindingRef !== binding.bindingRef || credential.type !== 'provider_token') continue
    cutoff = Math.max(cutoff, interactiveCredentialRevokedAt(credential))
  }
  const observations = await db.query('auditEvents')
    .withIndex('by_actorRef_and_createdAt', (query) => query.eq('actorRef', binding.principalRef))
    .take(LEGACY_REVOCATION_LIMIT + 1)
  if (observations.length > LEGACY_REVOCATION_LIMIT) {
    throw new InteractiveAuthorityError('session_revocation_uninitialized')
  }
  for (const observation of observations) {
    if (observation.sourceSystem !== 'clerk_observed'
      || (observation.eventType !== 'account.session.revoked'
        && observation.eventType !== 'account.security_profile.updated')) continue
    const observedAt = observation.observedAt
    if (observedAt === undefined || !Number.isSafeInteger(observedAt) || observedAt <= 0) {
      throw new InteractiveAuthorityError('authority_fact_invalid')
    }
    // A later revocation can have no credential left to patch. Legacy profile
    // audits omitted securityAction, so conservatively treat every such update
    // as a cutoff rather than overlooking a password/security change.
    cutoff = Math.max(cutoff, observedAt)
  }
  return cutoff
}

export function interactiveCredentialRevokedAt(credential: Doc<'credentials'>): number {
  const revokedAt = credential.revokedAt
  if (revokedAt === undefined || !Number.isSafeInteger(revokedAt) || revokedAt <= 0) {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
  return revokedAt
}

function requireValidCutoff(cutoff: number): void {
  if (!Number.isSafeInteger(cutoff) || cutoff < 0) {
    throw new InteractiveAuthorityError('authority_fact_invalid')
  }
}
