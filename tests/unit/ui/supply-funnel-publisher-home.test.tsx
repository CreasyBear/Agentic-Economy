import { describe, expect, it } from 'vitest'

import { projectOwnerOperations } from '@/components/ae/offerings/owner-operations-projection'
import type { OwnerOperationsInventoryResult, OwnerOperationsLifecycleRow } from '@/components/ae/offerings/owner-operations.functions'

const inventory = {
  kind: 'available',
  supplier: { name: 'Supplier' },
  projection: 'current',
  operations: [{ offeringRef: 'offering:one', currentRevision: 2, name: 'One', category: 'tools', summary: 'Does one thing', status: 'published', accessPathCount: 1 }],
} as const satisfies OwnerOperationsInventoryResult

function lifecycle(patch: Partial<OwnerOperationsLifecycleRow> = {}): OwnerOperationsLifecycleRow {
  return {
    offeringRef: 'offering:one', revision: 2, status: 'published', currentStep: 'test', readinessState: 'completed', publicationState: 'current',
    lifecycleState: 'active', readinessOutcome: 'healthy', liveAvailable: true,
    continuation: { kind: 'navigate', label: 'Inspect Operation', href: '/operations/operation:one' },
    ...patch,
  }
}

describe('Operations lifecycle projection', () => {
  it.each([
    [{ publicationState: 'superseded' as const }, 'Retired'],
    [{ publicationState: 'incompatible' as const }, 'Incompatible'],
    [{ publicationState: 'withdrawn' as const }, 'Withdrawn'],
    [{ actionableReason: 'authority_stale' as const }, 'Connection needs attention'],
    [{ readinessOutcome: 'credential_rejected' as const }, 'Connection needs attention'],
    [{ currentStep: 'admission' as const }, 'Setup required'],
    [{ readinessState: 'not_started' as const }, 'Readiness not started'],
    [{ readinessState: 'in_progress' as const }, 'Checking readiness'],
    [{ readinessState: 'refused' as const }, 'Not ready'],
    [{ readinessState: 'stale' as const }, 'Not ready'],
    [{ liveAvailable: false, liveReason: 'transport_unreachable' as const }, 'Not ready'],
    [{ readinessOutcome: 'unobserved' as const }, 'Status unavailable'],
  ])('applies lifecycle precedence for %o', (patch, label) => {
    const result = projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle(patch)] })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') expect(result.rows[0]?.lifecycleLabel).toBe(label)
  })

  it.each([
    ['paused', 'Paused'],
    ['draft', 'Draft'],
  ] as const)('projects a %s definition before readiness state', (status, label) => {
    const result = projectOwnerOperations(
      { ...inventory, operations: [{ ...inventory.operations[0]!, status }] },
      { kind: 'available', value: [lifecycle()] },
    )
    expect(result.kind).toBe('available')
    if (result.kind === 'available') expect(result.rows[0]?.lifecycleLabel).toBe(label)
  })

  it('keeps earlier blockers ahead of later lifecycle conditions', () => {
    const result = projectOwnerOperations(
      { ...inventory, operations: [{ ...inventory.operations[0]!, status: 'paused' }] },
      { kind: 'available', value: [lifecycle({ revision: 1, publicationState: 'withdrawn', readinessState: 'refused' })] },
    )
    expect(result.kind).toBe('available')
    if (result.kind === 'available') expect(result.rows[0]).toMatchObject({ lifecycleLabel: 'Updating', availability: 'unknown' })
  })

  it('requires the exact published predicate', () => {
    const result = projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle()] })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') expect(result.rows[0]).toMatchObject({ lifecycleLabel: 'Published', availability: 'available' })
  })

  it('retains revision mismatch without a publish action', () => {
    const result = projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle({ revision: 1 })] })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') expect(result.rows[0]).toMatchObject({ lifecycleLabel: 'Updating', availability: 'unknown', continuation: { label: 'Edit Operation' } })
  })

  it('distinguishes an unprepared definition from a lifecycle outage', () => {
    const notPrepared = projectOwnerOperations(inventory, { kind: 'not_applicable' })
    expect(notPrepared.kind).toBe('available')
    if (notPrepared.kind === 'available') {
      expect(notPrepared).toMatchObject({
        inconsistencyCount: 1,
        rows: [{ lifecycleLabel: 'Preparation required', availability: 'unknown' }],
      })
    }

    const unavailable = projectOwnerOperations(inventory, { kind: 'unavailable' })
    expect(unavailable.kind).toBe('available')
    if (unavailable.kind === 'available') {
      expect(unavailable).toMatchObject({
        inconsistencyCount: 0,
        rows: [{ lifecycleLabel: 'Status unavailable', availability: 'unknown' }],
      })
    }
  })

  it('fails deterministically on duplicate definition or supply references', () => {
    expect(projectOwnerOperations({ ...inventory, operations: [...inventory.operations, ...inventory.operations] }, { kind: 'available', value: [] }))
      .toEqual({ kind: 'conflict', reason: 'duplicate_definition' })
    expect(projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle(), lifecycle()] }))
      .toEqual({ kind: 'conflict', reason: 'duplicate_supply' })
  })

  it('preserves a known supplier ownership conflict instead of calling it unavailable', () => {
    expect(projectOwnerOperations(inventory, { kind: 'conflict', reason: 'business_mismatch' }))
      .toEqual({ kind: 'conflict', reason: 'business_mismatch' })
    expect(projectOwnerOperations(inventory, { kind: 'conflict', reason: 'multiple_suppliers' }))
      .toEqual({ kind: 'conflict', reason: 'multiple_suppliers' })
  })

  it('omits supply-only rows and counts inconsistencies', () => {
    const result = projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle(), lifecycle({ offeringRef: 'offering:orphan' })] })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') expect(result).toMatchObject({ inconsistencyCount: 1, rows: [{ offeringRef: 'offering:one' }] })
  })
})
