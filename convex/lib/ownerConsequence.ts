import type { MutationCtx } from '../_generated/server'

import {
  ConsequenceAuthorityBoundary,
  type AuthorityConsequenceAdmission,
  type Package3ConsequenceAction,
} from '../../src/modules/authority/context/public'
import type { BusinessActor } from '../../src/modules/business/public'
import { accountRef, ownershipRef, principalRef } from '../../src/modules/principal-account/public'
import {
  consumeConsequenceProof,
  deriveStrictConsequenceProof,
  isValidClerkFactorEvidence,
  type ClerkConsequenceProofInput,
} from './consequenceProof'
import {
  admitAuthorityCredentialChangeRate,
  admitPayoutTransferRate,
} from './rateLimit'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../../src/modules/common/ids'
import { createPackage3AuditEvent } from '../../src/modules/observability/public'
import { persistAuditEvent } from '../securityShared'

export type OwnerConsequenceRefusal =
  | 'authority_mismatch'
  | 'reauthentication_required'
  | 'proof_stale'
  | 'proof_replayed'
  | 'command_changed'
  | 'rate_limited'
  | 'security_control_unavailable'

type AuthenticatedOwner = Extract<BusinessActor, { kind: 'authenticated_owner' }>

export async function admitInteractiveOwnerConsequence(
  ctx: MutationCtx,
  input: Readonly<{
    actor: AuthenticatedOwner
    action: Package3ConsequenceAction
    target: Readonly<{
      targetType: string
      targetRef: string
      targetRevision: number
    }>
    requiredScopes: readonly string[]
    resourceRefs: readonly string[]
    budgetAmount: number
    consequenceSummary: string
    statusReadbackRef: string
    command: unknown
    correlationRef: string
    idempotencyRef: string
    proof?: ClerkConsequenceProofInput
    now: number
  }>,
): Promise<
  | Readonly<{
      kind: 'admitted'
      admission: AuthorityConsequenceAdmission
      proofUse?: 'consumed' | 'replayed'
    }>
  | Readonly<{
      kind: 'refused'
      code: OwnerConsequenceRefusal
      retryAfter?: number
      correlationRef?: string
    }>
> {
  const provenance = input.actor.authorityProvenance
  if (provenance.accessKind !== 'ownership'
    || provenance.accessRef !== provenance.currentOwnershipRef) {
    return { kind: 'refused', code: 'authority_mismatch' }
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', provenance.currentOwnershipRef))
    .unique()
  if (ownership === null
    || ownership.lifecycle !== 'active'
    || ownership.accountRef !== input.actor.canonicalAccountRef
    || ownership.ownerPrincipalRef !== input.actor.canonicalPrincipalRef
    || ownership.revision !== input.actor.authorityRevision.currentOwnership) {
    return { kind: 'refused', code: 'authority_mismatch' }
  }

  const boundary = new ConsequenceAuthorityBoundary({
    admitConsequence: async () => {
      throw new Error('interactive_owner_delegation_unreachable')
    },
  })
  const admission = await boundary.forSurface('convex', {
    resolveCanonicalBinding: async () => ({
      principalClass: 'interactive',
      actorPrincipalRef: principalRef(input.actor.canonicalPrincipalRef),
      activeAccountRef: accountRef(input.actor.canonicalAccountRef),
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: ownershipRef(ownership.ownershipRef),
        ownershipRevision: ownership.revision,
        accountRevision: input.actor.authorityRevision.account,
        admittedAt: input.now,
        expiresAt: input.now + 1,
      },
    }),
  }).withCurrentAuthority({
    requiredScopes: input.requiredScopes,
    resourceRefs: input.resourceRefs,
    budgetAmount: input.budgetAmount,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
    consequence: {
      action: input.action,
      target: input.target,
      consequenceSummary: input.consequenceSummary,
      statusReadbackRef: input.statusReadbackRef,
      command: input.command,
    },
  }, async (value) => value)

  if (admission.descriptor === undefined || admission.proofPolicy === undefined) {
    return { kind: 'refused', code: 'authority_mismatch' }
  }
  if (admission.proofPolicy.kind === 'none') {
    return { kind: 'admitted', admission }
  }
  if (admission.proofPolicy.preset !== 'strict'
    || admission.proofPolicy.uniquePerCommand !== true
    || input.proof === undefined
    || !isValidClerkFactorEvidence(input.proof)) {
    return { kind: 'refused', code: 'reauthentication_required' }
  }

  const existingProof = await ctx.db.query('consequenceProofUses')
    .withIndex('by_reverificationId', (query) => query.eq('reverificationId', input.proof!.reverificationId))
    .unique()
  if (existingProof !== null) {
    if (existingProof.actorPrincipalRef !== admission.actorPrincipalRef
      || existingProof.activeAccountRef !== admission.activeAccountRef) {
      return { kind: 'refused', code: 'proof_replayed' }
    }
    if (existingProof.commandDigest !== admission.descriptor.commandDigest) {
      return { kind: 'refused', code: 'command_changed' }
    }
    return { kind: 'admitted', admission, proofUse: 'replayed' }
  }

  const proof = deriveStrictConsequenceProof({ ...input.proof, now: input.now })
  if (proof.kind === 'refused') return proof
  const rate = input.action === 'payout.transfer'
    ? await admitPayoutTransferRate(ctx, admission.activeAccountRef)
    : input.action === 'payout_authority.create' || input.action === 'payout_authority.replace'
      ? await admitAuthorityCredentialChangeRate(ctx, admission.activeAccountRef)
      : undefined
  if (rate?.kind === 'unavailable') {
    return {
      kind: 'refused',
      code: 'security_control_unavailable',
      correlationRef: input.correlationRef,
    }
  }
  if (rate?.kind === 'rate_limited') {
    return { kind: 'refused', code: 'rate_limited', retryAfter: rate.retryAfter }
  }
  const consumed = await consumeConsequenceProof(ctx, {
    reverificationId: input.proof.reverificationId,
    actorPrincipalRef: admission.actorPrincipalRef,
    activeAccountRef: admission.activeAccountRef,
    commandDigest: admission.descriptor.commandDigest,
    proof: proof.proof,
    correlationRef: admission.correlationRef,
    idempotencyRef: admission.idempotencyRef,
  })
  if (consumed.kind === 'refused') return consumed
  if (consumed.kind === 'consumed') {
    const proofEvidenceDigest = canonicalDigest({
      version: 'ae.consequence-proof-evidence:v1',
      reverificationId: consumed.proof.reverificationId,
    })
    const audit = createPackage3AuditEvent({
      eventId: brandNonEmpty(
        `audit:consequence.proof_consumed:${proofEvidenceDigest.slice('sha256:'.length)}`,
        'AuditEventId',
      ),
      eventType: 'consequence.proof_consumed',
      actorKind: 'owner',
      actorRef: admission.actorPrincipalRef,
      activeAccountRef: admission.activeAccountRef,
      sourceSystem: 'ae_recorded',
      observedAt: input.now,
      authorityGeneration: admission.descriptor.target.targetRevision,
      targetType: 'consequence_command',
      targetRef: admission.descriptor.target.targetRef,
      idempotencyKey: brandNonEmpty(admission.idempotencyRef, 'OperationKey'),
      correlationId: brandNonEmpty(admission.correlationRef, 'CorrelationId'),
      beforeState: 'available',
      outcome: 'consumed',
      evidenceRefs: [`proof-use:${proofEvidenceDigest}`],
      redactedPayload: {
        action: input.action,
        targetType: admission.descriptor.target.targetType,
        targetRef: admission.descriptor.target.targetRef,
        targetRevision: admission.descriptor.target.targetRevision,
        proofPreset: 'strict',
        firstFactorAgeMinutes: consumed.proof.factorEvidence.firstFactorAgeMinutes,
        secondFactorAgeMinutes: consumed.proof.factorEvidence.secondFactorAgeMinutes,
      },
      commandDigest: brandNonEmpty(admission.descriptor.commandDigest, 'SourceHash'),
      createdAt: input.now,
    })
    if (!audit.valid)
      throw new Error(`owner_consequence_audit_invalid:${audit.reason}`)
    await persistAuditEvent(ctx.db, audit.event)
  }
  return { kind: 'admitted', admission, proofUse: consumed.kind }
}
