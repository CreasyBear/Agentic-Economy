import { canonicalDigest } from '@/modules/common/canonical-digest'
import { deepFreeze } from '@/modules/common/deep-freeze'
import { median as esToolkitMedian, percentile as esToolkitPercentile } from 'es-toolkit/math'

import {
  externalRunAdmittedStartIntegrityValid,
  externalRunAdmittedStartSchema,
  externalRunEvidenceSchema,
  externalRunManifestIntegrityValid,
  externalRunManifestSchema,
  type ExternalRunAdmittedStart,
  type ExternalRunEvidence,
  type ExternalRunEvidenceClass,
  type ExternalRunManifest,
} from './contract'

export type ExternalRunRateMetric = Readonly<{
  numerator: number
  denominator: number
  rate: number
}>

export type ExternalRunOperatorTouchMetric = Readonly<{
  median: number | null
  p90: number | null
  observedStarts: number
  denominator: number
}>

export type ExternalRunMetrics = Readonly<{
  decisionReadyWithin24h: ExternalRunRateMetric
  blindPreference: ExternalRunRateMetric & Readonly<{ evaluable: number }>
  completion: ExternalRunRateMetric
  refusalUnknown: ExternalRunRateMetric
  falseSuccessClaims: number
  falseFulfilmentClaims: number
  falsePaymentClaims: number
  operatorTouches: ExternalRunOperatorTouchMetric
  signedPaidPilots: number
  settledRealPayments: number
  observedContributionMarginMinor: number
  independentProviderCount: number
}>

export type ExternalRunReport = Readonly<{
  format: 'ae.external-run-report:v1'
  runId: string
  manifestDigest: string
  reconciliation: Readonly<{
    expectedCohort: number
    recordedStarts: number
    missingStarts: number
    excessStarts: number
    denominator: number
    totalsReconcile: boolean
  }>
  evidenceByClass: Readonly<Record<ExternalRunEvidenceClass, number>>
  metrics: ExternalRunMetrics
  reportDigest: string
}>

export type ExternalRunGateDecision = 'PASS' | 'FAIL/KILL'

export type ExternalRunGateResult = Readonly<{
  decision: ExternalRunGateDecision
  failedGates: readonly string[]
  manifestDigest: string
  report: ExternalRunReport
}>

function rate(numerator: number, denominator: number): ExternalRunRateMetric {
  return { numerator, denominator, rate: denominator === 0 ? 0 : numerator / denominator }
}

function rateAtLeast(metric: ExternalRunRateMetric, threshold: number): boolean {
  return metric.numerator * 100 >= metric.denominator * Math.round(threshold * 100)
}

function rateAtMost(metric: ExternalRunRateMetric, threshold: number): boolean {
  return metric.numerator * 100 <= metric.denominator * Math.round(threshold * 100)
}

function finiteBoolean(rows: readonly ExternalRunEvidence[], signal: ExternalRunEvidence['signal'], evidenceClass?: ExternalRunEvidenceClass): 'yes' | 'no' | 'unknown' | 'missing' {
  const values = rows
    .filter((row) => row.signal === signal && (evidenceClass === undefined || row.evidenceClass === evidenceClass))
    .map((row) => row.value)
  if (values.length === 0) return 'missing'
  if (values.some((value) => value === 'unknown')) return 'unknown'
  const booleans = values.filter((value): value is boolean => typeof value === 'boolean')
  if (booleans.length === 0) return 'unknown'
  if (booleans.some((value) => value !== booleans[0])) return 'unknown'
  return booleans[0] ? 'yes' : 'no'
}

function preference(rows: readonly ExternalRunEvidence[]): 'ae' | 'incumbent' | 'tie' | 'unknown' | 'missing' {
  const values = rows
    .filter((row) => row.signal === 'blind_preference' && row.evidenceClass === 'customer')
    .map((row) => row.value)
  if (values.length === 0) return 'missing'
  if (values.some((value) => value === 'unknown')) return 'unknown'
  const preferences = values.filter((value): value is 'ae' | 'incumbent' | 'tie' => value === 'ae' || value === 'incumbent' || value === 'tie')
  if (preferences.length === 0 || preferences.some((value) => value !== preferences[0])) return 'unknown'
  return preferences[0] ?? 'unknown'
}

function touchCount(rows: readonly ExternalRunEvidence[]): number | undefined {
  const values = rows
    .filter((row) => row.evidenceClass === 'hosted' && row.signal === 'operator_touch_count' && typeof row.value === 'number' && row.value >= 0)
    .map((row) => row.value as number)
  if (values.length === 0 || values.some((value) => value !== values[0])) return undefined
  return values[0]
}

// Provenance: es-toolkit@1.50.0 `median` and `percentile` matched these helpers
// on the external-run fixtures (empty, twelve zero touches, and even lengths)
// and nearest-rank fractions 0, 0.2, 0.25, 0.5, 0.75, 0.9, and 1.
// Empty-array guards preserve this module's null contract.
function sortedQuantile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) return null
  return esToolkitPercentile(values, fraction * 100)
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return esToolkitMedian(values)
}

function externalRunEvidenceDigestValid(evidence: ExternalRunEvidence): boolean {
  const { digest, ...material } = evidence
  return digest === canonicalDigest(material)
}

function validateRows(manifest: ExternalRunManifest, starts: readonly ExternalRunAdmittedStart[], evidence: readonly ExternalRunEvidence[]): void {
  externalRunManifestSchema.parse(manifest)
  if (!externalRunManifestIntegrityValid(manifest)) throw new Error('external_run_manifest_digest_invalid')
  const startRefs = new Set<string>()
  const evidenceRefs = new Set<string>()
  for (const start of starts) {
    externalRunAdmittedStartSchema.parse(start)
    if (!externalRunAdmittedStartIntegrityValid(start)) throw new Error('external_run_start_digest_invalid')
    if (start.runId !== manifest.runId) throw new Error('external_run_start_run_mismatch')
    if (startRefs.has(start.startRef)) throw new Error('external_run_duplicate_start_ref')
    startRefs.add(start.startRef)
  }
  for (const item of evidence) {
    externalRunEvidenceSchema.parse(item)
    if (!startRefs.has(item.startRef)) throw new Error('external_run_evidence_start_missing')
    if (evidenceRefs.has(item.evidenceRef)) throw new Error('external_run_duplicate_evidence_ref')
    evidenceRefs.add(item.evidenceRef)
    const start = starts.find((candidate) => candidate.startRef === item.startRef)
    if (item.evidenceClass === 'provider' && item.providerRef !== start?.providerRef) throw new Error('external_run_provider_evidence_mismatch')
    if (!externalRunEvidenceDigestValid(item)) throw new Error('external_run_evidence_digest_invalid')
  }
}
function decisionReadyWithin24(rows: readonly ExternalRunEvidence[], startedAt: number): boolean {
  const readyRows = rows.filter((row) => row.signal === 'decision_ready_within_24h' && row.evidenceClass === 'hosted')
  return readyRows.length > 0
    && readyRows.every((row) => row.value === true && row.observedAt >= startedAt && row.observedAt <= startedAt + 24 * 60 * 60 * 1_000)
}
export function buildExternalRunReport(manifest: ExternalRunManifest, starts: readonly ExternalRunAdmittedStart[], evidence: readonly ExternalRunEvidence[]): ExternalRunReport {
  validateRows(manifest, starts, evidence)
  const expected = manifest.cohort.admittedStarts
  const orderedStarts = [...starts].sort((left, right) => left.startRef.localeCompare(right.startRef))
  const evidenceByStart = new Map<string, ExternalRunEvidence[]>()
  for (const item of evidence) {
    const rows = evidenceByStart.get(item.startRef) ?? []
    rows.push(item)
    evidenceByStart.set(item.startRef, rows)
  }

  const classes: Record<ExternalRunEvidenceClass, number> = { sandbox: 0, hosted: 0, provider: 0, customer: 0, payment: 0 }
  for (const item of evidence) classes[item.evidenceClass] += 1
  let decisionReadyCount = 0
  let blindPreferenceCount = 0
  let blindEvaluable = 0
  let completionCount = 0
  let unknownCount = Math.max(0, expected - orderedStarts.length)
  let falseSuccessClaims = 0
  let falseFulfilmentClaims = 0
  let falsePaymentClaims = 0
  let signedPaidPilots = 0
  let settledRealPayments = 0
  let contributionMarginMinor = 0
  const touchCounts: number[] = []
  const providerRefs = new Set<string>()

  for (let index = 0; index < expected; index += 1) {
    const start = orderedStarts[index]
    if (start === undefined) continue
    const rows = evidenceByStart.get(start.startRef) ?? []
    if (
      rows.some((row) => row.evidenceClass === 'provider' && row.providerRef === start.providerRef)
      && manifest.independentProviderRefs.includes(start.independentProviderRef)
      && start.independentProviderRef.length > 0
    ) {
      providerRefs.add(start.independentProviderRef)
    }
    if (decisionReadyWithin24(rows, start.startedAt)) decisionReadyCount += 1
    const preferenceValue = preference(rows)
    if (preferenceValue === 'ae') blindPreferenceCount += 1
    if (preferenceValue === 'ae' || preferenceValue === 'incumbent' || preferenceValue === 'tie') blindEvaluable += 1
    const providerCompletion = finiteBoolean(rows, 'provider_backed_completion', 'provider') === 'yes'
    const customerNextStep = finiteBoolean(rows, 'customer_accepted_next_step', 'customer') === 'yes'
    if (providerCompletion || customerNextStep) completionCount += 1
    const explicitUnknown = rows.some((row) => row.signal === 'refusal_unknown' && row.value === true) || rows.some((row) => row.value === 'unknown')
    if (rows.length === 0 || explicitUnknown) unknownCount += 1
    falseSuccessClaims += rows.filter((row) => row.signal === 'false_success_claim' && row.value === true).length
    falseFulfilmentClaims += rows.filter((row) => row.signal === 'false_fulfilment_claim' && row.value === true).length
    falsePaymentClaims += rows.filter((row) => row.signal === 'false_payment_claim' && row.value === true).length
    if (finiteBoolean(rows, 'signed_paid_pilot', 'customer') === 'yes') signedPaidPilots += 1
    if (finiteBoolean(rows, 'settled_real_payment', 'payment') === 'yes') settledRealPayments += 1
    const touch = touchCount(rows)
    if (touch !== undefined) touchCounts.push(touch)
    contributionMarginMinor += rows
      .filter((row) => row.signal === 'contribution_margin_minor' && row.evidenceClass === 'payment' && typeof row.value === 'number')
      .map((row) => row.value as number)
      .reduce((sum, value) => sum + value, 0)
  }

  const operatorTouches: ExternalRunOperatorTouchMetric = {
    median: touchCounts.length === expected ? median(touchCounts) : null,
    p90: touchCounts.length === expected ? sortedQuantile(touchCounts, 0.9) : null,
    observedStarts: touchCounts.length,
    denominator: expected,
  }
  const metrics: ExternalRunMetrics = {
    decisionReadyWithin24h: rate(decisionReadyCount, expected),
    blindPreference: { ...rate(blindPreferenceCount, blindEvaluable), evaluable: blindEvaluable },
    completion: rate(completionCount, expected),
    refusalUnknown: rate(unknownCount, expected),
    falseSuccessClaims,
    falseFulfilmentClaims,
    falsePaymentClaims,
    operatorTouches,
    signedPaidPilots,
    settledRealPayments,
    observedContributionMarginMinor: contributionMarginMinor,
    independentProviderCount: providerRefs.size,
  }
  const reconciliation = {
    expectedCohort: expected,
    recordedStarts: starts.length,
    missingStarts: Math.max(0, expected - starts.length),
    excessStarts: Math.max(0, starts.length - expected),
    denominator: expected,
    totalsReconcile: starts.length === expected,
  }
  const material = {
    format: 'ae.external-run-report:v1' as const,
    runId: manifest.runId,
    manifestDigest: manifest.digest,
    reconciliation,
    evidenceByClass: classes,
    metrics,
  }
  return deepFreeze({ ...material, reportDigest: canonicalDigest(material) })
}

export function computeExternalRunGate(
  manifest: ExternalRunManifest,
  starts: readonly ExternalRunAdmittedStart[],
  evidence: readonly ExternalRunEvidence[],
): ExternalRunGateResult {
  const report = buildExternalRunReport(manifest, starts, evidence)
  const failures: string[] = []
  const { metrics, reconciliation } = report
  if (!reconciliation.totalsReconcile || reconciliation.recordedStarts !== manifest.cohort.admittedStarts) {
    failures.push('cohort_size')
  }
  if (metrics.independentProviderCount < manifest.cohort.minimumIndependentProviders) failures.push('independent_provider_supply')
  if (!rateAtLeast(metrics.decisionReadyWithin24h, manifest.thresholds.decisionReadyWithin24hMinimumRate)) {
    failures.push('decision_ready_within_24h')
  }
  if (!rateAtLeast(metrics.blindPreference, manifest.thresholds.blindPreferenceMinimumRate)) failures.push('blind_preference')
  if (!rateAtLeast(metrics.completion, manifest.thresholds.completionMinimumRate)) failures.push('provider_or_customer_completion')
  if (metrics.falseSuccessClaims > manifest.thresholds.falseSuccessClaimsMaximum) failures.push('false_success_claims')
  if (metrics.falseFulfilmentClaims > manifest.thresholds.falseFulfilmentClaimsMaximum) failures.push('false_fulfilment_claims')
  if (metrics.falsePaymentClaims > manifest.thresholds.falsePaymentClaimsMaximum) failures.push('false_payment_claims')
  if (!rateAtMost(metrics.refusalUnknown, manifest.thresholds.refusalUnknownMaximumRate)) failures.push('refusal_or_unknown')
  if (metrics.operatorTouches.median === null || metrics.operatorTouches.median > manifest.thresholds.operatorTouchesMedianMaximum) {
    failures.push('operator_touch_median')
  }
  if (metrics.operatorTouches.p90 === null || metrics.operatorTouches.p90 > manifest.thresholds.operatorTouchesP90Maximum) {
    failures.push('operator_touch_p90')
  }
  if (metrics.signedPaidPilots < manifest.thresholds.signedPaidPilotsMinimum) failures.push('signed_paid_pilots')
  if (manifest.requiresSettledPayment && metrics.settledRealPayments < manifest.thresholds.settledRealPaymentsMinimum) {
    failures.push('settled_real_payment')
  }
  if (metrics.observedContributionMarginMinor <= manifest.thresholds.contributionMarginMinorMinimumExclusive) {
    failures.push('positive_contribution_margin')
  }
  return deepFreeze({
    decision: failures.length === 0 ? 'PASS' : 'FAIL/KILL',
    failedGates: failures,
    manifestDigest: manifest.digest,
    report,
  })
}

export function externalRunRateMeetsMinimum(numerator: number, denominator: number, minimumRate: number): boolean {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !Number.isFinite(minimumRate) || numerator < 0 || denominator <= 0) return false
  return numerator * 100 >= denominator * minimumRate * 100
}

export function externalRunRateMeetsMaximum(numerator: number, denominator: number, maximumRate: number): boolean {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || !Number.isFinite(maximumRate) || numerator < 0 || denominator <= 0) return false
  return numerator * 100 <= denominator * maximumRate * 100
}