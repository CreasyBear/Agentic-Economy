import type { MutationCtx } from '../../../_generated/server'
import { v } from 'convex/values'

const STRICT_PROOF_MAX_AGE_MINUTES = 10
const MINUTE_MS = 60_000

export type ClerkFactorEvidence = Readonly<{
  firstFactorAgeMinutes: number
  secondFactorAgeMinutes: number
}>

export type ClerkConsequenceProofInput = ClerkFactorEvidence & Readonly<{
  reverificationId: string
}>

export const clerkConsequenceProofValue = v.object({
  reverificationId: v.string(),
  firstFactorAgeMinutes: v.number(),
  secondFactorAgeMinutes: v.number(),
})

export type ClerkMfaConsequenceProofInput = ClerkConsequenceProofInput & Readonly<{
  subject: string
  evidenceObservedAt: number
}>
export const clerkMfaConsequenceProofValue = clerkConsequenceProofValue.extend({
  subject: v.string(),
  evidenceObservedAt: v.number(),
})

export function isValidClerkMfaEvidence(
  proof: ClerkConsequenceProofInput,
  subject: string,
): proof is ClerkMfaConsequenceProofInput {
  return isValidClerkFactorEvidence(proof)
    && proof.secondFactorAgeMinutes >= 0
    && 'subject' in proof && proof.subject === subject && subject.length > 0
    && 'evidenceObservedAt' in proof && typeof proof.evidenceObservedAt === 'number'
    && Number.isSafeInteger(proof.evidenceObservedAt) && proof.evidenceObservedAt > 0
}

/** Call only after verifying the exact command's source-write envelope. Requires
 * the original authenticated Clerk subject, not a canonical-account proxy.
 * Ensures both factors remain fresh from the signed JWT issue time; missing,
 * first-factor-only, wrong-user or stale evidence never grants authority. */
export function deriveMfaConsequenceProof(input: Readonly<{
  proof: ClerkConsequenceProofInput
  subject: string
  now: number
}>): ReturnType<typeof deriveStrictConsequenceProof> {
  if (!isValidClerkMfaEvidence(input.proof, input.subject)
    || !Number.isSafeInteger(input.now)
    || input.proof.evidenceObservedAt > input.now + 5_000) {
    return { kind: 'refused', code: 'reauthentication_required' }
  }
  const age = Math.max(input.proof.firstFactorAgeMinutes, input.proof.secondFactorAgeMinutes)
  if (age >= STRICT_PROOF_MAX_AGE_MINUTES) return { kind: 'refused', code: 'proof_stale' }
  const verifiedAt = input.proof.evidenceObservedAt - age * MINUTE_MS
  const expiresAt = verifiedAt + STRICT_PROOF_MAX_AGE_MINUTES * MINUTE_MS
  if (expiresAt <= input.now) return { kind: 'refused', code: 'proof_stale' }
  return { kind: 'ok', proof: {
    reverificationId: input.proof.reverificationId,
    factorEvidence: {
      firstFactorAgeMinutes: input.proof.firstFactorAgeMinutes,
      secondFactorAgeMinutes: input.proof.secondFactorAgeMinutes,
    },
    verifiedAt,
    expiresAt,
  } }
}

export type StrictConsequenceProof = Readonly<{
  reverificationId: string
  factorEvidence: ClerkFactorEvidence
  verifiedAt: number
  expiresAt: number
}>

export type ConsequenceProofUse = Readonly<{
  reverificationId: string
  actorPrincipalRef: string
  activeAccountRef: string
  commandDigest: string
  proof: StrictConsequenceProof
  correlationRef: string
  idempotencyRef: string
}>

export type ConsequenceProofUseResult =
  | Readonly<{ kind: 'consumed'; proof: StrictConsequenceProof }>
  | Readonly<{ kind: 'replayed'; proof: StrictConsequenceProof }>
  | Readonly<{ kind: 'refused'; code: 'proof_replayed' | 'command_changed' }>

export function deriveStrictConsequenceProof(
  input: Readonly<{
    reverificationId: string
    firstFactorAgeMinutes: number
    secondFactorAgeMinutes: number
    now: number
  }>,
): Readonly<
  | { kind: 'ok'; proof: StrictConsequenceProof }
  | { kind: 'refused'; code: 'reauthentication_required' | 'proof_stale' }
> {
  if (!isValidClerkFactorEvidence(input)) {
    return { kind: 'refused', code: 'reauthentication_required' }
  }
  const effectiveAgeMinutes = input.secondFactorAgeMinutes >= 0
    ? input.secondFactorAgeMinutes
    : input.firstFactorAgeMinutes
  const verifiedAt = input.now - effectiveAgeMinutes * MINUTE_MS
  const expiresAt = verifiedAt + STRICT_PROOF_MAX_AGE_MINUTES * MINUTE_MS
  if (expiresAt <= input.now) return { kind: 'refused', code: 'proof_stale' }
  return {
    kind: 'ok',
    proof: {
      reverificationId: input.reverificationId,
      factorEvidence: {
        firstFactorAgeMinutes: input.firstFactorAgeMinutes,
        secondFactorAgeMinutes: input.secondFactorAgeMinutes,
      },
      verifiedAt,
      expiresAt,
    },
  }
}

export function isValidClerkFactorEvidence(input: Readonly<{
  reverificationId: string
  firstFactorAgeMinutes: number
  secondFactorAgeMinutes: number
}>): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(input.reverificationId)
    && Number.isSafeInteger(input.firstFactorAgeMinutes)
    && Number.isSafeInteger(input.secondFactorAgeMinutes)
    && input.firstFactorAgeMinutes >= 0
    && input.secondFactorAgeMinutes >= -1
}

/** Requires authenticated evidence and effect preconditions checked by the caller.
 * Ensures one proof belongs to one actor, Account, command and idempotency key;
 * only that same operation may replay it. The caller must commit consumption
 * and the consequence in the same mutation so failures roll back both. */
export async function consumeConsequenceProof(
  ctx: Pick<MutationCtx, 'db'>,
  input: ConsequenceProofUse,
): Promise<ConsequenceProofUseResult> {
  const existing = await ctx.db.query('consequenceProofUses')
    .withIndex('by_reverificationId', (query) => query.eq('reverificationId', input.reverificationId))
    .unique()
  if (existing !== null) {
    if (existing.actorPrincipalRef !== input.actorPrincipalRef
      || existing.activeAccountRef !== input.activeAccountRef) {
      return { kind: 'refused', code: 'proof_replayed' }
    }
    if (existing.commandDigest !== input.commandDigest || existing.idempotencyRef !== input.idempotencyRef) {
      return { kind: 'refused', code: 'command_changed' }
    }
    return {
      kind: 'replayed',
      proof: {
        reverificationId: existing.reverificationId,
        factorEvidence: existing.factorEvidence,
        verifiedAt: existing.verifiedAt,
        expiresAt: existing.expiresAt,
      },
    }
  }
  await ctx.db.insert('consequenceProofUses', {
    reverificationId: input.reverificationId,
    actorPrincipalRef: input.actorPrincipalRef,
    activeAccountRef: input.activeAccountRef,
    commandDigest: input.commandDigest,
    proofPreset: 'strict',
    factorEvidence: input.proof.factorEvidence,
    verifiedAt: input.proof.verifiedAt,
    expiresAt: input.proof.expiresAt,
    correlationRef: input.correlationRef,
    idempotencyRef: input.idempotencyRef,
  })
  return { kind: 'consumed', proof: input.proof }
}
