import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  page: vi.fn(), connections: vi.fn(), payouts: vi.fn(), publicStatus: vi.fn(), offboarding: vi.fn(),
}))

vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  readProviderWorkspacePageServer: mocks.page,
  readProviderWorkspaceConnectionsSummaryServer: mocks.connections,
  readProviderWorkspacePayoutSummaryServer: mocks.payouts,
  readProviderWorkspacePublicStatusServer: mocks.publicStatus,
  readOwnerProviderOffboardingServer: mocks.offboarding,
}))
vi.mock('@/components/ae/offerings/AeProviderWorkspace', () => ({ AeProviderWorkspace: () => null }))
vi.mock('@/components/ae/offerings/AeOwnerOfferings', () => ({ AeOwnerOfferingsList: () => null }))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({ AeOperatorShell: () => null }))

import { Route } from '@/routes/_operator/owner.offerings'
import { Route as LegacyDetailRoute } from '@/routes/_operator/owner.offerings.$offeringRef'

describe('Operations route loader', () => {
  it('redirects the retired hand-written editor URL to canonical Provider Operation status', () => {
    const beforeLoad = LegacyDetailRoute.options.beforeLoad as (input: {
      params: { offeringRef: string }
    }) => never

    expect(() => beforeLoad({ params: { offeringRef: 'offering:one' } })).toThrow(
      expect.objectContaining({
        options: expect.objectContaining({
          to: '/owner/supply/$offeringRef',
          params: { offeringRef: 'offering:one' },
          replace: true,
        }),
      }),
    )
  })

  it('returns one canonical Operation page without awaiting secondary reads', async () => {
    const inventory = { kind: 'available', supplier: { name: 'One' }, operations: [], projection: 'current', isDone: true, continueCursor: '' } as const
    const lifecycle = { kind: 'available', value: [] } as const
    mocks.page.mockResolvedValue({ inventory, lifecycle })
    const never = new Promise<never>(() => undefined)
    mocks.connections.mockReturnValue(never)
    mocks.payouts.mockReturnValue(never)
    mocks.publicStatus.mockReturnValue(never)
    mocks.offboarding.mockReturnValue(never)

    const loader = Route.options.loader as (input: { deps: { cursor?: string } }) => Promise<Record<string, unknown>>
    const result = await loader({ deps: { cursor: 'cursor:one' } })
    expect(result.inventory).toBe(inventory)
    expect(result.lifecycle).toBeInstanceOf(Promise)
    expect(mocks.page).toHaveBeenCalledWith({ data: { cursor: 'cursor:one' } })
    expect(mocks.connections).toHaveBeenCalledTimes(1)
    expect(mocks.payouts).toHaveBeenCalledTimes(1)
    expect(mocks.publicStatus).toHaveBeenCalledTimes(1)
    expect(mocks.offboarding).toHaveBeenCalledTimes(1)
  })

  it('does not start secondary reads when inventory is unavailable', async () => {
    mocks.page.mockResolvedValue({ inventory: { kind: 'unavailable' } })
    mocks.connections.mockReset()
    mocks.payouts.mockReset()
    mocks.publicStatus.mockReset()
    mocks.offboarding.mockReset()
    const loader = Route.options.loader as (input: { deps: { cursor?: string } }) => Promise<Record<string, unknown>>
    await expect(loader({ deps: {} })).resolves.toEqual({ inventory: { kind: 'unavailable' } })
    expect(mocks.connections).not.toHaveBeenCalled()
  })
})
