// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => ({
  earnings: vi.fn(),
  connect: vi.fn(),
  identity: vi.fn(),
  rename: vi.fn(),
  invalidate: vi.fn(async () => undefined),
  capture: vi.fn(),
}))

const tokens = vi.hoisted(() => ({
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
      result.current.openEarnings()
      result.current.openIdentity()
      result.current.loadEarnings()
      result.current.loadIdentity()
    })
    expect(calls.earnings).not.toHaveBeenCalled()
    expect(calls.connect).not.toHaveBeenCalled()
    expect(calls.identity).not.toHaveBeenCalled()
    expect(result.current.earningsOpen).toBe(false)
    expect(result.current.identityOpen).toBe(false)
  })

  it('loads earnings and identity details only once until retry', async () => {
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'P', slug: 'p', publicStatus: 'published' })
    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    act(() => result.current.openEarnings())
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    expect(calls.connect).not.toHaveBeenCalled()
    act(() => result.current.openEarnings())
    expect(calls.earnings).toHaveBeenCalledTimes(1)
    act(() => result.current.openIdentity())
    await waitFor(() => expect(calls.identity).toHaveBeenCalledTimes(1))
    act(() => result.current.openIdentity())
    expect(calls.identity).toHaveBeenCalledTimes(1)
  })

  it('retries earnings readback after failure without repeated automatic fetches', async () => {
    calls.earnings.mockRejectedValueOnce(new Error('earnings down'))
    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    act(() => result.current.openEarnings())
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    act(() => result.current.openEarnings())
    expect(calls.earnings).toHaveBeenCalledTimes(1)
    calls.earnings.mockResolvedValueOnce({ kind: 'available', businessId: 'biz:one', obligations: [], truncated: false, transfers: [], transfersTruncated: false })
    act(() => result.current.loadEarnings())
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.earningsDetail?.kind).toBe('available'))
  })

  it('opens earnings and identity from their URL state', async () => {
    calls.earnings.mockResolvedValue({ kind: 'not_found' })
    calls.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'P', slug: 'p', publicStatus: 'published' })
    routeState.location = { pathname: '/owner/operations', hash: 'earnings', search: { connect: 'return' } }
    const { rerender } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(1))
    routeState.location = { pathname: '/owner/operations', hash: 'provider-identity', search: {} }
    rerender()
    await waitFor(() => expect(calls.identity).toHaveBeenCalledTimes(1))
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

  it('refreshes on reopening and retains continuation context after a structured read failure', async () => {
    const row = { obligationRef: 'obligation:one', callRef: 'call:one', toolRef: 'tool:one', currency: 'USDC', exponent: 6, amountUnits: '1250000', state: 'settled', createdAt: 1 }
    const first = { kind: 'available', businessId: 'biz:one', obligations: [row], truncated: true, transfers: [], transfersTruncated: false, isDone: false, continueCursor: 'opaque:next' }
    calls.earnings.mockResolvedValueOnce(first)
    const { result } = renderHook(() => useProviderWorkspaceSheets({ enabled: true }))
    act(() => result.current.openEarnings())
    await waitFor(() => expect(result.current.earningsPending).toBe(false))
    expect(result.current.earningsReadAt).toEqual(expect.any(Number))
    calls.earnings.mockResolvedValueOnce({ kind: 'error', code: 'source_unavailable' })
    act(() => result.current.loadMoreEarnings())
    await waitFor(() => expect(result.current.earningsUnavailable).toBe(true))
    expect(result.current.earningsDetail).toEqual(first)
    expect(calls.earnings).toHaveBeenLastCalledWith({ data: { cursor: 'opaque:next' } })
    calls.earnings.mockResolvedValueOnce({ ...first, obligations: [row, { ...row, obligationRef: 'obligation:two' }], truncated: false, isDone: true, continueCursor: '' })
    act(() => result.current.retryEarnings())
    await waitFor(() => expect(result.current.earningsDetail?.kind === 'available' ? result.current.earningsDetail.obligations.length : 0).toBe(2))
    expect(calls.earnings).toHaveBeenLastCalledWith({ data: { cursor: 'opaque:next' } })
    calls.earnings.mockResolvedValueOnce(first)
    act(() => { result.current.closeEarnings(); result.current.openEarnings() })
    await waitFor(() => expect(calls.earnings).toHaveBeenCalledTimes(4))
    expect(calls.earnings).toHaveBeenLastCalledWith({ data: {} })
  })
})
