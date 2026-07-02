import { describe, expect, it } from 'vitest'

import {
  HarnessEmissionGuard,
  hashHarnessEmissionNote,
  normalizeHarnessEmissionText,
  type HarnessEmissionEvidenceReference,
  type HarnessEmissionGuardDecision,
  type HarnessEmissionSuppressionReason,
} from '@/modules/harness/public'

describe('harness emission guard', () => {
  it('normalizes advisory text for duplicate detection', () => {
    expect(normalizeHarnessEmissionText('Stop.')).toBe('stop')
    expect(normalizeHarnessEmissionText('  STOP!  ')).toBe('stop')
    expect(normalizeHarnessEmissionText('*Stop*')).toBe('stop')
    expect(normalizeHarnessEmissionText('No issue; continue.')).toBe('no issue continue')
    expect(normalizeHarnessEmissionText('Refactor `auth-flow.ts`: drop legacy branch.')).toBe(
      'refactor auth flow ts drop legacy branch',
    )
    expect(hashHarnessEmissionNote('Duplicate: missing source fact.')).toBe(
      hashHarnessEmissionNote('duplicate missing source fact'),
    )
  })

  it('suppresses content-free filler and stores only hashes and counters', () => {
    const guard = new HarnessEmissionGuard()

    const first = expectSuppressed(guard.evaluate({
      text: 'Stop.',
      severity: 'blocker',
      evidence: evidence(),
    }), 'filler')
    const second = expectSuppressed(guard.evaluate({
      text: 'STOP!',
      severity: 'error',
      evidence: evidence(),
    }), 'filler')

    expect(second.noteHash).toBe(first.noteHash)
    expect(second.count).toBe(2)
    expect(second.highestSeverity).toBe('blocker')
    expect(guard.snapshot().suppressed).toMatchObject({
      total: 2,
      notes: [
        {
          noteHash: first.noteHash,
          count: 2,
          reasons: ['filler'],
        },
      ],
    })
    expect(JSON.stringify(guard.snapshot())).not.toContain('Stop')
    expect(JSON.stringify(guard.snapshot())).not.toContain('stop')
  })

  it('suppresses duplicate notes by normalized hash across reviewer cycles', () => {
    const guard = new HarnessEmissionGuard()

    expectAccepted(guard.evaluate({
      text: 'Missing source fact on registry detail.',
      severity: 'warning',
      evidence: evidence('tool:registry.detail'),
    }))

    guard.beginCycle()
    const duplicate = expectSuppressed(guard.evaluate({
      text: 'missing source fact on registry detail!',
      severity: 'warning',
      evidence: evidence('tool:registry.detail'),
    }), 'duplicate')

    expect(duplicate.noteHash).toBe(hashHarnessEmissionNote('Missing source fact on registry detail.'))
    expect(duplicate.count).toBe(1)
  })

  it('does not let suppressed emissions consume the per-cycle budget', () => {
    const guard = new HarnessEmissionGuard({ maxAcceptedPerCycle: 1 })

    expectSuppressed(guard.evaluate({
      text: 'No issue; continue.',
      severity: 'blocker',
      evidence: evidence(),
    }), 'filler')

    expectAccepted(guard.evaluate({
      text: 'Missing evidence ref before persistence.',
      severity: 'warning',
      evidence: evidence('gate:answer'),
    }))
    expect(guard.snapshot().acceptedThisCycle).toBe(1)
  })

  it('caps accepted emissions per reviewer cycle', () => {
    const guard = new HarnessEmissionGuard({ maxAcceptedPerCycle: 1 })

    expectAccepted(guard.evaluate({
      text: 'First grounded reviewer note.',
      severity: 'warning',
      evidence: evidence('gate:first'),
    }))
    expectSuppressed(guard.evaluate({
      text: 'Second grounded reviewer note.',
      severity: 'warning',
      evidence: evidence('gate:second'),
    }), 'cycle_limit')

    guard.beginCycle()
    expectAccepted(guard.evaluate({
      text: 'Second grounded reviewer note.',
      severity: 'warning',
      evidence: evidence('gate:second'),
    }))
  })

  it('denies public raw advisory emission', () => {
    const guard = new HarnessEmissionGuard()
    const rawText = 'PUBLIC RAW ADVISORY SHOULD NOT LEAK'

    const suppression = expectSuppressed(guard.evaluate({
      text: rawText,
      severity: 'blocker',
      surface: 'public',
      evidence: evidence('gate:public-deny'),
    }), 'public_surface')
    const serialized = JSON.stringify({ suppression, snapshot: guard.snapshot() })

    expect(suppression.noteHash).toBe(hashHarnessEmissionNote(rawText))
    expect(serialized).not.toContain(rawText)
    expect(serialized).not.toContain('PUBLIC RAW')
  })

  it('requires evidence references before accepting a note', () => {
    const guard = new HarnessEmissionGuard()

    expectSuppressed(guard.evaluate({
      text: 'Concrete but unsupported reviewer note.',
      severity: 'warning',
    }), 'missing_evidence')
    expectSuppressed(guard.evaluate({
      text: 'Concrete but unsupported reviewer note.',
      severity: 'warning',
      evidence: [{ kind: 'gateDecision', ref: '   ' }],
    }), 'missing_evidence')

    expectAccepted(guard.evaluate({
      text: 'Concrete but unsupported reviewer note.',
      severity: 'warning',
      evidence: evidence('gate:grounded'),
    }))
  })

  it('enforces a severity threshold before accepting notes', () => {
    const guard = new HarnessEmissionGuard({ minimumSeverity: 'error' })

    expectSuppressed(guard.evaluate({
      text: 'Advisory nit below the configured threshold.',
      severity: 'warning',
      evidence: evidence('gate:threshold'),
    }), 'below_severity_threshold')

    expectAccepted(guard.evaluate({
      text: 'Blocking issue at the configured threshold.',
      severity: 'error',
      evidence: evidence('gate:threshold'),
    }))
  })

  it('allows strict severity escalation for the same note', () => {
    const guard = new HarnessEmissionGuard()

    expectAccepted(guard.evaluate({
      text: 'Gate result lacks source evidence.',
      severity: 'warning',
      evidence: evidence('gate:answer'),
    }))

    guard.beginCycle()
    const escalated = expectAccepted(guard.evaluate({
      text: 'gate result lacks source evidence!',
      severity: 'blocker',
      evidence: evidence('gate:answer-blocker'),
    }))

    expect(escalated.reason).toBe('severity_escalation')
    expect(escalated.emission.escalatedFrom).toBe('warning')
    expect(escalated.emission.noteHash).toBe(hashHarnessEmissionNote('Gate result lacks source evidence.'))

    guard.beginCycle()
    expectSuppressed(guard.evaluate({
      text: 'Gate result lacks source evidence.',
      severity: 'error',
      evidence: evidence('gate:answer'),
    }), 'duplicate')
  })
})

function evidence(ref = 'gate:answer'): readonly HarnessEmissionEvidenceReference[] {
  return [{ kind: 'gateDecision', ref }]
}

function expectSuppressed(
  decision: HarnessEmissionGuardDecision,
  reason: HarnessEmissionSuppressionReason,
) {
  expect(decision).toMatchObject({ accepted: false, reason })
  if (decision.accepted) {
    throw new Error(`Expected suppressed decision, received accepted ${decision.reason}`)
  }

  return decision.suppression
}

function expectAccepted(decision: HarnessEmissionGuardDecision) {
  expect(decision.accepted).toBe(true)
  if (!decision.accepted) {
    throw new Error(`Expected accepted decision, received suppressed ${decision.reason}`)
  }

  return decision
}
