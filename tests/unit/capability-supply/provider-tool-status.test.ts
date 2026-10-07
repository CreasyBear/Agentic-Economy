import { describe, expect, it } from 'vitest'

import { projectProviderToolStatus, providerToolStatusSchema } from '@/modules/capability-supply/provider-tool-status'

const maintenance = {
  businessId: 'business:one',
  offeringRef: 'offering:one',
  offeringRevision: 2,
  offeringSourceHash: 'source:one',
  publicationRef: 'publication:one',
  publicationRevision: 3,
}

const base = {
  schemaVersion: 'provider_tools:v1' as const,
  businessRef: 'business:one',
  providerRef: 'provider:one',
  toolRef: 'operation:one',
  observedAt: 100,
  maintenance,
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

  it('returns to the saved source when the selected Tool remains a private draft', () => {
    const status = projectProviderToolStatus({
      ...base, submitted: false, routeable: false,
    })
    expect(status).toMatchObject({
      state: 'Draft',
      continuation: { action: 'supply.source.preview', args: { kind: 'x402' }, requiredInput: ['resourceUrl'] },
    })
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
      continuation: { action: 'supply.offboarding.status', args: { businessRef: base.businessRef } },
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
      continuation: { action: 'supply.status', args: { businessRef: base.businessRef, toolRef: base.toolRef } },
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
      continuation: { action: 'supply.status', args: { businessRef: base.businessRef, toolRef: base.toolRef } },
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
      continuation: { action: 'supply.recheck', args: maintenance, requiredInput: ['idempotencyKey'] },
    })
  })

  it.each([
    [{ paused: true }, 'supply.republish'],
    [{ blockerCodes: ['source_drift'] }, 'supply.recheck'],
  ] as const)('carries exact maintenance material and asks the caller to supply its retained key for %o', (override, action) => {
    const status = projectProviderToolStatus({ ...base, routeable: false, ...override })
    expect(status.continuation).toEqual({ action, args: maintenance, requiredInput: ['idempotencyKey'] })
    expect(providerToolStatusSchema.safeParse(status).success).toBe(true)
    expect(status.continuation?.args).not.toHaveProperty('idempotencyKey')
  })

  it.each([
    { paused: true },
    { blockerCodes: ['source_drift'] },
  ])('reports unavailable maintenance identity without suggesting a status polling repair for %o', (override) => {
    const status = projectProviderToolStatus({ ...base, routeable: false, ...override, maintenance: undefined })
    expect(status.reasonCodes).toContain('maintenance_identity_unavailable')
    expect(status.continuation).toBeUndefined()
    expect(providerToolStatusSchema.safeParse(status).success).toBe(true)
  })

  it('does not offer x402 preview for a saved source the current action cannot preview', () => {
    const status = projectProviderToolStatus({
      ...base, submitted: false, routeable: false, source: { kind: 'mcp' },
    })
    expect(status.continuation).toBeUndefined()
    expect(status.reasonCodes).toContain('source_preview_unavailable')
  })

  it('rejects action-only and wrong-action arguments in the owner readback schema', () => {
    const status = projectProviderToolStatus({ ...base, routeable: false, reviewActive: true })
    expect(providerToolStatusSchema.safeParse({ ...status, continuation: { action: 'supply.status' } }).success).toBe(false)
    expect(providerToolStatusSchema.safeParse({
      ...status, continuation: { action: 'supply.status', args: maintenance },
    }).success).toBe(false)
  })

  it('never emits more than one machine next action or owner handoff', () => {
    const status = projectProviderToolStatus({
      ...base,
      routeable: false,
      blockerCodes: ['source_drift', 'credential_lost'],
    })
    expect(Array.isArray(status.continuation)).toBe(false)
    expect(Array.isArray(status.ownerHandoff)).toBe(false)
    expect(status.ownerHandoff).toMatchObject({ actor: 'business_owner', reason: 'credential_lost', destination: '/owner/settings/integrations#provider-connections' })
    expect(status.ownerHandoff).not.toHaveProperty('action')
    expect(providerToolStatusSchema.safeParse(status).success).toBe(true)
  })
})
