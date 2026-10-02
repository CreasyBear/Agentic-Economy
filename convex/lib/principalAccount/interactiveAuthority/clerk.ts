import type { UserIdentity } from 'convex/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { Doc } from '../../../_generated/dataModel'
import { InteractiveAuthorityError } from './errors'
import type { AuthorityDb } from './shared'

export function clerkActiveOrganizationId(identity: UserIdentity): string | null {
  const record = identity as UserIdentity & Record<string, unknown> & { o?: { id?: unknown } }
  const candidate = identity.org_id ?? record['o.id'] ?? record.o?.id
  if (typeof candidate !== 'string') return null
  const trimmed = candidate.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Requires a Convex-verified identity and its canonical Principal.
 * Ensures only signed, same-Principal Clerk observations describe this session.
 * Invariant: a terminal session stays refused after another session renews the
 * shared credential generation; replayed creation events cannot reopen it.
 * On violation: credential_not_current, with no writes. Missing session claims
 * retain legacy admission only before any canonical credential revocation.
 * After revocation, even active successors require a creation observation
 * after the revoked generation, including password-reset invalidation.
 */
export async function readCurrentClerkSessionCreation(
  db: AuthorityDb,
  identity: UserIdentity,
  principalRef: string,
  bindingRef: string,
): Promise<Doc<'auditEvents'> | null> {
  const revocation = await db.query('credentials')
    .withIndex('by_principalRef_and_lifecycle', query => query
      .eq('principalRef', principalRef).eq('lifecycle', 'revoked'))
    .filter(query => query.and(
      query.eq(query.field('type'), 'provider_token'),
      query.eq(query.field('bindingRef'), bindingRef),
    ))
    .order('desc')
    .first()
  if (identity.sid === undefined) {
    if (revocation !== null) throw new InteractiveAuthorityError('credential_not_current')
    return null
  }
  if (typeof identity.sid !== 'string' || !/^sess_[A-Za-z0-9_-]{1,195}$/u.test(identity.sid)) {
    throw new InteractiveAuthorityError('identity_invalid')
  }
  const digest = canonicalDigest({
    contract: 'ae.clerk-webhook-target:v1',
    provider: 'clerk',
    targetKind: 'session',
    targetRef: identity.sid,
  })
  const targetRef = `clerk-session:${digest.slice('sha256:'.length)}`
  const terminal = await db.query('auditEvents')
    .withIndex('by_targetType_and_targetRef_and_createdAt', query => query
      .eq('targetType', 'session').eq('targetRef', targetRef))
    .filter(query => query.and(
      query.eq(query.field('actorRef'), principalRef),
      query.eq(query.field('sourceSystem'), 'clerk_observed'),
      query.or(
        query.eq(query.field('eventType'), 'account.session.revoked'),
        query.eq(query.field('eventType'), 'account.session.ended'),
      ),
    ))
    .first()
  if (terminal !== null) throw new InteractiveAuthorityError('credential_not_current')
  const creation = await db.query('auditEvents')
    .withIndex('by_targetType_and_targetRef_and_createdAt', query => query
      .eq('targetType', 'session').eq('targetRef', targetRef))
    .filter(query => query.and(
      query.eq(query.field('actorRef'), principalRef),
      query.eq(query.field('sourceSystem'), 'clerk_observed'),
      query.eq(query.field('eventType'), 'account.session.created'),
    ))
    .order('desc')
    .first()
  if (revocation !== null && (
    revocation.revokedAt === undefined
    || !Number.isSafeInteger(revocation.revokedAt)
    || creation?.observedAt === undefined
    || !Number.isSafeInteger(creation.observedAt)
    || creation.observedAt <= revocation.revokedAt
  )) throw new InteractiveAuthorityError('credential_not_current')
  return creation
}
