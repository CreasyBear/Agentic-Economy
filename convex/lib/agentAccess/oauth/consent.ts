import { v, type ObjectType } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { AuthorityConsequenceAdmission } from '@/modules/authority/context/public'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { admitAuthorityCredentialChangeRate } from '../../platform/rateLimit'
import { consumeConsequenceProof, deriveStrictConsequenceProof, isValidClerkFactorEvidence } from '../../authority/consequence/proof'
import { authorityMode, requireOAuthSourceWrite } from './shared'
import type { ConsentCommand } from './contracts'
import { deriveConsentCommand, isCompletedConsentGrant } from './consentCommand'
import { revokeCompromisedPredecessor, samePredecessorSnapshot } from './consentPredecessor'
import { currentOwnerAuthority, agentAccessConsequenceAdmission, persistProofConsumedAudit } from './consentAdmission'
const consentConnectionTarget = v.union(
  v.object({ kind: v.literal('new_agent') }),
  v.object({
    kind: v.literal('replace_credential'),
    principalRef: v.string(),
    replacementMode: v.union(v.literal('planned'), v.literal('compromise')),
  }),
)
const clerkProofEvidence = v.object({
  reverificationId: v.string(),
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})
const agentAccessConsentReservationResult = v.union(
  v.object({
    kind: v.union(v.literal('reserved'), v.literal('replayed')),
    grantRef: v.string(),
    grantRevision: v.number(),
    commandDigest: v.string(),
    correlationRef: v.string(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('authentication_required'),
      v.literal('reauthentication_required'),
      v.literal('proof_stale'),
      v.literal('proof_replayed'),
      v.literal('command_changed'),
    ),
  }),
  v.object({
    kind: v.literal('conflict'),
    code: v.union(
      v.literal('stale_grant'),
      v.literal('stale_target'),
      v.literal('invalid_state'),
      v.literal('authority_mismatch'),
    ),
  }),
  v.object({
    kind: v.literal('rate_limited'),
    retryAfter: v.number(),
  }),
  v.object({
    kind: v.literal('unavailable'),
    code: v.literal('security_control_unavailable'),
    correlationRef: v.string(),
  }),
)

export const reserveAgentAccessConsentArgs = {
  grantRef: v.string(),
  expectedGrantRevision: v.number(),
  expectedTargetRevision: v.number(),
  authorityMode,
  approvedToolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  approvedToolRefs: v.array(v.string()),
  connectionTarget: consentConnectionTarget,
  proof: v.optional(clerkProofEvidence),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
export const reserveAgentAccessConsentResult = agentAccessConsentReservationResult
export async function reserveAgentAccessConsentHandler(
  ctx: MutationCtx,
  args: ObjectType<typeof reserveAgentAccessConsentArgs>,
) {
  if (!validGrantRef(args.grantRef)
    || !positiveSafeInteger(args.expectedGrantRevision)
    || !positiveSafeInteger(args.expectedTargetRevision)) {
    return { kind: 'conflict' as const, code: 'stale_grant' as const }
  }
  const expectedRef = consentReservationRef(args.grantRef, args.expectedGrantRevision)
  if (args.operationKey !== expectedRef || args.correlationId !== expectedRef) {
    throw new Error('agent_access_oauth_reservation_ref_mismatch')
  }
  await requireOAuthSourceWrite(ctx, args)

  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return { kind: 'refused' as const, code: 'authentication_required' as const }
  }
  let owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
  try {
    owner = await resolveInteractiveAuthorityContext(ctx, identity)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused' as const, code: 'authentication_required' as const }, { site: 'reserveAgentAccessConsentHandler', reason: 'forbidden' })
  }
  const ownership = await currentOwnerAuthority(ctx, owner)
  if (ownership === null) {
    return { kind: 'conflict' as const, code: 'authority_mismatch' as const }
  }

  const oauthGrant = await ctx.db.query('agentAccessOAuthGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', args.grantRef))
    .unique()
  const completedReplay = oauthGrant !== null
    && isCompletedConsentGrant(oauthGrant.status)
    && oauthGrant.consequenceReservation?.correlationRef === expectedRef
    && oauthGrant.consequenceReservation.idempotencyRef === expectedRef
  if (oauthGrant === null
    || (oauthGrant.revision !== args.expectedGrantRevision
      && !(oauthGrant.status === 'issuing'
        && oauthGrant.revision === args.expectedGrantRevision + 1)
      && !completedReplay)) {
    return { kind: 'conflict' as const, code: 'stale_grant' as const }
  }
  const now = Date.now()
  if ((!completedReplay && oauthGrant.expiresAt <= now)
    || (oauthGrant.ownerId !== undefined && oauthGrant.ownerId !== identity.subject)) {
    return { kind: 'conflict' as const, code: 'invalid_state' as const }
  }
  const consent = await deriveConsentCommand(ctx, oauthGrant, args, owner.accountRef)
  if (consent === null) {
    return { kind: 'conflict' as const, code: 'stale_target' as const }
  }

  const admission = await agentAccessConsequenceAdmission({
    owner,
    ownership,
    consent,
    correlationRef: expectedRef,
    now,
  })
  if (admission.descriptor === undefined
    || admission.proofPolicy?.kind !== 'clerk_reverification'
    || admission.proofPolicy.preset !== 'strict'
    || admission.proofPolicy.uniquePerCommand !== true) {
    return { kind: 'conflict' as const, code: 'authority_mismatch' as const }
  }

  const proofInput = args.proof
  if (proofInput === undefined) {
    return { kind: 'refused' as const, code: 'reauthentication_required' as const }
  }
  if (!isValidClerkFactorEvidence(proofInput)) {
    return { kind: 'refused' as const, code: 'reauthentication_required' as const }
  }
  const existingProof = await ctx.db.query('consequenceProofUses')
    .withIndex('by_reverificationId', (query) => query.eq('reverificationId', proofInput.reverificationId))
    .unique()
  if (existingProof !== null) {
    if (existingProof.actorPrincipalRef !== admission.actorPrincipalRef
      || existingProof.activeAccountRef !== admission.activeAccountRef) {
      return { kind: 'refused' as const, code: 'proof_replayed' as const }
    }
    if (existingProof.commandDigest !== admission.descriptor.commandDigest) {
      return { kind: 'refused' as const, code: 'command_changed' as const }
    }
    return reservationMatches(oauthGrant, admission, proofInput.reverificationId, consent, owner.revision.principal)
      ? reservationSuccess('replayed', oauthGrant, admission)
      : { kind: 'refused' as const, code: 'proof_replayed' as const }
  }
  if (oauthGrant.status !== 'pending') {
    return { kind: 'conflict' as const, code: 'invalid_state' as const }
  }

  const proof = deriveStrictConsequenceProof({ ...proofInput, now })
  if (proof.kind === 'refused') return proof
  const rate = await admitAuthorityCredentialChangeRate(ctx, admission.activeAccountRef)
  if (rate.kind === 'unavailable') {
    return {
      kind: 'unavailable' as const,
      code: 'security_control_unavailable' as const,
      correlationRef: expectedRef,
    }
  }
  if (rate.kind === 'rate_limited') {
    return { kind: 'rate_limited' as const, retryAfter: rate.retryAfter }
  }

  const consumed = await consumeConsequenceProof(ctx, {
    reverificationId: proofInput.reverificationId,
    actorPrincipalRef: admission.actorPrincipalRef,
    activeAccountRef: admission.activeAccountRef,
    commandDigest: admission.descriptor.commandDigest,
    proof: proof.proof,
    correlationRef: admission.correlationRef,
    idempotencyRef: admission.idempotencyRef,
  })
  if (consumed.kind === 'refused') return consumed
  if (consumed.kind === 'replayed') {
    return reservationMatches(oauthGrant, admission, proofInput.reverificationId, consent, owner.revision.principal)
      ? reservationSuccess('replayed', oauthGrant, admission)
      : { kind: 'refused' as const, code: 'proof_replayed' as const }
  }

  await persistProofConsumedAudit(ctx, {
    admission,
    action: consent.action,
    proof: consumed.proof,
    authorityGeneration: owner.provenance.credentialGeneration,
    grantRef: oauthGrant.grantRef,
    now,
  })
  const current = await ctx.db.get(oauthGrant._id)
  if (current === null
    || current.status !== 'pending'
    || current.revision !== args.expectedGrantRevision) {
    throw new Error('agent_access_oauth_reservation_cas_lost')
  }
  if (consent.resolvedConnectionTarget.kind === 'replace_credential'
    && consent.resolvedConnectionTarget.replacementMode === 'compromise') {
    if (consent.predecessor === undefined) throw new Error('agent_access_compromise_predecessor_missing')
    const revoked = await revokeCompromisedPredecessor(
      ctx,
      consent.predecessor,
      owner,
      now,
      admission.correlationRef,
    )
    if (!revoked) throw new Error('agent_access_compromise_predecessor_stale')
  }
  await ctx.db.patch(current._id, {
    status: 'issuing',
    revision: current.revision + 1,
    ownerId: identity.subject,
    requestedScopes: [...consent.selectedScopes],
    approvedAccess: consent.issuanceMaterial.approvedAccess,
    connectionTarget: consent.resolvedConnectionTarget,
    issuanceKey: `oauth-${current.grantRef.replaceAll(':', '-')}`,
    issuanceStartedAt: now,
    consequenceReservation: {
      action: consent.action,
      commandDigest: admission.descriptor.commandDigest,
      reverificationId: proofInput.reverificationId,
      targetRevision: consent.targetRevision,
      actorPrincipalRef: admission.actorPrincipalRef,
      ownerPrincipalRevision: owner.revision.principal,
      activeAccountRef: admission.activeAccountRef,
      accountRevision: admission.accountRevision,
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: ownership.ownershipRef,
        ownershipRevision: ownership.revision,
      },
      ...(consent.predecessor === undefined ? {} : { predecessor: consent.predecessor }),
      correlationRef: admission.correlationRef,
      idempotencyRef: admission.idempotencyRef,
      reservedAt: now,
    },
  })
  const reserved = await ctx.db.get(current._id)
  if (reserved === null) throw new Error('agent_access_oauth_reservation_missing')
  return reservationSuccess('reserved', reserved, admission)
}
function reservationMatches(
  oauthGrant: Doc<'agentAccessOAuthGrants'>,
  admission: AuthorityConsequenceAdmission,
  reverificationId: string,
  consent: ConsentCommand,
  ownerPrincipalRevision: number,
): boolean {
  const reservation = oauthGrant.consequenceReservation
  return (oauthGrant.status === 'issuing' || isCompletedConsentGrant(oauthGrant.status))
    && reservation !== undefined
    && admission.descriptor !== undefined
    && admission.consequenceAction === reservation.action
    && reservation.commandDigest === admission.descriptor.commandDigest
    && reservation.reverificationId === reverificationId
    && reservation.targetRevision === consent.targetRevision
    && reservation.actorPrincipalRef === admission.actorPrincipalRef
    && reservation.ownerPrincipalRevision === ownerPrincipalRevision
    && reservation.activeAccountRef === admission.activeAccountRef
    && reservation.accountRevision === admission.accountRevision
    && admission.authoritySource.kind === 'account_ownership'
    && reservation.authoritySource.ownershipRef === admission.authoritySource.ownershipRef
    && reservation.authoritySource.ownershipRevision === admission.authoritySource.ownershipRevision
    && samePredecessorSnapshot(reservation.predecessor, consent.predecessor)
    && reservation.correlationRef === admission.correlationRef
    && reservation.idempotencyRef === admission.idempotencyRef
}
function reservationSuccess(
  kind: 'reserved' | 'replayed',
  oauthGrant: Doc<'agentAccessOAuthGrants'>,
  admission: AuthorityConsequenceAdmission,
) {
  if (admission.descriptor === undefined) throw new Error('agent_access_consequence_descriptor_missing')
  return {
    kind,
    grantRef: oauthGrant.grantRef,
    grantRevision: oauthGrant.revision,
    commandDigest: admission.descriptor.commandDigest,
    correlationRef: admission.correlationRef,
  }
}
function consentReservationRef(grantRef: string, expectedRevision: number): string {
  return `oauth:grant:${grantRef}:reserve:${expectedRevision}`
}

function validGrantRef(value: string): boolean {
  return /^(?:device|authorization):[A-Za-z0-9_-]{1,128}$/u.test(value)
}

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1
}
