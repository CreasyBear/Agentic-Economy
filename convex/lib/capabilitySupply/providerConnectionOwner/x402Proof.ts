import type { AuthorityConsequenceAdmission } from '../../../../src/modules/authority/context/public'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { admitAuthorityCredentialChangeRate } from '../../platform/rateLimit'
import {
  consumeConsequenceProof,
  deriveStrictConsequenceProof,
  isValidClerkFactorEvidence,
} from '../../authority/consequence/proof'
import {
  type ConnectX402OwnerArgs,
  type ProviderConnectionActor,
  type VerifiedConnectionSellerClaim,
} from './contracts'
import { x402ConnectionConsequenceAdmission } from './x402Admission'

function strictX402AdmissionIsValid(
  admission: AuthorityConsequenceAdmission | null,
): admission is AuthorityConsequenceAdmission & Required<Pick<AuthorityConsequenceAdmission, 'descriptor' | 'proofPolicy'>> {
  return admission !== null
    && admission.descriptor !== undefined
    && admission.proofPolicy?.kind === 'clerk_reverification'
    && admission.proofPolicy.preset === 'strict'
    && admission.proofPolicy.uniquePerCommand === true
}

async function inspectX402ProofReplay(
  ctx: MutationCtx,
  args: ConnectX402OwnerArgs,
  actor: ProviderConnectionActor,
  existing: Doc<'capabilityProviderConnections'> | null,
) {
  const proofInput = args.proof
  if (proofInput === undefined || !isValidClerkFactorEvidence(proofInput)) {
    return { kind: 'refused' as const, code: 'reauthentication_required' as const }
  }
  const existingProof = await ctx.db.query('consequenceProofUses')
    .withIndex('by_reverificationId', (query) => query.eq('reverificationId', proofInput.reverificationId))
    .unique()
  if (existingProof === null || existing?.lastCommandId !== args.commandId) {
    return { kind: 'fresh' as const, proofInput, existingProof }
  }
  if (existingProof.actorPrincipalRef !== actor.canonicalPrincipalRef
    || existingProof.activeAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused' as const, code: 'proof_replayed' as const }
  }
  return { kind: 'replay' as const }
}

async function consumeFreshX402OwnerProof(
  ctx: MutationCtx,
  input: Readonly<{
    args: ConnectX402OwnerArgs
    actor: ProviderConnectionActor
    connectionRef: string
    canonicalResourceUrl: string
    claim: VerifiedConnectionSellerClaim
    existing: Doc<'capabilityProviderConnections'> | null
    now: number
    proofInput: NonNullable<ConnectX402OwnerArgs['proof']>
    existingProof: Doc<'consequenceProofUses'> | null
  }>,
) {
  const admission = await x402ConnectionConsequenceAdmission({
    ctx,
    actor: input.actor,
    connectionRef: input.connectionRef,
    canonicalResourceUrl: input.canonicalResourceUrl,
    method: input.claim.method,
    payee: input.claim.payTo,
    observationDigest: input.claim.observationDigest,
    claimDigest: input.args.claimDigest,
    commandId: input.args.commandId,
    existing: input.existing,
    now: input.now,
  })
  if (!strictX402AdmissionIsValid(admission)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  if (input.existingProof !== null) {
    const sameActor = input.existingProof.actorPrincipalRef === admission.actorPrincipalRef
      && input.existingProof.activeAccountRef === admission.activeAccountRef
    if (!sameActor) return { kind: 'refused' as const, code: 'proof_replayed' as const }
    return {
      kind: 'refused' as const,
      code: input.existingProof.commandDigest === admission.descriptor.commandDigest
        ? 'proof_replayed' as const
        : 'command_changed' as const,
    }
  }
  const proof = deriveStrictConsequenceProof({ ...input.proofInput, now: input.now })
  if (proof.kind === 'refused') return proof
  const rate = await admitAuthorityCredentialChangeRate(ctx, admission.activeAccountRef)
  if (rate.kind === 'unavailable') {
    return {
      kind: 'refused' as const,
      code: 'security_control_unavailable' as const,
      correlationRef: input.args.correlationId,
    }
  }
  if (rate.kind === 'rate_limited') {
    return { kind: 'refused' as const, code: 'rate_limited' as const }
  }
  const consumed = await consumeConsequenceProof(ctx, {
    reverificationId: input.proofInput.reverificationId,
    actorPrincipalRef: admission.actorPrincipalRef,
    activeAccountRef: admission.activeAccountRef,
    commandDigest: admission.descriptor.commandDigest,
    proof: proof.proof,
    correlationRef: admission.correlationRef,
    idempotencyRef: admission.idempotencyRef,
  })
  return consumed.kind === 'refused' ? consumed : { kind: 'admitted' as const, proofReplay: false }
}

export async function admitX402OwnerProof(
  ctx: MutationCtx,
  input: Readonly<{
    args: ConnectX402OwnerArgs
    actor: ProviderConnectionActor
    connectionRef: string
    canonicalResourceUrl: string
    claim: VerifiedConnectionSellerClaim
    existing: Doc<'capabilityProviderConnections'> | null
    now: number
    provisionOwnerGrant: boolean
  }>,
) {
  if (!input.provisionOwnerGrant) return { kind: 'admitted' as const, proofReplay: false }
  const replay = await inspectX402ProofReplay(ctx, input.args, input.actor, input.existing)
  if (replay.kind === 'refused') return replay
  if (replay.kind === 'replay') return { kind: 'admitted' as const, proofReplay: true }
  return await consumeFreshX402OwnerProof(ctx, { ...input, ...replay })
}
