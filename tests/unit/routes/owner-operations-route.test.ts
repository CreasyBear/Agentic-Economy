import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  inventory: vi.fn(), lifecycle: vi.fn(), connections: vi.fn(), payouts: vi.fn(), publicStatus: vi.fn(), offboarding: vi.fn(),
}))

vi.mock('@/components/ae/offerings/owner-operations.functions', () => ({
  readOwnerOperationsInventoryServer: mocks.inventory,
  readOwnerOperationsLifecycleServer: mocks.lifecycle,
  readOwnerOperationsConnectionsSummaryServer: mocks.connections,
  readOwnerOperationsPayoutSummaryServer: mocks.payouts,
  readOwnerOperationsPublicStatusServer: mocks.publicStatus,
  readOwnerProviderOffboardingServer: mocks.offboarding,
}))
vi.mock('@/components/ae/offerings/AeOwnerOperationsWorkspace', () => ({ AeOwnerOperationsWorkspace: () => null }))
vi.mock('@/components/ae/offerings/AeOwnerOfferings', () => ({ AeOwnerOfferingsList: () => null }))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({ AeOperatorShell: () => null }))

import { Route } from '@/routes/_operator/owner.offerings'

describe('Operations route loader', () => {
  it('returns inventory without awaiting secondary reads', async () => {
    const inventory = { kind: 'available', supplier: { name: 'One' }, operations: [], projection: 'current' } as const
    mocks.inventory.mockResolvedValue(inventory)
    const never = new Promise<never>(() => undefined)
    mocks.lifecycle.mockReturnValue(never)
    mocks.connections.mockReturnValue(never)
    mocks.payouts.mockReturnValue(never)
    mocks.publicStatus.mockReturnValue(never)
    mocks.offboarding.mockReturnValue(never)

    const loader = Route.options.loader as () => Promise<Record<string, unknown>>
    const result = await loader()
    expect(result.inventory).toBe(inventory)
    expect(result.lifecycle).toBeInstanceOf(Promise)
    expect(mocks.lifecycle).toHaveBeenCalledTimes(1)
    expect(mocks.connections).toHaveBeenCalledTimes(1)
    expect(mocks.payouts).toHaveBeenCalledTimes(1)
    expect(mocks.publicStatus).toHaveBeenCalledTimes(1)
    expect(mocks.offboarding).toHaveBeenCalledTimes(1)
  })

  it('does not start secondary reads when inventory is unavailable', async () => {
    mocks.inventory.mockResolvedValue({ kind: 'unavailable' })
    mocks.lifecycle.mockReset()
    mocks.connections.mockReset()
    mocks.payouts.mockReset()
    mocks.publicStatus.mockReset()
    mocks.offboarding.mockReset()
    const loader = Route.options.loader as () => Promise<Record<string, unknown>>
    await expect(loader()).resolves.toEqual({ inventory: { kind: 'unavailable' } })
    expect(mocks.lifecycle).not.toHaveBeenCalled()
    expect(mocks.connections).not.toHaveBeenCalled()
  })
})
