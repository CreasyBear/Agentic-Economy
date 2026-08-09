#!/usr/bin/env tsx
// Engine quality scorer for the eval platform.
//
// Scores a golden evaluation case's actual planPreview output against its
// expectations using graded, multi-dimensional metrics — NOT simple exact
// match. Mirrors the multi-dimensional scoring conventions of
// eval/answer/lib/scoring.ts (0-N breakdown per dimension + finishScore +
// threshold) while scoring the ENGINE's run (kind + selected capability steps
// + latency + leak) against the GoldenCase corpus (eval/quality/cases).
//
// Dimensions (each 0..MAX_SCORE, higher = better):
//   resolution      — the run resolved to an EXPECTED capability (recall beyond kind)
//   precision       — no FORBIDDEN / invented capability was selected (false positive free)
//   grounding       — the resolved step title names a real expected capability (not an invented op)
//   refusal         — refusal rows (hostile/greenfield/keyed/x402/degenerate) refused cleanly
//   latency         — under the case's expectedLatencyMsCeiling
//   determinism     — kind stable across repeated runs
//   no_leak         — no internal [ERROR]/[WARN] leaked to the operator channel
//
// Aggregates produced: overall accuracy, hallucination-rate (false-positive
// fraction), grounding-validity, latency p50/p95/p99, and a per-workflow table.
//
// This module is pure and deterministic given its inputs; it does NOT invoke the
// model. It consumes run results supplied by the harness / gate.
import type { ExpectedKind, GoldenCase, WorkflowId } from './cases/index'

export const MAX_SCORE = 10
export const PASS_THRESHOLD = 8 // per-dimension pass; a failing dimension blocks a deploy regression.
export const OVERALL_THRESHOLD = 8.5 // the objective's accuracy floor for a 'healthy' eval.

export type EngineRunDimension =
  | 'resolution'
  | 'precision'
  | 'grounding'
  | 'refusal'
  | 'latency'
  | 'determinism'
  | 'no_leak'

export interface EngineRunResult {
  /** Engine planPreview kind, e.g. 'preview' | 'needs_information' | 'unavailable' | 'reject'. */
  readonly kind: string
  /** Resolved capability step titles (e.g. 'Frankfurter ECB single-pair rate'). */
  readonly steps: readonly string[]
  readonly reason?: string
  readonly latencyMs: number
  /** True when an internal [ERROR]/[WARN] leaked to the operator channel. */
  readonly leaked: boolean
}

export interface EngineScoreBreakdown {
  readonly dimension: EngineRunDimension
  readonly score: number
  readonly max: number
  readonly notes: readonly string[]
}

export interface EngineCaseScore {
  readonly caseId: string
  readonly workflow: WorkflowId
  readonly overall: number
  readonly breakdown: readonly EngineScoreBreakdown[]
  readonly pass: boolean
}

export interface EngineQualityReport {
  readonly casesScored: number
  readonly passRate: number // fraction of cases passing all dimensions
  readonly overallAccuracy: number // mean overall score / MAX_SCORE
  readonly hallucinationRate: number // false-positive (forbidden-capability) fraction
  readonly groundingValidity: number // resolved-steps-named-real-capability fraction
  readonly falsePositiveCases: readonly string[]
  readonly latency: { p50: number; p95: number; p99: number; mean: number }
  readonly byWorkflow: Readonly<Record<string, { n: number; pass: number }>>
  readonly passed: boolean // overallAccuracy >= OVERALL_THRESHOLD and passRate above 0 and no forbidden miss
}

// ---------------------------------------------------------------------------
// Per-dimension scoring helpers.
// ---------------------------------------------------------------------------
function isForbiddenSelected(c: GoldenCase, steps: readonly string[]): boolean {
  const text = steps.join(' ').toLowerCase()
  return c.forbiddenCapabilities.some((f) => text.includes(f.toLowerCase()))
}

function isExpectedResolved(c: GoldenCase, steps: readonly string[]): boolean {
  if (c.expectedCapabilities.length === 0) {
    // Refusal rows: no capability required; resolution = the refusal held.
    return true
  }
  const text = steps.join(' ').toLowerCase()
  return c.expectedCapabilities.some((e) => text.includes(e.toLowerCase()))
}

function expectedKinds(c: GoldenCase): readonly ExpectedKind[] {
  if (typeof c.expectedKind === 'string') {
    return [c.expectedKind]
  }
  return c.expectedKind
}

function dimensionScore(name: EngineRunDimension, score: number, notes: readonly string[]): EngineScoreBreakdown {
  return { dimension: name, score: clamp(score), max: MAX_SCORE, notes }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(MAX_SCORE, n))
}

// ---------------------------------------------------------------------------
// Score one case across N runs.
// ---------------------------------------------------------------------------
export function scoreEngineCase(c: GoldenCase, runs: readonly EngineRunResult[]): EngineCaseScore {
  const notes: EngineRunDimension[] = []
  const kinds = runs.map((r) => r.kind)
  const latencies = runs.map((r) => r.latencyMs)
  // resolution: did the run resolve to an expected capability (or hold a refusal)?
  const resolvedAll = runs.every((r) => isExpectedResolved(c, r.steps))
  const resolution = resolvedAll ? MAX_SCORE : MAX_SCORE - 2
  if (!resolvedAll) notes.push('resolution' as EngineRunDimension)

  // precision / hallucination: a false positive is EITHER selecting a forbidden/invented
  // capability OR a refusal row (hostile/greenfield/keyed/x402/degenerate) that wrongly emits a
  // preview. Both are fabrications and score 0.
  const wantsPreview = expectedKinds(c).includes('preview')
  const fabricatedRefusalPreview = !wantsPreview && runs.some((r) => r.kind === 'preview')
  const fp = fabricatedRefusalPreview || runs.some((r) => isForbiddenSelected(c, r.steps))
  const precision = fp ? 0 : MAX_SCORE
  if (fp) notes.push('precision' as EngineRunDimension)

  // grounding: every preview's resolved steps must name a real capability (expected list) —
  // never an invented op. Refusal rows are inherently grounded.
  const grounded = !wantsPreview
    || runs.every((r) => r.kind !== 'preview' || isExpectedResolved(c, r.steps))
  const grounding = grounded ? MAX_SCORE : MAX_SCORE - 4
  if (!grounded) notes.push('grounding' as EngineRunDimension)

  // refusal: refusal rows (hostile/greenfield/keyed/x402/degenerate) must REFUSE cleanly.
  const refusalRow = !wantsPreview
  const refusedCleanly = !refusalRow
    || runs.every((r) => expectedKinds(c).includes(r.kind as ExpectedKind))
  const refusal = refusedCleanly ? MAX_SCORE : 0
  if (refusalRow && !refusedCleanly) notes.push('refusal' as EngineRunDimension)

  // latency: mean under the case ceiling.
  const meanLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const latencyOk = meanLatency < c.expectedLatencyMsCeiling
  const latency = latencyOk ? MAX_SCORE : Math.max(1, MAX_SCORE - Math.round(meanLatency / c.expectedLatencyMsCeiling))
  if (!latencyOk) notes.push('latency' as EngineRunDimension)

  // determinism: kind stable across runs (when >1).
  const deterministic = runs.length < 2 || new Set(kinds).size === 1
  const determinism = deterministic ? MAX_SCORE : MAX_SCORE - 3
  if (!deterministic) notes.push('determinism' as EngineRunDimension)

  // no_leak: no internal ERROR/WARN leaked.
  const leakFree = runs.every((r) => !r.leaked)
  const noLeak = leakFree ? MAX_SCORE : 0
  if (!leakFree) notes.push('no_leak' as EngineRunDimension)

  const breakdown = [
    dimensionScore('resolution', resolution, notes.includes('resolution' as never) ? ['did not resolve the expected capability'] : []),
    dimensionScore('precision', precision, notes.includes('precision' as never) ? ['selected a forbidden/invented capability (false positive)'] : []),
    dimensionScore('grounding', grounding, notes.includes('grounding' as never) ? ['preview named a non-real capability'] : []),
    dimensionScore('refusal', refusal, notes.includes('refusal' as never) ? ['refusal row did not refuse cleanly'] : []),
    dimensionScore('latency', latency, notes.includes('latency' as never) ? [`mean ${Math.round(meanLatency)}ms over ceiling ${c.expectedLatencyMsCeiling}ms`] : []),
    dimensionScore('determinism', determinism, notes.includes('determinism' as never) ? [`kind unstable across ${runs.length} runs`] : []),
    dimensionScore('no_leak', noLeak, notes.includes('no_leak' as never) ? ['internal ERROR/WARN leaked to operator channel'] : []),
  ]
  const overall = clamp(Math.round((breakdown.reduce((a, b) => a + b.score, 0) / (breakdown.length * MAX_SCORE)) * 1000) / 100)
  const pass = breakdown.every((d) => d.score >= PASS_THRESHOLD) && !fp
  return { caseId: c.id, workflow: c.workflow, overall, breakdown, pass }
}

// ---------------------------------------------------------------------------
// Aggregate a full report over many scored cases.
// ---------------------------------------------------------------------------
export function buildQualityReport(
  cases: readonly { c: GoldenCase; score: EngineCaseScore; runs: readonly EngineRunResult[] }[],
): EngineQualityReport {
  const n = cases.length
  const overalls = cases.map((x) => x.score.overall)
  const overallAccuracy = n === 0 ? 0 : overalls.reduce((a, b) => a + b, 0) / n / MAX_SCORE
  const passCount = cases.filter((x) => x.score.pass).length
  const passRate = n === 0 ? 0 : passCount / n

  const fpCases = cases.filter((x) => x.score.breakdown.some((d) => d.dimension === 'precision' && d.score === 0))
  const hallucinationRate = n === 0 ? 0 : fpCases.length / n
  const falsePositiveCases = fpCases.map((x) => x.c.id)

  // grounding validity: fraction of scored cases that are grounded.
  const grounded = cases.filter((x) => x.score.breakdown.some((d) => d.dimension === 'grounding' && d.score >= PASS_THRESHOLD)).length
  const groundingValidity = n === 0 ? 0 : grounded / n

  // Observed latencies from the actual runs (not the expected ceiling).
  const observed = cases.flatMap((x) => x.runs.map((r) => r.latencyMs))
  const sorted = [...observed].sort((a, b) => a - b)
  const pct = (p: number) => {
    if (sorted.length === 0) return 0
    return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
  }
  const latency = {
    p50: pct(0.5),
    p95: pct(0.95),
    p99: pct(0.99),
    mean: observed.length === 0 ? 0 : observed.reduce((a, b) => a + b, 0) / observed.length,
  }

  const byWorkflow: Record<string, { n: number; pass: number }> = {}
  for (const x of cases) {
    const row = byWorkflow[x.c.workflow] ?? { n: 0, pass: 0 }
    row.n += 1
    if (x.score.pass) row.pass += 1
    byWorkflow[x.c.workflow] = row
  }

  // A regression-free report: zero false positives AND overall accuracy above floor AND every
  // workflow has a case.
  const passed = n > 0
    && fpCases.length === 0
    && overallAccuracy >= OVERALL_THRESHOLD
    && Object.keys(byWorkflow).length >= 14

  return {
    casesScored: n,
    passRate,
    overallAccuracy,
    hallucinationRate,
    groundingValidity,
    falsePositiveCases,
    latency,
    byWorkflow,
    passed,
  }
}
