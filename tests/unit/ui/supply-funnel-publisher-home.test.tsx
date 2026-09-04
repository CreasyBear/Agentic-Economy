import { describe, expect, it } from 'vitest'

import { projectOwnerOperations } from '@/components/ae/offerings/owner-operations-projection'
import type { OwnerOperationsInventoryResult, OwnerOperationsLifecycleRow } from '@/components/ae/offerings/owner-operations.functions'
import type { SupplierOperationStatus } from '@/modules/capability-supply/supplier-operation-status'

const inventory = {
  kind: 'available',
  supplier: { name: 'Supplier' },
  projection: 'current',
  isDone: true,
  continueCursor: '',
  operations: [{ offeringRef: 'offering:one', currentRevision: 2, name: 'One', category: 'tools', summary: 'Does one thing', status: 'published', accessPathCount: 1 }],
} as const satisfies OwnerOperationsInventoryResult

function operationStatus(patch: Partial<SupplierOperationStatus> = {}): SupplierOperationStatus {
  return {
    schemaVersion: 'supplier_operations:v1',
    businessRef: 'business:one',
    providerRef: 'provider:one',
    operationRef: 'operation:one',
    revision: 2,
    state: 'Published',
    reasonCodes: [],
    observedAt: 1_000,
    source: { kind: 'openapi' },
    routeability: { available: true, reasonCodes: [] },
    authority: { kind: 'public' },
    health: {
      connection: 'not_required',
      validation: 'passed',
      publication: 'published',
      freshness: 'current',
      delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
      usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
      operationalConditions: [],
    },
    ...patch,
  }
}

function lifecycle(status = operationStatus()): OwnerOperationsLifecycleRow {
  return { offeringRef: 'offering:one', status }
}

describe('canonical Supplier Operation directory projection', () => {
  it.each([
    ['Draft', false],
    ['Needs setup', false],
    ['Submitted', false],
    ['Under review', false],
    ['Published', true],
    ['Paused', false],
    ['Action required', false],
    ['Retired', false],
  ] as const)('renders the canonical %s state without a parallel lifecycle', (state, available) => {
    const result = projectOwnerOperations(inventory, {
      kind: 'available',
      value: [lifecycle(operationStatus({ state, routeability: { available, reasonCodes: [] } }))],
    })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') {
      expect(result.rows[0]).toMatchObject({ lifecycleLabel: state, availability: available ? 'available' : 'unavailable' })
    }
  })

  it('uses the shared reason copy and hosted owner handoff', () => {
    const status = operationStatus({
      state: 'Action required',
      reasonCodes: ['credential_lost'],
      routeability: { available: false, reasonCodes: ['credential_lost'] },
      ownerHandoff: {
        action: 'supply.connection.reconnect',
        blockedCapabilities: ['supply.publish'],
        cta: '/owner/supply/connections',
        ctaLabel: 'Reconnect source',
        description: 'Reconnect the source.',
        iconUrl: null,
        status: 'required',
        title: 'Reconnect source',
      },
    })
    const result = projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle(status)] })
    expect(result.kind).toBe('available')
    if (result.kind === 'available') {
      expect(result.rows[0]).toMatchObject({
        lifecycleLabel: 'Action required',
        blocker: 'The source connection is no longer available. Reconnect it before publication can continue.',
        continuation: { label: 'Reconnect source', href: '/owner/supply/connections' },
      })
    }
  })

  it('fails safely for missing, stale or duplicate canonical rows', () => {
    const missing = projectOwnerOperations(inventory, { kind: 'unavailable' })
    expect(missing.kind === 'available' ? missing.rows[0] : missing).toMatchObject({ lifecycleLabel: 'Status unavailable', availability: 'unknown' })

    const stale = projectOwnerOperations(inventory, {
      kind: 'available',
      value: [lifecycle(operationStatus({ revision: 1 }))],
    })
    expect(stale.kind === 'available' ? stale.rows[0] : stale).toMatchObject({ lifecycleLabel: 'Updating', lifecyclePending: true })

    expect(projectOwnerOperations({ ...inventory, operations: [...inventory.operations, ...inventory.operations] }, { kind: 'available', value: [] }))
      .toEqual({ kind: 'conflict', reason: 'duplicate_definition' })
    expect(projectOwnerOperations(inventory, { kind: 'available', value: [lifecycle(), lifecycle()] }))
      .toEqual({ kind: 'conflict', reason: 'duplicate_supply' })
  })
})
