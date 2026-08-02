import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'

const nonEmpty = z.string().trim().min(1).max(200)
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/)

function dateOnlyEpoch(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.toISOString().slice(0, 10) === value ? date.getTime() : undefined
}

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => dateOnlyEpoch(value) !== undefined, {
  message: 'date must be a real calendar date',
})

export const externalRunEvidenceClassValues = ['sandbox', 'hosted', 'provider', 'customer', 'payment'] as const
export const externalRunEvidenceClassSchema = z.enum(externalRunEvidenceClassValues)
export type ExternalRunEvidenceClass = z.infer<typeof externalRunEvidenceClassSchema>

export const externalRunEvidenceSignalValues = [
  'decision_ready_within_24h',
  'blind_preference',
  'provider_backed_completion',
  'customer_accepted_next_step',
  'refusal_unknown',
  'false_success_claim',
  'false_fulfilment_claim',
  'false_payment_claim',
  'operator_touch_count',
  'signed_paid_pilot',
  'settled_real_payment',
  'contribution_margin_minor',
] as const
export const externalRunEvidenceSignalSchema = z.enum(externalRunEvidenceSignalValues)
export type ExternalRunEvidenceSignal = z.infer<typeof externalRunEvidenceSignalSchema>

const evidenceValue = z.union([
  z.boolean(),
  z.number().finite(),
  z.string().trim().min(1).max(80),
])

export const externalRunEvidenceInputSchema = z.strictObject({
  evidenceRef: nonEmpty,
  startRef: nonEmpty,
  evidenceClass: externalRunEvidenceClassSchema,
  providerRef: nonEmpty.optional(),
  signal: externalRunEvidenceSignalSchema,
  value: evidenceValue,
  observedAt: z.number().finite().nonnegative(),
})
export type ExternalRunEvidenceInput = z.infer<typeof externalRunEvidenceInputSchema>

export const externalRunEvidenceSchema = externalRunEvidenceInputSchema.extend({
  format: z.literal('ae.external-run-evidence:v1'),
  digest,
})
export type ExternalRunEvidence = z.infer<typeof externalRunEvidenceSchema>

export const externalRunStartCandidateSchema = z.strictObject({
  startRef: nonEmpty,
  startedAt: z.number().finite().nonnegative(),
  basOutcome: z.enum(['current', 'overdue']),
  attribution: z.strictObject({
    channel: nonEmpty,
    campaign: nonEmpty.optional(),
  }),
  consentAccepted: z.boolean(),
  providerRef: nonEmpty,
  independentProviderRef: nonEmpty,
})
export type ExternalRunStartCandidate = z.infer<typeof externalRunStartCandidateSchema>

export const externalRunAdmittedStartSchema = externalRunStartCandidateSchema.extend({
  format: z.literal('ae.external-run-start:v1'),
  runId: nonEmpty,
  admittedAt: z.number().finite().nonnegative(),
  digest,
})
export type ExternalRunAdmittedStart = z.infer<typeof externalRunAdmittedStartSchema>

export const externalRunManifestInputSchema = z.strictObject({
  runId: nonEmpty,
  window: z.strictObject({
    startsOn: dateOnly,
    endsOn: dateOnly,
  }),
  providerRefs: z.array(nonEmpty).min(3).max(32),
  independentProviderRefs: z.array(nonEmpty).min(3).max(32),
  requiresSettledPayment: z.boolean(),
})
export type ExternalRunManifestInput = z.infer<typeof externalRunManifestInputSchema>

export const FROZEN_EXTERNAL_RUN_THRESHOLDS = deepFreeze({
  decisionReadyWithin24hMinimumRate: 0.75,
  blindPreferenceMinimumRate: 0.6,
  completionMinimumRate: 0.5,
  falseSuccessClaimsMaximum: 0,
  falseFulfilmentClaimsMaximum: 0,
  falsePaymentClaimsMaximum: 0,
  refusalUnknownMaximumRate: 0.25,
  operatorTouchesMedianMaximum: 1,
  operatorTouchesP90Maximum: 3,
  signedPaidPilotsMinimum: 2,
  settledRealPaymentsMinimum: 1,
  contributionMarginMinorMinimumExclusive: 0,
} as const)

const inclusion = deepFreeze({
  jurisdiction: 'AU' as const,
  wedge: 'bas_quarter' as const,
  eligibleBasOutcomes: ['current', 'overdue'] as const,
  attributionRequired: true as const,
  consentRequired: true as const,
})

export const externalRunManifestSchema = z.strictObject({
  format: z.literal('ae.external-run-manifest:v1'),
  runId: nonEmpty,
  window: z.strictObject({
    startsOn: dateOnly,
    endsOn: dateOnly,
  }),
  cohort: z.strictObject({
    admittedStarts: z.literal(12),
    minimumIndependentProviders: z.literal(3),
  }),
  providerRefs: z.array(nonEmpty).min(3).max(32),
  independentProviderRefs: z.array(nonEmpty).min(3).max(32),
  inclusion: z.strictObject({
    jurisdiction: z.literal('AU'),
    wedge: z.literal('bas_quarter'),
    eligibleBasOutcomes: z.tuple([z.literal('current'), z.literal('overdue')]),
    attributionRequired: z.literal(true),
    consentRequired: z.literal(true),
  }),
  thresholds: z.strictObject({
    decisionReadyWithin24hMinimumRate: z.literal(0.75),
    blindPreferenceMinimumRate: z.literal(0.6),
    completionMinimumRate: z.literal(0.5),
    falseSuccessClaimsMaximum: z.literal(0),
    falseFulfilmentClaimsMaximum: z.literal(0),
    falsePaymentClaimsMaximum: z.literal(0),
    refusalUnknownMaximumRate: z.literal(0.25),
    operatorTouchesMedianMaximum: z.literal(1),
    operatorTouchesP90Maximum: z.literal(3),
    signedPaidPilotsMinimum: z.literal(2),
    settledRealPaymentsMinimum: z.literal(1),
    contributionMarginMinorMinimumExclusive: z.literal(0),
  }),
  requiresSettledPayment: z.boolean(),
  state: z.literal('frozen'),
  createdBy: nonEmpty,
  createdAt: z.number().finite().nonnegative(),
  frozenAt: z.number().finite().nonnegative(),
  digest,
})
export type ExternalRunManifest = z.infer<typeof externalRunManifestSchema>

export type ExternalRunAdmissionRefusal =
  | 'manifest_not_frozen'
  | 'candidate_invalid'
  | 'consent_required'
  | 'attribution_required'
  | 'outside_window'
  | 'bas_outcome_not_eligible'
  | 'provider_not_declared'
  | 'provider_independence_missing'

export type ExternalRunAdmission =
  | Readonly<{ kind: 'accepted'; start: ExternalRunAdmittedStart }>
  | Readonly<{ kind: 'refused'; reason: ExternalRunAdmissionRefusal }>

export function createExternalRunManifest(
  input: ExternalRunManifestInput,
  now: number,
  createdBy: string,
): ExternalRunManifest {
  const parsed = externalRunManifestInputSchema.parse(input)
  const startsOn = dateOnlyEpoch(parsed.window.startsOn)
  const endsOn = dateOnlyEpoch(parsed.window.endsOn)
  if (startsOn === undefined || endsOn === undefined || endsOn - startsOn !== 30 * 24 * 60 * 60 * 1_000) {
    throw new Error('external_run_window_must_be_30_calendar_days')
  }
  const providerRefs = [...new Set(parsed.providerRefs)]
  const independentProviderRefs = [...new Set(parsed.independentProviderRefs)]
  if (providerRefs.length < 3 || independentProviderRefs.length < 3) throw new Error('external_run_independent_provider_count_invalid')
  const actorRef = nonEmpty.parse(createdBy)
  const material = {
    format: 'ae.external-run-manifest:v1' as const,
    runId: parsed.runId,
    window: parsed.window,
    cohort: {
      admittedStarts: 12 as const,
      minimumIndependentProviders: 3 as const,
    },
    providerRefs,
    independentProviderRefs,
    inclusion,
    thresholds: FROZEN_EXTERNAL_RUN_THRESHOLDS,
    requiresSettledPayment: parsed.requiresSettledPayment,
    state: 'frozen' as const,
    createdBy: actorRef,
    createdAt: now,
    frozenAt: now,
  }
  const { createdAt: _createdAt, frozenAt: _frozenAt, ...digestMaterial } = material
  const manifest = {
    ...material,
    digest: canonicalDigest(digestMaterial),
  }
  return deepFreeze(externalRunManifestSchema.parse(manifest))
}

export function externalRunManifestIntegrityValid(manifest: ExternalRunManifest): boolean {
  const { digest: storedDigest, createdAt: _createdAt, frozenAt: _frozenAt, ...digestMaterial } = manifest
  return storedDigest === canonicalDigest(digestMaterial)
}
export function externalRunAdmittedStartIntegrityValid(start: ExternalRunAdmittedStart): boolean {
  const { digest: storedDigest, ...material } = start
  return storedDigest === canonicalDigest(material)
}

export function admitBasStart(
  manifest: ExternalRunManifest,
  candidate: ExternalRunStartCandidate,
  admittedAt: number,
): ExternalRunAdmission {
  if (manifest.state !== 'frozen' || !externalRunManifestIntegrityValid(manifest)) {
    return { kind: 'refused', reason: 'manifest_not_frozen' }
  }
  const parsed = externalRunStartCandidateSchema.safeParse(candidate)
  if (!parsed.success) return { kind: 'refused', reason: 'candidate_invalid' }
  if (!parsed.data.consentAccepted) return { kind: 'refused', reason: 'consent_required' }
  if (parsed.data.attribution.channel.trim().length === 0) return { kind: 'refused', reason: 'attribution_required' }
  if (parsed.data.basOutcome !== 'current' && parsed.data.basOutcome !== 'overdue') {
    return { kind: 'refused', reason: 'bas_outcome_not_eligible' }
  }
  const startsOn = dateOnlyEpoch(manifest.window.startsOn)
  const endsOn = dateOnlyEpoch(manifest.window.endsOn)
  if (startsOn === undefined || endsOn === undefined || parsed.data.startedAt < startsOn || parsed.data.startedAt >= endsOn) {
    return { kind: 'refused', reason: 'outside_window' }
  }
  if (!manifest.providerRefs.includes(parsed.data.providerRef)) {
    return { kind: 'refused', reason: 'provider_not_declared' }
  }
  if (!manifest.independentProviderRefs.includes(parsed.data.independentProviderRef)) {
    return { kind: 'refused', reason: 'provider_independence_missing' }
  }
  const material = {
    format: 'ae.external-run-start:v1' as const,
    runId: manifest.runId,
    ...parsed.data,
    admittedAt,
  }
  return {
    kind: 'accepted',
    start: deepFreeze({ ...material, digest: canonicalDigest(material) }),
  }
}

const booleanEvidenceSignals = new Set<ExternalRunEvidenceSignal>([
  'decision_ready_within_24h',
  'provider_backed_completion',
  'customer_accepted_next_step',
  'refusal_unknown',
  'false_success_claim',
  'false_fulfilment_claim',
  'false_payment_claim',
  'signed_paid_pilot',
  'settled_real_payment',
])

export function createExternalRunEvidence(input: ExternalRunEvidenceInput): ExternalRunEvidence {
  const parsed = externalRunEvidenceInputSchema.parse(input)
  if (parsed.evidenceClass === 'provider' && parsed.providerRef === undefined) throw new Error('external_run_provider_ref_required')
  if (booleanEvidenceSignals.has(parsed.signal) && typeof parsed.value !== 'boolean') throw new Error('external_run_boolean_value_required')
  if (parsed.signal === 'blind_preference' && (typeof parsed.value !== 'string' || !['ae', 'incumbent', 'tie', 'unknown'].includes(parsed.value))) {
    throw new Error('external_run_preference_value_invalid')
  }
  if (parsed.signal === 'operator_touch_count' && (typeof parsed.value !== 'number' || !Number.isSafeInteger(parsed.value) || parsed.value < 0)) {
    throw new Error('external_run_touch_value_invalid')
  }
  if (parsed.signal === 'contribution_margin_minor' && typeof parsed.value !== 'number') throw new Error('external_run_margin_value_invalid')
  const material = {
    format: 'ae.external-run-evidence:v1' as const,
    ...parsed,
  }
  return deepFreeze({ ...material, digest: canonicalDigest(material) })
}

export function externalRunEvidenceIntegrityValid(evidence: ExternalRunEvidence): boolean {
  const { digest: storedDigest, ...material } = evidence
  return storedDigest === canonicalDigest(material)
}

export function externalRunDateEpoch(value: string): number {
  const epoch = dateOnlyEpoch(value)
  if (epoch === undefined) throw new Error('external_run_date_invalid')
  return epoch
}
