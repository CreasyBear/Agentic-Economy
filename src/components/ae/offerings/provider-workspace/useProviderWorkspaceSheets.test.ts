// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  connections: vi.fn(),
  earnings: vi.fn(),
  connect: vi.fn(),
  identity: vi.fn(),
  rename: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  capture: vi.fn(),
}))

const tokens = vi.hoisted(() => ({
  connections: Symbol('connections'),
  earnings: Symbol('earnings'),
  connect: Symbol('connect'),
  identity: Symbol('identity'),
  rename: Symbol('rename'),
}))

const routeState = vi.hoisted(() => ({
  location: { pathname: '/owner/operations', hash: '', search: {} as Record<string, unknown> },
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-start')>()),
  useServerFn: (token: symbol) => {
    if (token === tokens.connections) return calls.connections
    if (token === tokens.earnings) return calls.earnings
    if (token === tokens.connect) return calls.connect
    if (token === tokens.identity) return calls.identity
    if (token === tokens.rename) return calls.rename
    throw new Error('unexpected server fn token')
  },
}))

vi.mock('@tanstack/react-router', () => ({
  useLocation: () => routeState.location,
  useRouter: () => ({ invalidate: calls.invalidate }),
}))

vi.mock('@/components/ae/offerings/provider-workspace.functions', () => ({
  readProviderWorkspaceConnectionsDetailServer: tokens.connections,
  readProviderWorkspaceIdentityDetailServer: tokens.identity,
}))

vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  readOwnerProviderEarningsServer: tokens.earnings,
}))

vi.mock('@/modules/money/money.functions', () => ({
  readOwnerConnectReadinessServer: tokens.connect,
}))

vi.mock('@/lib/server/owner-workspace.functions', () => ({
  renameProviderDisplayNameServer: tokens.rename,
}))

vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: (...args: unknown[]) => calls.capture(...args),
}))

vi.mock('@/components/ae/offerings/provider-workspace-projection', () => ({
  focusSection: vi.fn(),
}))

import { focusSection } from '@/components/ae/offerings/provider-workspace-projection'
import { useProviderWorkspaceSheets } from './useProviderWorkspaceSheets'

afterEach(() => {
  for (const mock of Object.values(calls)) mock.mockReset()
  calls.invalidate.mockResolvedValue(undefined)
  routeState.location = { pathname: '/owner/operations', hash: '', search: {} }
  vi.mocked(focusSection).mockReset()
})

describe('useProviderWorkspaceSheets', () => {
  it('does not load or open when disabled', async () => {
    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: false }))

    act(() => {
      result.current.openConnections()
      result.current.openEarnings()
      result.current.openIdentity()
      result.current.loadConnections()
      result.current.loadEarnings()
      result.current.loadIdentity()
    })

    expect(calls.connections).not.toHaveBeenCalled()
    expect(calls.earnings).not.toHaveBeenCalled()
    expect(calls.connect).not.toHaveBeenCalled()
    expect(calls.identity).not.toHaveBeenCalled()
    expect(result.current.connectionsOpen).toBe(false)
    expect(result.current.earningsOpen).toBe(false)
    expect(result.current.identityOpen).toBe(false)
  })

  it('loads each detail only once until retry', async () => {
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    calls.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'P', slug: 'p', publicStatus: 'published' })

    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))

    act(() => {
      result.current.openConnections()
    })
    await waitFor(() => expect(calls.connections).toHaveBeenCalledTimes(1))
    act(() => {
      result.current.openConnections()
    })
    expect(calls.connections).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.openEarnings()
    })
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    act(() => {
      result.current.openEarnings()
    })
    expect(calls.earnings).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.openIdentity()
    })
    await waitFor(() => expect(calls.identity).toHaveBeenCalledTimes(1))
    act(() => {
      result.current.openIdentity()
    })
    expect(calls.identity).toHaveBeenCalledTimes(1)
  })

  it('suppresses refetch after connection and earnings failures until retry', async () => {
    calls.connections
      .mockRejectedValueOnce(new Error('connections down'))
      .mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    calls.earnings.mockRejectedValueOnce(new Error('earnings down'))
    calls.connect.mockResolvedValue({ kind: 'not_found' })

    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))

    act(() => result.current.openConnections())
    await waitFor(() => expect(result.current.connectionsDetail).toEqual({ kind: 'unavailable' }))
    act(() => result.current.openConnections())
    expect(calls.connections).toHaveBeenCalledTimes(1)

    act(() => result.current.loadConnections())
    await waitFor(() => expect(calls.connections).toHaveBeenCalledTimes(2))

    act(() => result.current.openEarnings())
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    act(() => result.current.openEarnings())
    expect(calls.earnings).toHaveBeenCalledTimes(1)

    act(() => result.current.loadEarnings())
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(2))
  })

  it('opens sections from hash and connect search branches', async () => {
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.connect.mockResolvedValue({ kind: 'not_found' })
    calls.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'P', slug: 'p', publicStatus: 'published' })

    routeState.location.hash = 'provider-connection-connection:one'
    const { rerender } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    await waitFor(() => expect(calls.connections).toHaveBeenCalledTimes(1))

    routeState.location = { pathname: '/owner/operations', hash: 'earnings', search: { connect: 'return' } }
    rerender()
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))

    routeState.location = { pathname: '/owner/operations', hash: 'provider-identity', search: {} }
    rerender()
    await waitFor(() => expect(calls.identity).toHaveBeenCalledTimes(1))
  })

  it('focuses provider connections when a hash target is missing', async () => {
    calls.connections.mockResolvedValue({ kind: 'available', businessId: 'biz:one', connections: [] })
    routeState.location.hash = 'provider-connection-missing'

    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    await waitFor(() => expect(result.current.connectionsOpen).toBe(true))
    await waitFor(() => expect(result.current.connectionTargetMissing).toBe(true))
    expect(focusSection).toHaveBeenCalledWith('provider-connections')
  })

  it('invalidates only when rename reports updated or unchanged', async () => {
    calls.rename.mockResolvedValueOnce({ kind: 'refused', code: 'unauthenticated' })
    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    await result.current.onRename({ businessId: 'biz:one', name: 'N', requestKey: 'req-key-12' })
    expect(calls.invalidate).not.toHaveBeenCalled()

    calls.rename.mockResolvedValueOnce({ kind: 'updated' })
    await result.current.onRename({ businessId: 'biz:one', name: 'N', requestKey: 'req-key-34' })
    expect(calls.invalidate).toHaveBeenCalledTimes(1)

    calls.rename.mockResolvedValueOnce({ kind: 'unchanged' })
    await result.current.onRename({ businessId: 'biz:one', name: 'N', requestKey: 'req-key-56' })
    expect(calls.invalidate).toHaveBeenCalledTimes(2)
  })
})
