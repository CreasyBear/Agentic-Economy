import type { UserIdentity } from 'convex/server'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import { isRecord } from '../../../../src/modules/common/is-record'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { requireSourceRead, requireSourceWrite } from '../../security/sourceWrite/admission'
import type { SourceWriteArgs } from '../../security/sourceWrite/contracts'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { MFA_REVERIFICATION_REQUIRED } from './factorVerification'
import { consumeConsequenceProof, deriveMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from '../../authority/consequence/proof'
import type { SecurityDb } from './identity'

export async function assertStepUpForSensitiveAction(
  db: SecurityDb,
  identity: UserIdentity,
  input: Readonly<{ accountRef: string; proof?: ClerkMfaConsequenceProofInput }>,
): Promise<
  | Readonly<{
    kind: 'allowed'
    requireMfaForMembers: boolean
    policyRevision?: number
  }>
  | typeof MFA_REVERIFICATION_REQUIRED
> {
  // The caller verifies the exact server-signed command before invoking this
  // adapter. Convex's identity projection is not a factor-verification source.
  if (input.proof === undefined || deriveMfaConsequenceProof({
    proof: input.proof, subject: identity.subject, now: Date.now(),
  }).kind === 'refused') {
    return MFA_REVERIFICATION_REQUIRED
  }

  const canonicalAccountRef = accountRef(input.accountRef)
  const row = await db
    .query('accountSecurityPolicies')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', canonicalAccountRef))
    .unique()

  if (row === null || !row.requireMfaForMembers) {
    return { kind: 'allowed', requireMfaForMembers: false }
  }

  return {
    kind: 'allowed',
    requireMfaForMembers: true,
    policyRevision: row.revision,
  }
}

export async function requireWorkspaceActionSource(args: {
  idempotencyRef: string; correlationRef: string; operationKey: string; correlationId: string
  [key: string]: unknown
}): Promise<void> {
  if (args.operationKey !== args.idempotencyRef || args.correlationId !== args.correlationRef
    || (await requireSourceRead(args, 'protected_action')).kind === 'rejected') {
    throw new InteractiveAuthorityError('authority_mismatch')
  }
}

export function workspaceActionDigest(action: 'close' | 'transfer', args: {
  proof?: unknown; sourceWrite?: unknown; sourceWriteRequest?: unknown; [key: string]: unknown
}, actorPrincipalRef: string, activeAccountRef: string): string {
  const { proof: _proof, sourceWrite: _sourceWrite, sourceWriteRequest: _request,
    correlationRef: _correlationRef, correlationId: _correlationId, ...command } = args
  return canonicalDigest({ action: `workspace:${action}`, actorPrincipalRef, activeAccountRef, command })
}

export async function requireWorkspaceActionReplay(db: SecurityDb, input: {
  action: 'closed' | 'ownership_transferred'; idempotencyRef: string
  commandDigest: string; actorPrincipalRef: string; activeAccountRef: string
}): Promise<void> {
  const audit = await db.query('auditEvents').withIndex('by_eventId', q =>
    q.eq('eventId', `audit:workspace:account.workspace.${input.action}:${input.idempotencyRef}`)).unique()
  if (audit === null) return // Historical receipts retain their existing terminal-only replay checks.
  if (audit.actorRef !== input.actorPrincipalRef || audit.activeAccountRef !== input.activeAccountRef) {
    throw new InteractiveAuthorityError('idempotency_conflict')
  }
  const payload: unknown = JSON.parse(audit.redactedPayloadJson)
  if (isRecord(payload) && payload.actionDigest !== undefined && payload.actionDigest !== input.commandDigest) {
    throw new InteractiveAuthorityError('idempotency_conflict')
  }
}

export async function consumeWorkspaceActionProof(ctx: MutationCtx, identity: UserIdentity, input: {
  proof?: ClerkMfaConsequenceProofInput; actorPrincipalRef: string; activeAccountRef: string
  commandDigest: string; correlationRef: string; idempotencyRef: string
}, command: SourceWriteArgs): Promise<{ kind: 'allowed' } | typeof MFA_REVERIFICATION_REQUIRED> {
  const proof = input.proof
  if (proof === undefined) return MFA_REVERIFICATION_REQUIRED
  const derived = deriveMfaConsequenceProof({ proof, subject: identity.subject, now: Date.now() })
  if (derived.kind === 'refused') return MFA_REVERIFICATION_REQUIRED
  const existing = await ctx.db.query('consequenceProofUses').withIndex('by_reverificationId', q =>
    q.eq('reverificationId', proof.reverificationId)).unique()
  if (existing !== null && (existing.actorPrincipalRef !== input.actorPrincipalRef
    || existing.activeAccountRef !== input.activeAccountRef || existing.commandDigest !== input.commandDigest
    || existing.idempotencyRef !== input.idempotencyRef)) return MFA_REVERIFICATION_REQUIRED
  if ((await requireSourceWrite(ctx, command, 'protected_action')).kind === 'rejected') {
    throw new InteractiveAuthorityError('authority_mismatch')
  }
  const consumed = await consumeConsequenceProof(ctx, {
    ...input, reverificationId: proof.reverificationId, proof: derived.proof,
  })
  // The existing-use read and consumption share this mutation. A refused
  // result here means the contract changed; roll back the nonce as well.
  if (consumed.kind === 'refused') throw new InteractiveAuthorityError('idempotency_conflict')
  return { kind: 'allowed' }
}
