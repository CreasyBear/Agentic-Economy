import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  admitBasStart,
  buildExternalRunReport,
  computeExternalRunGate,
  createExternalRunEvidence,
  createExternalRunManifest,
  externalRunManifestIntegrityValid,
  externalRunRateMeetsMaximum,
  externalRunRateMeetsMinimum,
} from '@/modules/external-run/public'

const WINDOW_START = Date.UTC(2026, 7, 1)

function manifest(overrides: Partial<{ requiresSettledPayment: boolean; providerRefs: string[]; independentProviderRefs: string[] }> = {}) {
  return createExternalRunManifest({
    runId: 'run:bas:2026-08',
    window: { startsOn: '2026-08-01', endsOn: '2026-08-31' },
    providerRefs: overrides.providerRefs ?? ['provider:a', 'provider:b', 'provider:c'],
    independentProviderRefs: overrides.independentProviderRefs ?? ['operator:0', 'operator:1', 'operator:2'],
    requiresSettledPayment: overrides.requiresSettledPayment ?? false,
  }, WINDOW_START, 'admin:test')
}

function admittedStarts(run = manifest(), count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const result = admitBasStart(run, {
      startRef: `start:${index + 1}`,
      startedAt: WINDOW_START + index * 24 * 60 * 60 * 1_000,
      basOutcome: index % 2 === 0 ? 'current' : 'overdue',
      attribution: { channel: 'founder-referral', campaign: 'bas-august' },
      consentAccepted: true,
      providerRef: run.providerRefs[index % run.providerRefs.length]!,
      independentProviderRef: `operator:${index % 3}`,
    }, WINDOW_START + index * 1_000)
    if (result.kind !== 'accepted') throw new Error(`admission failed: ${result.reason}`)
    return result.start
  })
}

function evidence(startRef: string, evidenceRef: string, evidenceClass: 'sandbox' | 'hosted' | 'provider' | 'customer' | 'payment', signal: Parameters<typeof createExternalRunEvidence>[0]['signal'], value: boolean | number | string, observedAt = WINDOW_START, providerRef?: string) {
  return createExternalRunEvidence({ evidenceRef, startRef, evidenceClass, signal, value, observedAt, ...(providerRef === undefined ? {} : { providerRef }) })
}

function passingEvidence(starts: ReturnType<typeof admittedStarts>) {
  return starts.flatMap((start, index) => [
    evidence(start.startRef, `evidence:ready:${index}`, 'hosted', 'decision_ready_within_24h', true, start.startedAt + 1_000),
    evidence(start.startRef, `evidence:preference:${index}`, 'customer', 'blind_preference', 'ae'),
    evidence(start.startRef, `evidence:completion:${index}`, 'provider', 'provider_backed_completion', true, WINDOW_START, start.providerRef),
    evidence(start.startRef, `evidence:touches:${index}`, 'hosted', 'operator_touch_count', 0),
    ...(index < 2 ? [evidence(start.startRef, `evidence:pilot:${index}`, 'customer', 'signed_paid_pilot', true)] : []),
    ...(index === 0 ? [evidence(start.startRef, 'evidence:margin', 'payment', 'contribution_margin_minor', 100)] : []),
  ])
}

describe('external BAS run manifest and kill gate', () => {
  it('rejects an incomplete manifest before a run can be admitted', () => {
    expect(() => createExternalRunManifest({
      runId: 'run:incomplete',
      window: { startsOn: '2026-08-01', endsOn: '2026-08-30' },
      providerRefs: ['provider:a', 'provider:b'],
      independentProviderRefs: ['operator:0', 'operator:1', 'operator:2'],
      requiresSettledPayment: false,
    }, WINDOW_START, 'admin:test')).toThrow()
  })

  it('freezes manifest material and refuses a changed digest at the admission boundary', () => {
    const run = manifest()
    expect(externalRunManifestIntegrityValid(run)).toBe(true)
    const changed = { ...run, providerRefs: [...run.providerRefs, 'provider:d'] }
    expect(externalRunManifestIntegrityValid(changed)).toBe(false)
    expect(admitBasStart(changed, {
      startRef: 'start:changed',
      startedAt: WINDOW_START,
      basOutcome: 'current',
      attribution: { channel: 'referral' },
      consentAccepted: true,
      providerRef: 'provider:a',
      independentProviderRef: 'operator:a',
    }, WINDOW_START)).toEqual({ kind: 'refused', reason: 'manifest_not_frozen' })
  })

  it('keeps evidence classes distinct and does not upgrade sandbox completion', () => {
    const run = manifest()
    const starts = admittedStarts(run)
    const sandboxEvidence = evidence(starts[0]!.startRef, 'evidence:sandbox', 'sandbox', 'provider_backed_completion', true)
    const report = buildExternalRunReport(run, starts, [sandboxEvidence])
    expect(report.evidenceByClass.sandbox).toBe(1)
    expect(report.metrics.completion.numerator).toBe(0)
    expect(report.metrics.completion.denominator).toBe(12)
  })

  it('keeps missing and unknown starts in the denominator without counting success', () => {
    const run = manifest()
    const starts = admittedStarts(run, 11)
    const report = buildExternalRunReport(run, starts, passingEvidence(starts.slice(0, 8)))
    expect(report.reconciliation).toMatchObject({ expectedCohort: 12, recordedStarts: 11, missingStarts: 1, denominator: 12, totalsReconcile: false })
    expect(report.metrics.decisionReadyWithin24h).toMatchObject({ numerator: 8, denominator: 12 })
    expect(report.metrics.refusalUnknown.denominator).toBe(12)
    expect(computeExternalRunGate(run, starts, passingEvidence(starts.slice(0, 8))).decision).toBe('FAIL/KILL')
  })

  it('computes exact percentage boundaries mechanically', () => {
    expect(externalRunRateMeetsMinimum(74.9, 100, 0.75)).toBe(false)
    expect(externalRunRateMeetsMinimum(75, 100, 0.75)).toBe(true)
    expect(externalRunRateMeetsMinimum(9, 12, 0.75)).toBe(true)
    expect(externalRunRateMeetsMinimum(8, 12, 0.75)).toBe(false)
    expect(externalRunRateMeetsMaximum(25, 100, 0.25)).toBe(true)
    expect(externalRunRateMeetsMaximum(26, 100, 0.25)).toBe(false)
  })
  it('does not count invented independent provider refs toward the supply gate', () => {
    const run = manifest()
    const starts = admittedStarts(run)
    const inventedStarts = starts.map((start, index) => {
      const material = { ...start, independentProviderRef: `invented:${index}` }
      const { digest: _digest, ...digestMaterial } = material
      return { ...material, digest: canonicalDigest(digestMaterial) }
    })
    const gate = computeExternalRunGate(run, inventedStarts, passingEvidence(inventedStarts))
    expect(gate.report.metrics.independentProviderCount).toBe(0)
    expect(gate.failedGates).toContain('independent_provider_supply')
  })


  it('returns PASS only when every frozen gate is satisfied', () => {
    const run = manifest()
    const starts = admittedStarts(run)
    const gate = computeExternalRunGate(run, starts, passingEvidence(starts))
    expect(gate.decision).toBe('PASS')
    expect(gate.failedGates).toEqual([])
    expect(gate.report.reconciliation).toMatchObject({ expectedCohort: 12, recordedStarts: 12, missingStarts: 0, denominator: 12, totalsReconcile: true })
    expect(gate.report.metrics.decisionReadyWithin24h).toMatchObject({ numerator: 12, denominator: 12, rate: 1 })
  })
})
