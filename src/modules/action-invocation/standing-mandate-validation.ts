import { z } from 'zod'

const nonEmpty = z.string().trim().min(1)
const positiveSafeInteger = z.number().int().safe().positive()
const nonNegativeSafeInteger = z.number().int().safe().nonnegative()
const isoTimestamp = z.iso.datetime({ offset: true })
const currency = z.string().regex(/^[A-Z]{3}$/)
const digest = nonEmpty

const actionIdentity = z.strictObject({
  id: nonEmpty,
  version: nonEmpty,
})

const money = z.strictObject({
  amountMinor: nonNegativeSafeInteger,
  currency,
})

const exposureOffsetRuleIdentity = z.strictObject({
  evidenceRuleRef: nonEmpty,
  source: nonEmpty,
  version: nonEmpty,
})

const verificationKey = z.strictObject({
  keyId: nonEmpty,
  publicKey: z.string().regex(/^[0-9a-f]{64}$/),
})

const standingMandateScope = z.strictObject({
  objective: nonEmpty,
  action: actionIdentity,
  actions: z.array(actionIdentity).min(1).optional(),
  providerRefs: z.array(nonEmpty).min(1),
  recipientRefs: z.array(nonEmpty).min(1),
  purposes: z.array(nonEmpty).min(1),
  allowedDataFields: z.array(nonEmpty).min(1),
  maximumSpend: money,
  maximumActionCount: positiveSafeInteger,
  maximumConcurrentReservations: positiveSafeInteger,
  startsAt: isoTimestamp,
  expiresAt: isoTimestamp,
  permittedFallbacks: z.array(nonEmpty).min(1),
  riskCeiling: nonEmpty,
  maximumLoss: money.optional(),
  exposureOffsetRules: z.array(exposureOffsetRuleIdentity).optional(),
  exposureOffsetVerificationKeys: z.array(verificationKey).optional(),
})

const mandateInput = z.strictObject({
  mode: z.enum(['bounded_mandate', 'full_yolo']).optional(),
  mandateRef: nonEmpty,
  version: positiveSafeInteger,
  generation: positiveSafeInteger,
  grantorRef: nonEmpty,
  principalRef: nonEmpty,
  delegateRef: nonEmpty,
  callerRef: nonEmpty,
  scope: standingMandateScope,
  issuedAt: isoTimestamp,
}).superRefine((input, context) => {
  const mode = input.mode ?? 'bounded_mandate'
  const actions = input.scope.actions ?? [input.scope.action]
  if (Date.parse(input.scope.startsAt) >= Date.parse(input.scope.expiresAt)) {
    context.addIssue({ code: 'custom', message: 'validity_window_invalid', path: ['scope', 'expiresAt'] })
  }
  if (new Set(actions.map((action) => `${action.id}:${action.version}`)).size !== actions.length) {
    context.addIssue({ code: 'custom', message: 'duplicate_action', path: ['scope', 'actions'] })
  }
  if ((input.scope.exposureOffsetRules?.length ?? 0) > 0
    && (input.scope.exposureOffsetVerificationKeys?.length ?? 0) === 0) {
    context.addIssue({ code: 'custom', message: 'offset_verification_key_required', path: ['scope'] })
  }
  if (mode === 'bounded_mandate' && (
    actions.length !== 1
    || actions[0]?.id !== input.scope.action.id
    || actions[0]?.version !== input.scope.action.version
  )) {
    context.addIssue({ code: 'custom', message: 'bounded_action_scope_invalid', path: ['scope', 'actions'] })
  }
  if (mode === 'full_yolo') {
    if (input.scope.actions === undefined) {
      context.addIssue({ code: 'custom', message: 'actions_required', path: ['scope', 'actions'] })
    }
    if (input.scope.maximumLoss === undefined) {
      context.addIssue({ code: 'custom', message: 'maximum_loss_required', path: ['scope', 'maximumLoss'] })
    } else if (input.scope.maximumLoss.currency !== input.scope.maximumSpend.currency) {
      context.addIssue({ code: 'custom', message: 'currency_mismatch', path: ['scope', 'maximumLoss'] })
    }
  }
})

const revoked = z.union([
  z.literal(false),
  z.strictObject({ reason: nonEmpty, revokedAt: isoTimestamp }),
])

const standingMandate = z.strictObject({
  format: z.literal('ae.action-invocation-standing-mandate:v1'),
  mode: z.enum(['bounded_mandate', 'full_yolo']),
  mandateRef: nonEmpty,
  version: positiveSafeInteger,
  generation: positiveSafeInteger,
  grantorRef: nonEmpty,
  principalRef: nonEmpty,
  delegateRef: nonEmpty,
  callerRef: nonEmpty,
  scope: standingMandateScope,
  issuedAt: isoTimestamp,
  revoked,
  digest,
}).superRefine((input, context) => {
  const result = mandateInput.safeParse({
    mode: input.mode,
    mandateRef: input.mandateRef,
    version: input.version,
    generation: input.generation,
    grantorRef: input.grantorRef,
    principalRef: input.principalRef,
    delegateRef: input.delegateRef,
    callerRef: input.callerRef,
    scope: input.scope,
    issuedAt: input.issuedAt,
  })
  for (const issue of result.success ? [] : result.error.issues) {
    context.addIssue({ code: 'custom', message: issue.message, path: issue.path })
  }
})

const authorityUseMaterial = z.strictObject({
  authorityUseRef: nonEmpty,
  mandateRef: nonEmpty,
  mandateVersion: positiveSafeInteger,
  mandateGeneration: positiveSafeInteger,
  callerRef: nonEmpty,
  principalRef: nonEmpty,
  delegateRef: nonEmpty,
  invocationRef: nonEmpty,
  action: actionIdentity,
  preparedMaterialDigest: nonEmpty,
  providerRef: nonEmpty,
  recipientRef: nonEmpty,
  purpose: nonEmpty,
  dataFields: z.array(nonEmpty).min(1),
  reservedSpend: money,
  reservedLoss: money.optional(),
  fallbackRef: nonEmpty.nullable(),
  risk: nonEmpty,
  effectGeneration: positiveSafeInteger,
  policyDecisionRef: nonEmpty.optional(),
})

const authorityUse = authorityUseMaterial.extend({
  state: z.enum(['reserved', 'not_released', 'released', 'uncertain']),
  reservedAt: isoTimestamp,
  settledAt: isoTimestamp.optional(),
  digest,
}).strict()

const policyProposal = z.strictObject({
  objectiveRef: nonEmpty,
  objective: nonEmpty,
  sourceOptionRef: nonEmpty,
  materialDigest: nonEmpty,
  authorityUseRef: nonEmpty,
  invocationRef: nonEmpty,
  action: actionIdentity,
  providerRef: nonEmpty,
  recipientRef: nonEmpty,
  purpose: nonEmpty,
  dataFields: z.array(nonEmpty).min(1),
  spend: money,
  worstCaseLoss: money,
  fallbackRef: nonEmpty,
  risk: nonEmpty,
})

const capacity = z.strictObject({
  consumedCount: nonNegativeSafeInteger,
  reservedCount: nonNegativeSafeInteger,
  committedSpendMinor: nonNegativeSafeInteger,
  heldWorstCaseLossMinor: nonNegativeSafeInteger,
})

const policyDecision = z.strictObject({
  policyDecisionRef: nonEmpty,
  policy: z.literal('exact_scope_and_worst_case_loss:v1'),
  objectiveRef: nonEmpty,
  mandateRef: nonEmpty,
  mandateVersion: positiveSafeInteger,
  mandateGeneration: positiveSafeInteger,
  proposal: policyProposal,
  capacity,
  fallbackOrdinal: nonNegativeSafeInteger,
  heldWorstCaseLossMinor: nonNegativeSafeInteger,
  proposedWorstCaseLossMinor: nonNegativeSafeInteger,
  maximumLossMinor: nonNegativeSafeInteger,
  accepted: z.literal(true),
  digest,
})

// Grant and offset cryptographic semantics remain owned by their existing verifiers.
// These schemas reject malformed scalar material before those verifiers run.
const grant = z.strictObject({
  format: z.literal('ae.verified-standing-mandate-grant:v1'),
  evidenceRef: nonEmpty,
  verifierRef: nonEmpty,
  source: nonEmpty,
  environment: z.literal('MOCK/DEVELOPMENT ONLY'),
  mandateRef: nonEmpty,
  mandateVersion: positiveSafeInteger,
  mandateGeneration: positiveSafeInteger,
  grantorRef: nonEmpty,
  principalRef: nonEmpty,
  delegateRef: nonEmpty,
  callerRef: nonEmpty,
  scopeDigest: nonEmpty,
  mandateDigest: nonEmpty,
  issuedAt: isoTimestamp,
  verifiedAt: isoTimestamp,
  freshUntil: isoTimestamp,
  authenticated: z.literal(true),
  cryptographicResult: z.literal('valid'),
  digest,
})

const exposureOffset = z.strictObject({
  authorityUseRef: nonEmpty,
  offsetAuthorityUseRef: nonEmpty,
  mandateRef: nonEmpty,
  mandateVersion: positiveSafeInteger,
  mandateGeneration: positiveSafeInteger,
  principalRef: nonEmpty,
  providerRef: nonEmpty,
  exposureAction: actionIdentity,
  offsetAction: actionIdentity,
  exposureSubjectRef: nonEmpty,
  exposureResultRef: nonEmpty,
  exposureEvidenceRef: nonEmpty,
  offsetSubjectRef: nonEmpty,
  offsetResultRef: nonEmpty,
  offsetEvidenceRef: nonEmpty,
  amountMinor: nonNegativeSafeInteger,
  currency,
  evidenceRuleRef: nonEmpty,
  evidenceRuleSource: nonEmpty,
  evidenceRuleVersion: nonEmpty,
  releaseAttestation: z.unknown(),
  offsetGeneration: z.literal(1),
  recordedAt: isoTimestamp,
  digest,
})

const standingMandateSnapshot = z.strictObject({
  format: z.literal('ae.action-invocation-standing-mandate-store:v1'),
  mandates: z.array(standingMandate),
  grants: z.array(grant),
  uses: z.array(authorityUse),
  exposureOffsets: z.array(exposureOffset).optional(),
  policyDecisions: z.array(policyDecision).optional(),
})

export function parseStandingMandateInput(input: unknown) {
  return mandateInput.safeParse(input)
}

export function standingMandateMaterialValid(input: unknown): boolean {
  return standingMandate.safeParse(input).success
}

export function authorityUseMaterialValid(input: unknown): boolean {
  return authorityUseMaterial.safeParse(input).success
}

export function persistedAuthorityUseMaterialValid(input: unknown): boolean {
  return authorityUse.safeParse(input).success
}

export function policyProposalMaterialValid(input: unknown): boolean {
  return policyProposal.safeParse(input).success
}

export function policyDecisionMaterialValid(input: unknown): boolean {
  return policyDecision.safeParse(input).success
}

export function verifiedGrantMaterialValid(input: unknown): boolean {
  return grant.safeParse(input).success
}

export function exposureOffsetMaterialValid(input: unknown): boolean {
  return exposureOffset.safeParse(input).success
}

export function parseStandingMandateSnapshot(input: unknown) {
  return standingMandateSnapshot.safeParse(input)
}

export function isoTimestampValid(input: unknown): input is string {
  return isoTimestamp.safeParse(input).success
}
