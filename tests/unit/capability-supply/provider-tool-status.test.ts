import { describe, expect, it } from 'vitest'

import { projectProviderToolStatus } from '@/modules/capability-supply/provider-tool-status'

const base = {
  schemaVersion: 'provider_tools:v1' as const,
  businessRef: 'business:one',
  providerRef: 'provider:one',
  toolRef: 'operation:one',
  observedAt: 100,
  draftPresent: true,
  setupComplete: true,
  submitted: true,
  reviewActive: false,
  routeable: true,
  paused: false,
  retired: false,
  retirementProven: false,
  blockerCodes: [] as string[],
}

describe('Provider Tool status', () => {
  it.each([
    [{ retired: true, retirementProven: true, blockerCodes: ['credential_lost'], paused: true }, 'Retired'],
    [{ blockerCodes: ['credential_lost'], paused: true, routeable: false }, 'Action required'],
    [{ paused: true, routeable: false }, 'Paused'],
    [{ routeable: true }, 'Published'],
    [{ reviewActive: true, routeable: false }, 'Under review'],
    [{ submitted: true, reviewActive: false, routeable: false }, 'Submitted'],
    [{ submitted: false, setupComplete: false, routeable: false }, 'Needs setup'],
    [{ submitted: false, setupComplete: true, routeable: false }, 'Draft'],
  ] as const)('applies the locked precedence for %o', (override, state) => {
    expect(projectProviderToolStatus({ ...base, ...override }).state).toBe(state)
  })

  it('fails closed when retirement is requested but child authorities are not complete', () => {
    const status = projectProviderToolStatus({
      ...base,
      retired: true,
      retirementProven: false,
      routeable: false,
      blockerCodes: ['outstanding_provider_obligation'],
    })

    expect(status).toMatchObject({
      state: 'Action required',
      reasonCodes: ['outstanding_provider_obligation'],
      continuation: { action: 'supply.offboarding.status' },
    })
  })

  it.each([
    ['health_unobserved', false, 'Action required', 'supply.recheck'],
    ['health_stale', true, 'Action required', 'supply.recheck'],
    ['health_unhealthy', true, 'Action required', 'supply.recheck'],
    ['provider_authority_unverified', true, 'Submitted', 'supply.status'],
    ['unrecognized_current_requirement', true, 'Action required', 'supply.status'],
  ] as const)('returns one safe next action for %s', (reason, submitted, state, action) => {
    const status = projectProviderToolStatus({
      ...base,
      submitted,
      routeable: false,
      blockerCodes: [reason],
    })

    expect(status).toMatchObject({
      state,
      reasonCodes: [reason],
      continuation: { action },
    })
  })

  it('keeps submitted authority and health observations in current-status readback while review is in flight', () => {
    const status = projectProviderToolStatus({
      ...base,
      routeable: false,
      reviewActive: true,
      blockerCodes: ['provider_authority_unverified', 'health_unobserved'],
    })

    expect(status).toMatchObject({
      state: 'Under review',
      reasonCodes: ['provider_authority_unverified', 'health_unobserved'],
      continuation: { action: 'supply.status' },
    })
  })

  it('does not schedule another check while a failed health check is already under review', () => {
    const status = projectProviderToolStatus({
      ...base,
      routeable: false,
      reviewActive: true,
      blockerCodes: ['health_unhealthy'],
    })

    expect(status).toMatchObject({
      state: 'Under review',
      continuation: { action: 'supply.status' },
    })
  })

  it('preserves causal reason priority and rechecks a current published revision only when it is no longer routeable', () => {
    const status = projectProviderToolStatus({
      ...base,
      routeable: false,
      blockerCodes: ['health_stale', 'provider_authority_unverified'],
      health: {
        connection: 'not_required',
        validation: 'passed',
        publication: 'published',
        freshness: 'stale',
        delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
        usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
        operationalConditions: ['health_stale', 'provider_authority_unverified'],
      },
    })

    expect(status).toMatchObject({
      state: 'Action required',
      reasonCodes: ['health_stale', 'provider_authority_unverified'],
      routeability: { available: false, reasonCodes: ['health_stale', 'provider_authority_unverified'] },
      health: { publication: 'published', freshness: 'stale' },
      continuation: { action: 'supply.recheck' },
    })
  })

  it('never emits more than one machine next action or owner handoff', () => {
    const status = projectProviderToolStatus({
      ...base,
      routeable: false,
      blockerCodes: ['source_drift', 'credential_lost'],
    })
    expect(Array.isArray(status.continuation)).toBe(false)
    expect(Array.isArray(status.ownerHandoff)).toBe(false)
  })
})
