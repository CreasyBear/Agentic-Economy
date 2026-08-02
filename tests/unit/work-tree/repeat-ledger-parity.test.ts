import { beforeEach, describe, expect, it, vi } from 'vitest'

const sourceMocks = vi.hoisted(() => {
  class MockConvexSourceError extends Error {
    readonly code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return {
    callSourceMutation: vi.fn(),
    callSourceQuery: vi.fn(),
    sourceMutation: vi.fn((name: string) => ({ name })),
    sourceQuery: vi.fn((name: string) => ({ name })),
    ConvexSourceError: MockConvexSourceError,
  }
})

vi.mock('@/lib/server/convex-source', () => ({
  callSourceMutation: sourceMocks.callSourceMutation,
  callSourceQuery: sourceMocks.callSourceQuery,
  sourceMutation: sourceMocks.sourceMutation,
  sourceQuery: sourceMocks.sourceQuery,
  ConvexSourceError: sourceMocks.ConvexSourceError,
}))

import {
  finalizeRepeatUseThroughSource,
  inspectRepeatUseThroughSource,
  reconcileRepeatUseThroughSource,
  reserveRepeatUseThroughSource,
} from '@/modules/work-tree/work-tree-repeat.functions'
import {
  workTreeFinalizeRepeatUseAction,
  workTreeInspectRepeatUseAction,
  workTreeReconcileRepeatUseAction,
  workTreeReserveRepeatUseAction,
} from '@/modules/work-tree/work-tree-repeat.actions'

const reserveInput = {
  projectId: 'project:repeat',
  permissionRef: 'repeat-permission:one',
  operationKey: 'reserve:one',
  requestedOccurrences: 1,
  requestedSpend: { currency: 'AUD', amountMinor: 400 },
  requestedDataAllocations: 1,
}

beforeEach(() => {
  sourceMocks.callSourceMutation.mockReset()
  sourceMocks.callSourceQuery.mockReset()
  sourceMocks.callSourceMutation.mockImplementation(async (descriptor: { name: string }) => {
    if (descriptor.name.endsWith('finalizeRepeatUse')) {
      return { kind: 'accepted', useRef: 'repeat-use:one', operationKey: 'finalize:one', state: 'settled', releasedOccurrences: 0, releasedDataAllocations: 0, releasedSpendMinor: 100 }
    }
    if (descriptor.name.endsWith('reconcileRepeatUse')) {
      return { kind: 'accepted', useRef: 'repeat-use:one', operationKey: 'reconcile:one', reconcileOperationKey: 'reconcile:one', state: 'settled', releasedOccurrences: 0, releasedDataAllocations: 0, releasedSpendMinor: 100 }
    }
    return {
      kind: 'accepted',
      useRef: 'repeat-use:one',
      permissionRef: 'repeat-permission:one',
      operationKey: 'reserve:one',
      state: 'reserved',
      reservedOccurrences: 1,
      reservedDataAllocations: 1,
      reservedSpend: { currency: 'AUD', amountMinor: 400 },
    }
  })
  sourceMocks.callSourceQuery.mockResolvedValue({
    kind: 'accepted',
    use: {
      useRef: 'repeat-use:one',
      permissionRef: 'repeat-permission:one',
      projectId: 'project:repeat',
      treeId: 'tree:repeat',
      principalId: 'principal:repeat',
      nodeId: 'node:repeat',
      generation: 1,
      revision: 1,
      delegatedCredentialId: 'credential:repeat',
      operationKey: 'reserve:one',
      requestedOccurrences: 1,
      requestedSpend: { currency: 'AUD', amountMinor: 400 },
      requestedDataAllocations: 1,
      reservedOccurrences: 1,
      reservedSpend: { currency: 'AUD', amountMinor: 400 },
      reservedDataAllocations: 1,
      state: 'reserved',
      releasedOccurrences: 0,
      releasedSpendMinor: 0,
      releasedDataAllocations: 0,
    },
    permission: {
      permissionRef: 'repeat-permission:one',
      projectId: 'project:repeat',
      treeId: 'tree:repeat',
      nodeId: 'node:repeat',
      generation: 1,
      revision: 1,
      delegatedCredentialId: 'credential:repeat',
      validFrom: 0,
      validUntil: 9_999_999_999_999,
      perUseSpend: { currency: 'AUD', amountMinor: 400 },
      cumulativeSpend: { currency: 'AUD', amountMinor: 500 },
      occurrenceLimit: 1,
      perUseDataAllocations: 1,
      cumulativeDataAllocations: 1,
      reservedDataAllocations: 1,
      settledDataAllocations: 0,
      reservedOccurrences: 1,
      settledOccurrences: 0,
      reservedSpend: { currency: 'AUD', amountMinor: 400 },
      settledSpend: { currency: 'AUD', amountMinor: 0 },
      status: 'active',
      issuedAt: 1,
      sourceReceiptId: 'receipt:repeat',
    },
  })
})

describe('WorkTree repeat ledger public seam', () => {
  it('routes source operations through named public mutations and query', async () => {
    await expect(reserveRepeatUseThroughSource(reserveInput)).resolves.toMatchObject({ kind: 'accepted', useRef: 'repeat-use:one' })
    await expect(finalizeRepeatUseThroughSource({
      useRef: 'repeat-use:one', operationKey: 'finalize:one', actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 300 }, actualDataAllocations: 1, outcome: 'settled',
    })).resolves.toMatchObject({ kind: 'accepted', useRef: 'repeat-use:one' })
    await expect(reconcileRepeatUseThroughSource({
      useRef: 'repeat-use:one', operationKey: 'reconcile:one', actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 300 }, actualDataAllocations: 1, outcome: 'settled',
    })).resolves.toMatchObject({ kind: 'accepted', useRef: 'repeat-use:one' })
    await expect(inspectRepeatUseThroughSource({ useRef: 'repeat-use:one' })).resolves.toMatchObject({ kind: 'accepted' })

    expect(sourceMocks.callSourceMutation).toHaveBeenCalledTimes(3)
    expect(sourceMocks.callSourceMutation.mock.calls.map(([descriptor]) => descriptor.name)).toEqual([
      'workTreeRepeatLedger:reserveRepeatUse',
      'workTreeRepeatLedger:finalizeRepeatUse',
      'workTreeRepeatLedger:reconcileRepeatUse',
    ])
    expect(sourceMocks.callSourceQuery).toHaveBeenCalledWith(
      { name: 'workTreeRepeatLedger:inspectRepeatUse' },
      { useRef: 'repeat-use:one' },
    )
  })
  it('parses unknown and reconciled settlement receipts and maps source auth refusal', async () => {
    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'unknown',
      useRef: 'repeat-use:unknown',
      operationKey: 'finalize:unknown',
      state: 'unknown',
      releasedOccurrences: 0,
      releasedDataAllocations: 0,
      releasedSpendMinor: 0,
      heldSpendMinor: 400,
      heldDataAllocations: 1,
    })
    await expect(finalizeRepeatUseThroughSource({
      useRef: 'repeat-use:unknown',
      operationKey: 'finalize:unknown',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'unknown',
    })).resolves.toMatchObject({ kind: 'unknown', state: 'unknown', heldSpendMinor: 400 })

    sourceMocks.callSourceMutation.mockResolvedValueOnce({
      kind: 'accepted',
      useRef: 'repeat-use:unknown',
      operationKey: 'reconcile:unknown',
      reconcileOperationKey: 'reconcile:unknown',
      state: 'settled',
      releasedOccurrences: 0,
      releasedDataAllocations: 1,
      releasedSpendMinor: 400,
    })
    await expect(reconcileRepeatUseThroughSource({
      useRef: 'repeat-use:unknown',
      operationKey: 'reconcile:unknown',
      actualOccurrences: 1,
      actualSpend: { currency: 'AUD', amountMinor: 0 },
      actualDataAllocations: 0,
      outcome: 'settled',
    })).resolves.toMatchObject({ kind: 'accepted', reconcileOperationKey: 'reconcile:unknown', state: 'settled' })

    sourceMocks.callSourceMutation.mockRejectedValueOnce(new sourceMocks.ConvexSourceError('missing_auth'))
    await expect(reserveRepeatUseThroughSource(reserveInput)).resolves.toEqual({
      kind: 'refused',
      reason: 'authentication_required',
    })
  })


  it('publishes bounded authority and replay/unknown metadata on all actions', () => {
    const actions = [
      workTreeReserveRepeatUseAction,
      workTreeFinalizeRepeatUseAction,
      workTreeReconcileRepeatUseAction,
      workTreeInspectRepeatUseAction,
    ]
    expect(actions.map((action) => action.id)).toEqual([
      'workTree.reserveRepeatUse',
      'workTree.finalizeRepeatUse',
      'workTree.reconcileRepeatUse',
      'workTree.inspectRepeatUse',
    ])
    for (const action of actions) {
      expect(action.surfaces).toContain('agentJson')
      expect(action.invocationContract.authorityRequirement).toBe('principal')
      expect(action.boundaries.length).toBeGreaterThan(0)
      expect(action.outputSchema).toBeDefined()
    }
    expect(workTreeInspectRepeatUseAction.readOnly).toBe(true)
    expect(workTreeReserveRepeatUseAction.effect.spendExposure).toBe('bounded')
    expect(workTreeFinalizeRepeatUseAction.invocationContract.retryClass).toBe('reconcile_before_retry')
  })
  it('projects a paid reserve gate refusal from the source as typed output', async () => {
    sourceMocks.callSourceMutation.mockResolvedValue({
      kind: 'refused',
      reason: 'live_money_gate_open',
    })

    await expect(reserveRepeatUseThroughSource(reserveInput)).resolves.toEqual({
      kind: 'refused',
      reason: 'live_money_gate_open',
    })

    sourceMocks.callSourceMutation.mockResolvedValue({
      kind: 'refused',
      reason: 'stripe_setup_required',
    })
    await expect(reserveRepeatUseThroughSource(reserveInput)).resolves.toEqual({
      kind: 'refused',
      reason: 'stripe_setup_required',
    })
  })
})
