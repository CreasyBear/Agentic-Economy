import { describe, expect, it } from 'vitest'

import { projectSupplierOperationStatus } from '@/modules/capability-supply/supplier-operation-status'

const base = {
  schemaVersion: 'supplier_operations:v1' as const,
  businessRef: 'business:one',
  providerRef: 'provider:one',
  operationRef: 'operation:one',
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

describe('supplier Operation status', () => {
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
    expect(projectSupplierOperationStatus({ ...base, ...override }).state).toBe(state)
  })

  it('fails closed when retirement is requested but child authorities are not complete', () => {
    const status = projectSupplierOperationStatus({
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

  it('never emits more than one machine continuation or owner handoff', () => {
    const status = projectSupplierOperationStatus({
      ...base,
      routeable: false,
      blockerCodes: ['source_drift', 'credential_lost'],
    })
    expect(Array.isArray(status.continuation)).toBe(false)
    expect(Array.isArray(status.ownerHandoff)).toBe(false)
  })
})
